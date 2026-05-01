-- Migration 206: RPC categorizar_lancamento(id, categoria, dados_categoria)
--
-- Move o lancamento de pendente -> completo. So funciona se estado atual
-- for 'pendente' ou 'em_preenchimento' (legado). Usa FOR UPDATE para
-- evitar race quando dois operadores tentam categorizar simultaneamente.

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

GRANT EXECUTE ON FUNCTION public.categorizar_lancamento(uuid, categoria_lancamento, jsonb) TO authenticated;

COMMENT ON FUNCTION public.categorizar_lancamento(uuid, categoria_lancamento, jsonb) IS
  'Transiciona lancamento pendente -> completo aplicando categoria e dados_categoria. Falha se estado nao for pendente.';