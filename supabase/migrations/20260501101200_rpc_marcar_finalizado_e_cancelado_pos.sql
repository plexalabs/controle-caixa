-- Migration 207: RPCs marcar_finalizado e marcar_cancelado_pos
--
-- Transicao de completo -> {finalizado | cancelado_pos}. Cada uma cria
-- automaticamente uma observacao com fonte adequada (registro de
-- auditoria do ato). Falha se estado atual nao for completo.

-- ── 2C. marcar_finalizado ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_finalizado(p_lancamento_id uuid)
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

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_lanc.estado <> 'completo' THEN
    RAISE EXCEPTION 'Só lançamentos completos podem ser finalizados. Estado atual: %.', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lancamento
     SET estado         = 'finalizado',
         resolvido_em   = now(),
         resolvido_por  = auth.uid(),
         atualizado_por = auth.uid()
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  -- Observacao automatica de auditoria
  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, 'Lançamento marcado como finalizado.', auth.uid(), 'finalizar');

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_finalizado(uuid) TO authenticated;

COMMENT ON FUNCTION public.marcar_finalizado(uuid) IS
  'Transiciona lancamento completo -> finalizado e registra observacao automatica.';

-- ── 2D. marcar_cancelado_pos ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_cancelado_pos(
  p_lancamento_id uuid,
  p_motivo        text
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
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mínimo 5 caracteres).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado.', p_lancamento_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_lanc.estado <> 'completo' THEN
    RAISE EXCEPTION 'Só lançamentos completos podem ser cancelados pós-pagamento. Estado atual: %.', v_lanc.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lancamento
     SET estado         = 'cancelado_pos',
         atualizado_por = auth.uid()
   WHERE id = p_lancamento_id
   RETURNING * INTO v_lanc;

  INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, fonte)
  VALUES (p_lancamento_id, 'Cancelado pós-pagamento. Motivo: ' || trim(p_motivo), auth.uid(), 'cancelar_pos');

  RETURN v_lanc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_cancelado_pos(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.marcar_cancelado_pos(uuid, text) IS
  'Transiciona lancamento completo -> cancelado_pos com motivo (>=5 chars). Cria observacao automatica.';
