-- ============================================================
-- OBS-RES: RPC resolver_obs_lancamento(id, categoria_nova, dados, devolutiva)
--
-- Diferente de editar_lancamento:
--   * SEM janela de 30 minutos (resolver OBS pode acontecer dias depois)
--   * Aceita apenas lancamentos com categoria_atual = 'obs'
--   * Devolutiva obrigatoria (>= 10 chars) — fica registrada como
--     lancamento_observacao com fonte='resolucao_obs' contando como
--     foi resolvido o problema original
--   * Reusa permissao lancamento.editar_categoria
--   * Bypass via session_replication_role=replica (trigger trava
--     campos imutaveis pos-categorizacao — neste caso e legitimo)
--
-- Auditoria via trigger fn_audit_row registra como UPDATE + motivo
-- (set_config app.motivo).
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolver_obs_lancamento(
  p_lancamento_id  uuid,
  p_categoria_nova public.categoria_lancamento,
  p_dados          jsonb,
  p_devolutiva     text
) RETURNS public.lancamento
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_lanc      public.lancamento;
  v_devolutiva text := nullif(trim(coalesce(p_devolutiva, '')), '');
  v_obs_texto text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao nao autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(v_uid, 'lancamento.editar_categoria') THEN
    RAISE EXCEPTION 'Permissao negada (lancamento.editar_categoria).' USING ERRCODE = '42501';
  END IF;
  IF v_devolutiva IS NULL OR length(v_devolutiva) < 10 THEN
    RAISE EXCEPTION 'Devolutiva e obrigatoria (minimo 10 caracteres) — descreva como o problema da OBS foi resolvido.'
      USING ERRCODE = '22023';
  END IF;
  IF p_categoria_nova IS NULL THEN
    RAISE EXCEPTION 'Nova categoria obrigatoria.' USING ERRCODE = '22023';
  END IF;
  IF p_categoria_nova = 'obs'::public.categoria_lancamento THEN
    RAISE EXCEPTION 'Nova categoria nao pode ser obs (esta e a resolucao da OBS).'
      USING ERRCODE = '22023';
  END IF;

  -- Propaga motivo pra trigger fn_audit_row
  PERFORM set_config('app.motivo', v_devolutiva, true);

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado.', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lanc.categoria IS DISTINCT FROM 'obs'::public.categoria_lancamento THEN
    RAISE EXCEPTION 'Esta RPC so resolve lancamentos com categoria=obs. Categoria atual: %.', v_lanc.categoria
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_lanc.estado IN ('excluido') THEN
    RAISE EXCEPTION 'Lancamento esta excluido — nao pode resolver.' USING ERRCODE = 'check_violation';
  END IF;

  -- Bypass trigger fn_lancamento_travar_pos_categoria pra alterar
  -- categoria + dados_categoria mesmo em estado completo/finalizado.
  SET LOCAL session_replication_role = replica;

  UPDATE public.lancamento
     SET categoria       = p_categoria_nova,
         dados_categoria = COALESCE(p_dados, dados_categoria),
         atualizado_por  = v_uid
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  SET LOCAL session_replication_role = origin;

  -- Observacao com fonte=resolucao_obs documentando a devolutiva
  v_obs_texto := 'Resolucao OBS. Nova categoria: ' || p_categoria_nova
                 || E'. Devolutiva: ' || v_devolutiva;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, v_obs_texto, v_uid, 'resolucao_obs');

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_obs_lancamento(uuid, public.categoria_lancamento, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.resolver_obs_lancamento(uuid, public.categoria_lancamento, jsonb, text) IS
  'OBS-RES: Converte lancamento categoria=obs em categoria definitiva sem janela de 30min. Devolutiva obrigatoria (>=10c) vai pra lancamento_observacao fonte=resolucao_obs. Reusa permissao lancamento.editar_categoria.';
