-- ============================================================
-- CP-FEAT-002: RPC reabrir_caixa
--
-- Reabre caixa fechado (estado fechado -> aberto). Exige permissao
-- caixa.reabrir_fechado e motivo >=10 chars. Preserva fechado_em e
-- fechado_por (auditavel: o historico de quem fechou e quando nao
-- some). Append em observacao_fechamento mantem trilha visivel.
--
-- super_admin via bypass de tem_permissao() (OR no inicio da funcao).
-- arquivado eh estado terminal: nao pode ser reaberto por aqui.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reabrir_caixa(
  p_caixa_id uuid,
  p_motivo   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_estado public.estado_caixa;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.tem_permissao(auth.uid(), 'caixa.reabrir_fechado') THEN
    RAISE EXCEPTION 'Permissão negada (caixa.reabrir_fechado).' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da reabertura é obrigatório (mínimo 10 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  SELECT estado INTO v_estado
  FROM public.caixa
  WHERE id = p_caixa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa % não encontrado.', p_caixa_id USING ERRCODE = 'P0002';
  END IF;
  IF v_estado = 'arquivado' THEN
    RAISE EXCEPTION 'Caixas arquivados não podem ser reabertos.' USING ERRCODE = '22023';
  END IF;
  IF v_estado <> 'fechado' THEN
    RAISE EXCEPTION 'Apenas caixas fechados podem ser reabertos. Estado atual: %.', v_estado
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.caixa
     SET estado                = 'aberto',
         observacao_fechamento = COALESCE(observacao_fechamento, '') ||
                                 E'\n[reabertura ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
                                 || ' por ' || auth.uid()::text || '] ' || v_motivo
   WHERE id = p_caixa_id;

  RETURN p_caixa_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reabrir_caixa(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reabrir_caixa(uuid, text) IS
  'Reabre caixa fechado (estado fechado -> aberto). Exige permissao caixa.reabrir_fechado e motivo >=10 chars. Preserva fechado_em/fechado_por; faz append em observacao_fechamento.';
