-- ============================================================
-- CP-RBAC Sessao 4: 5 RPCs para CRUD de perfis e permissoes
--
-- Todas as RPCs usam tem_permissao() para autorizacao (super_admin
-- bypassa). Permissoes especificas:
--   criar_perfil                       perfil.criar
--   atualizar_permissoes_perfil        perfil.editar_permissoes
--   deletar_perfil                     perfil.deletar
--   listar_perfis_com_detalhes         perfil.visualizar
--   listar_usuarios_afetados_por_perfil perfil.visualizar
--
-- Hoje (Sessao 1 seed) so super_admin tem todas as 4 perms de perfil.*.
-- Demais perfis nao tem nenhuma -- por desenho. UI e RPC concordam.
-- ============================================================

-- ============================================================
-- 1A. criar_perfil
-- Cria um perfil customizado (e_sistema=false) com permissoes iniciais.
-- ============================================================
CREATE OR REPLACE FUNCTION public.criar_perfil(
  p_codigo     text,
  p_nome       text,
  p_descricao  text,
  p_permissoes text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_perfil_id uuid;
  v_perm      text;
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'perfil.criar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  IF p_codigo IS NULL OR length(trim(p_codigo)) = 0 THEN
    RAISE EXCEPTION 'Codigo obrigatorio' USING ERRCODE = 'check_violation';
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome obrigatorio' USING ERRCODE = 'check_violation';
  END IF;
  IF p_codigo !~ '^[a-z_]+$' THEN
    RAISE EXCEPTION 'Codigo deve ser snake_case minusculo (ex: admin_pleno)'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.perfil (codigo, nome, descricao, e_sistema, criado_por, atualizado_por)
  VALUES (p_codigo, p_nome, p_descricao, false, auth.uid(), auth.uid())
  RETURNING id INTO v_perfil_id;

  IF p_permissoes IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissoes LOOP
      INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo, concedido_por)
      VALUES (v_perfil_id, v_perm, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_perfil_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_perfil(text, text, text, text[]) TO authenticated;

-- ============================================================
-- 1B. atualizar_permissoes_perfil
-- DELETE+INSERT atomico (LANGUAGE plpgsql -> implicit transaction).
-- ============================================================
CREATE OR REPLACE FUNCTION public.atualizar_permissoes_perfil(
  p_perfil_id  uuid,
  p_permissoes text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_perm text;
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'perfil.editar_permissoes') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.perfil WHERE id = p_perfil_id) THEN
    RAISE EXCEPTION 'Perfil nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.perfil_permissao WHERE perfil_id = p_perfil_id;

  IF p_permissoes IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissoes LOOP
      INSERT INTO public.perfil_permissao (perfil_id, permissao_codigo, concedido_por)
      VALUES (p_perfil_id, v_perm, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.perfil
     SET atualizado_em  = now(),
         atualizado_por = auth.uid()
   WHERE id = p_perfil_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_permissoes_perfil(uuid, text[]) TO authenticated;

-- ============================================================
-- 1C. deletar_perfil
-- Bloqueia delete de perfis e_sistema=true e perfis com usuarios atribuidos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.deletar_perfil(p_perfil_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_e_sistema      boolean;
  v_total_usuarios integer;
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'perfil.deletar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  SELECT e_sistema INTO v_e_sistema FROM public.perfil WHERE id = p_perfil_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_e_sistema THEN
    RAISE EXCEPTION 'Perfis de sistema nao podem ser deletados'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total_usuarios
    FROM public.usuario_perfil
   WHERE perfil_id = p_perfil_id;

  IF v_total_usuarios > 0 THEN
    RAISE EXCEPTION 'Perfil tem % usuario(s) atribuido(s). Reatribua antes de deletar.', v_total_usuarios
      USING ERRCODE = 'check_violation';
  END IF;

  -- ON DELETE CASCADE em perfil_permissao limpa as junctions automaticamente.
  DELETE FROM public.perfil WHERE id = p_perfil_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deletar_perfil(uuid) TO authenticated;

-- ============================================================
-- 1D. listar_perfis_com_detalhes
-- Lista todos com contadores agregados de permissoes e usuarios.
-- Ordena: e_sistema=true primeiro (admin/gerente/operador/vendedor/contador),
-- depois custom alfabetico.
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_perfis_com_detalhes()
RETURNS TABLE (
  id              uuid,
  codigo          text,
  nome            text,
  descricao       text,
  e_sistema       boolean,
  total_permissoes bigint,
  total_usuarios  bigint,
  criado_em       timestamptz,
  atualizado_em   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'perfil.visualizar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.codigo,
    p.nome,
    p.descricao,
    p.e_sistema,
    (SELECT count(*) FROM public.perfil_permissao WHERE perfil_id = p.id) AS total_permissoes,
    (SELECT count(*) FROM public.usuario_perfil    WHERE perfil_id = p.id) AS total_usuarios,
    p.criado_em,
    p.atualizado_em
  FROM public.perfil p
  ORDER BY p.e_sistema DESC, p.nome ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_perfis_com_detalhes() TO authenticated;

-- ============================================================
-- 1E. listar_usuarios_afetados_por_perfil
-- Pra UI mostrar antes de salvar mudanca em permissoes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.listar_usuarios_afetados_por_perfil(p_perfil_id uuid)
RETURNS TABLE (
  usuario_id     uuid,
  email          text,
  total_extras   bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'perfil.visualizar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (SELECT count(*) FROM public.usuario_permissao_extra WHERE usuario_id = u.id) AS total_extras
  FROM public.usuario_perfil up
  JOIN auth.users u ON u.id = up.usuario_id
  WHERE up.perfil_id = p_perfil_id
    AND u.deleted_at IS NULL
  ORDER BY u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_afetados_por_perfil(uuid) TO authenticated;
