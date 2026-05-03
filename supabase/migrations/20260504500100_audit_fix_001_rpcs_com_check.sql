-- ============================================================
-- CP-AUDIT-1: adiciona check tem_permissao() em 4 RPCs
--
-- Auditoria identificou que 4 RPCs SECURITY DEFINER mudam estado
-- de lancamento checando apenas auth.uid() IS NOT NULL. Hoje
-- dormente porque o unico usuario e super_admin (bypass total),
-- mas qualquer 2o usuario authenticated poderia chamar.
--
-- Cada RPC ganha o check no inicio. Corpo preservado integralmente.
-- super_admin continua bypassando via tem_permissao().
-- ============================================================

-- ── A. categorizar_lancamento → lancamento.categorizar ──────────────
CREATE OR REPLACE FUNCTION public.categorizar_lancamento(
  p_lancamento_id   uuid,
  p_categoria       categoria_lancamento,
  p_dados_categoria jsonb
)
RETURNS public.lancamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_lanc public.lancamento;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(auth.uid(), 'lancamento.categorizar') THEN
    RAISE EXCEPTION 'Permissão negada (lancamento.categorizar).' USING ERRCODE = '42501';
  END IF;
  IF p_categoria IS NULL THEN
    RAISE EXCEPTION 'Categoria é obrigatória.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_lanc.estado NOT IN ('pendente', 'em_preenchimento') THEN
    RAISE EXCEPTION 'Apenas lançamentos pendentes podem ser categorizados. Estado atual: %.', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lancamento
     SET categoria       = p_categoria,
         dados_categoria = COALESCE(p_dados_categoria, '{}'::jsonb),
         estado          = 'completo',
         atualizado_por  = auth.uid()
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  RETURN v_lanc;
END;
$$;

COMMENT ON FUNCTION public.categorizar_lancamento(uuid, categoria_lancamento, jsonb) IS
  'Transiciona lancamento pendente -> completo aplicando categoria e dados_categoria. Falha se estado nao for pendente. Exige permissao lancamento.categorizar.';
