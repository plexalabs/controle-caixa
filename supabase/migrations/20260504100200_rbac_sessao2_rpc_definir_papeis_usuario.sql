-- ============================================================
-- CP-RBAC Sessao 2: migra definir_papeis_usuario para tem_permissao()
--
-- ANTES: exigia papel='admin' AND ativo=true
-- DEPOIS: exige tem_permissao('usuario.atribuir_perfil')
--
-- IMPACTO: admin RBAC NAO tem essa permissao por desenho. Operador
-- atual (super_admin) bypassa. Admins futuros precisarao de override
-- ou perfil customizado.
--
-- A logica de auto-protecao (impedir admin de remover proprio papel
-- admin) eh PRESERVADA: o check usa o array de papeis informado,
-- independente do RBAC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.definir_papeis_usuario(p_user_id uuid, p_papeis text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin_atual uuid := auth.uid();
  v_papel       text;
BEGIN
  IF v_admin_atual IS NULL THEN
    RAISE EXCEPTION 'Sessão sem usuário autenticado.' USING ERRCODE = '42501';
  END IF;

  -- Permissao: usuario.atribuir_perfil (substitui check papel='admin')
  IF NOT public.tem_permissao(v_admin_atual, 'usuario.atribuir_perfil') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF p_papeis IS NULL OR array_length(p_papeis, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um papel.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_user_id = v_admin_atual AND NOT ('admin' = ANY(p_papeis)) THEN
    RAISE EXCEPTION 'Você não pode remover seu próprio papel de administrador. Peça para outro admin fazer isso.'
      USING ERRCODE = 'check_violation';
  END IF;

  FOREACH v_papel IN ARRAY p_papeis LOOP
    IF v_papel NOT IN ('admin', 'operador') THEN
      RAISE EXCEPTION 'Papel inválido: %. Use admin ou operador.', v_papel
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  UPDATE public.usuario_papel
     SET ativo = false
   WHERE usuario_id = p_user_id AND ativo = true;

  FOREACH v_papel IN ARRAY p_papeis LOOP
    INSERT INTO public.usuario_papel (usuario_id, papel, ativo, concedido_por, concedido_em)
    VALUES (p_user_id, v_papel, true, v_admin_atual, now())
    ON CONFLICT (usuario_id, papel)
    DO UPDATE SET
      ativo = true,
      concedido_por = v_admin_atual,
      concedido_em = now();
  END LOOP;
END;
$function$;
