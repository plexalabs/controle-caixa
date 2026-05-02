-- CP7.1 — RPC definir_papeis_usuario com auto-proteção
--
-- Substitui os papéis ATIVOS de um usuário pelo array fornecido. Linhas
-- existentes desativam (ativo=false) e novas linhas inserem ou reativam.
-- Soft-delete preserva o histórico (quem teve qual papel, quando).
--
-- Auto-proteção crítica:
--   * Admin não pode remover o próprio papel admin (evita lock-out total)
--   * Apenas admins podem alterar papéis (defesa em profundidade)
--   * Apenas papéis 'admin' e 'operador' são aceitos pela UI; CHECK do banco
--     ainda permite supervisor/auditor (compat com convenção antiga), mas
--     a RPC rejeita para manter o modelo simples do CP7.

CREATE OR REPLACE FUNCTION public.definir_papeis_usuario(
  p_user_id uuid,
  p_papeis  text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_atual uuid := auth.uid();
  v_papel       text;
BEGIN
  IF v_admin_atual IS NULL THEN
    RAISE EXCEPTION 'Sessão sem usuário autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_papel
     WHERE usuario_id = v_admin_atual AND papel = 'admin' AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF p_papeis IS NULL OR array_length(p_papeis, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um papel.' USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-proteção: admin não pode remover o próprio papel admin.
  IF p_user_id = v_admin_atual AND NOT ('admin' = ANY(p_papeis)) THEN
    RAISE EXCEPTION 'Você não pode remover seu próprio papel de administrador. Peça para outro admin fazer isso.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validação de papéis válidos.
  FOREACH v_papel IN ARRAY p_papeis LOOP
    IF v_papel NOT IN ('admin', 'operador') THEN
      RAISE EXCEPTION 'Papel inválido: %. Use admin ou operador.', v_papel
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Desativa todos os papéis ativos atuais.
  UPDATE public.usuario_papel
     SET ativo = false
   WHERE usuario_id = p_user_id AND ativo = true;

  -- Reativa ou insere os novos. ON CONFLICT cobre o caso "papel já existia
  -- inativo" — só vira ativo de novo, sem duplicar linha.
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
$$;

GRANT EXECUTE ON FUNCTION public.definir_papeis_usuario(uuid, text[]) TO authenticated;
