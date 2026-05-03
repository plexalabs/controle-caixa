-- ============================================================
-- CP-RBAC Sessao 5 (FINAL): 7 RPCs para gestao de usuarios via RBAC
--
-- Substitui o fluxo legacy de "papel" (definir_papeis_usuario) por
-- atribuicao de PERFIL principal + permissoes EXTRAS pontuais. O papel
-- super_admin continua existindo (nao e perfil), mas agora se gerencia
-- via RPCs dedicadas com guards anti-lockout.
--
-- Permissoes:
--   atribuir_perfil_usuario          -> usuario.atribuir_perfil
--   conceder_permissao_extra         -> usuario.conceder_extra
--   revogar_permissao_extra          -> usuario.conceder_extra
--   promover_super_admin             -> super_admin only (papel)
--   revogar_super_admin              -> super_admin only (papel)
--   listar_usuarios_com_perfis_e_extras -> usuario.visualizar
--   listar_extras_de_usuario         -> usuario.visualizar
-- ============================================================

-- 1A. atribuir_perfil_usuario --------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuir_perfil_usuario(
  p_usuario_id uuid,
  p_perfil_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'usuario.atribuir_perfil') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.perfil WHERE id = p_perfil_id) THEN
    RAISE EXCEPTION 'Perfil nao encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_usuario_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuario nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- PK em usuario_perfil(usuario_id) garante 1 perfil principal por user.
  INSERT INTO public.usuario_perfil (usuario_id, perfil_id, atribuido_por)
  VALUES (p_usuario_id, p_perfil_id, auth.uid())
  ON CONFLICT (usuario_id) DO UPDATE
    SET perfil_id     = EXCLUDED.perfil_id,
        atribuido_em  = now(),
        atribuido_por = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.atribuir_perfil_usuario(uuid, uuid) TO authenticated;

-- 1B. conceder_permissao_extra ------------------------------------------
CREATE OR REPLACE FUNCTION public.conceder_permissao_extra(
  p_usuario_id uuid,
  p_codigo     text,
  p_motivo     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'usuario.conceder_extra') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'Motivo obrigatorio (minimo 10 caracteres)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissao WHERE codigo = p_codigo) THEN
    RAISE EXCEPTION 'Permissao nao encontrada no catalogo' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_usuario_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuario nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.usuario_permissao_extra (usuario_id, permissao_codigo, concedido_por, motivo)
  VALUES (p_usuario_id, p_codigo, auth.uid(), p_motivo)
  ON CONFLICT (usuario_id, permissao_codigo) DO UPDATE
    SET concedido_em  = now(),
        concedido_por = auth.uid(),
        motivo        = EXCLUDED.motivo;
END;
$$;
GRANT EXECUTE ON FUNCTION public.conceder_permissao_extra(uuid, text, text) TO authenticated;

-- 1C. revogar_permissao_extra -------------------------------------------
CREATE OR REPLACE FUNCTION public.revogar_permissao_extra(
  p_usuario_id uuid,
  p_codigo     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'usuario.conceder_extra') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.usuario_permissao_extra
   WHERE usuario_id = p_usuario_id
     AND permissao_codigo = p_codigo;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revogar_permissao_extra(uuid, text) TO authenticated;

-- 1D. promover_super_admin ----------------------------------------------
-- Nao usa tem_permissao() de proposito: super_admin e papel especial,
-- so super_admin existente promove outro.
CREATE OR REPLACE FUNCTION public.promover_super_admin(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_papel
     WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Apenas super_admin pode promover outro super_admin'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_usuario_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuario nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.usuario_papel (usuario_id, papel, ativo, concedido_por, concedido_em)
  VALUES (p_usuario_id, 'super_admin', true, auth.uid(), now())
  ON CONFLICT (usuario_id, papel) DO UPDATE
    SET ativo         = true,
        concedido_em  = now(),
        concedido_por = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.promover_super_admin(uuid) TO authenticated;

-- 1E. revogar_super_admin (com guards anti-lockout) ---------------------
CREATE OR REPLACE FUNCTION public.revogar_super_admin(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_total_super_admins integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_papel
     WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Apenas super_admin pode revogar super_admin'
      USING ERRCODE = '42501';
  END IF;

  -- Anti-lockout 1: nao revoga a si mesmo
  IF p_usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'Voce nao pode revogar seu proprio super_admin (peca para outro super_admin)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Anti-lockout 2: sistema sempre com >=1 super_admin ativo
  SELECT count(*) INTO v_total_super_admins
    FROM public.usuario_papel
   WHERE papel = 'super_admin' AND ativo = true;

  IF v_total_super_admins <= 1 THEN
    RAISE EXCEPTION 'Sistema precisa ter pelo menos 1 super_admin ativo'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.usuario_papel
     SET ativo = false
   WHERE usuario_id = p_usuario_id AND papel = 'super_admin';
END;
$$;
GRANT EXECUTE ON FUNCTION public.revogar_super_admin(uuid) TO authenticated;

-- 1F. listar_usuarios_com_perfis_e_extras -------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarios_com_perfis_e_extras()
RETURNS TABLE (
  usuario_id     uuid,
  email          text,
  e_super_admin  boolean,
  perfil_id      uuid,
  perfil_codigo  text,
  perfil_nome    text,
  total_extras   bigint,
  criado_em      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'usuario.visualizar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    EXISTS (
      SELECT 1 FROM public.usuario_papel
       WHERE usuario_id = u.id AND papel = 'super_admin' AND ativo = true
    ) AS e_super_admin,
    p.id,
    p.codigo,
    p.nome,
    (SELECT count(*) FROM public.usuario_permissao_extra WHERE usuario_id = u.id) AS total_extras,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.usuario_perfil up ON up.usuario_id = u.id
  LEFT JOIN public.perfil p          ON p.id = up.perfil_id
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_com_perfis_e_extras() TO authenticated;

-- 1G. listar_extras_de_usuario ------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_extras_de_usuario(p_usuario_id uuid)
RETURNS TABLE (
  permissao_codigo     text,
  modulo               text,
  descricao            text,
  motivo               text,
  concedido_em         timestamptz,
  concedido_por_email  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.tem_permissao(auth.uid(), 'usuario.visualizar') THEN
    RAISE EXCEPTION 'Permissao negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    upe.permissao_codigo::text,
    p.modulo,
    p.descricao,
    upe.motivo,
    upe.concedido_em,
    u.email::text
  FROM public.usuario_permissao_extra upe
  JOIN public.permissao p ON p.codigo = upe.permissao_codigo
  LEFT JOIN auth.users u  ON u.id = upe.concedido_por
  WHERE upe.usuario_id = p_usuario_id
  ORDER BY p.modulo ASC, upe.permissao_codigo ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.listar_extras_de_usuario(uuid) TO authenticated;
