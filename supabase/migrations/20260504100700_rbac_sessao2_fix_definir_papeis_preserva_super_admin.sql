-- ============================================================
-- CP-RBAC Sessao 2 (FIX): proteger super_admin contra demote
-- silencioso pela UI antiga.
--
-- Bug encontrado durante validacao da Sessao 2: a RPC
-- definir_papeis_usuario fazia UPDATE ... SET ativo=false WHERE
-- usuario_id=X AND ativo=true ANTES de re-inserir os papeis do
-- array. Como a UI antiga (/configuracoes/usuarios) so conhece
-- ('admin','operador'), qualquer "Salvar" nessa tela desativava
-- silenciosamente super_admin.
--
-- Sequencia reproduzida em PROD:
--   1. Sessao 1 promoveu operador a super_admin
--   2. Operador usou /configuracoes/usuarios (validando algo)
--   3. UI chamou definir_papeis_usuario(uid, ['admin','operador'])
--   4. UPDATE inicial desativou TODOS, super_admin sumiu
--   5. Operador perdeu bypass total sem aviso
--
-- Workaround aplicado: o UPDATE ganha "AND papel != 'super_admin'"
-- pra preservar a flag super_admin. A re-insercao em loop continua
-- igual e nao mexe em super_admin (nao esta no array).
--
-- Fix definitivo: Sessao 4/5 reescreve a tela + RPC pra ser ciente
-- de super_admin (ou ignora-lo na lista de papeis "gerenciaveis pela
-- UI", ou exige super_admin pra alterar super_admin alheio).
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

  -- ATENCAO: super_admin e preservado neste UPDATE para evitar demote
  -- silencioso pela UI antiga (/configuracoes/usuarios). Sessao 5 do
  -- RBAC vai reescrever a tela e a logica de atribuicao para tratar
  -- super_admin de forma explicita.
  UPDATE public.usuario_papel
     SET ativo = false
   WHERE usuario_id = p_user_id
     AND ativo = true
     AND papel != 'super_admin';

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
