-- CP6-FIX 2D — fechar_caixa exige justificativa em fechamento retroativo
-- (data do caixa < hoje). Mantém a regra de pendencias (>= 20 chars).

CREATE OR REPLACE FUNCTION public.fechar_caixa(
  p_caixa_id      uuid,
  p_forcar        boolean DEFAULT false,
  p_justificativa text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pendentes int;
  v_estado    public.estado_caixa;
  v_data      date;
  v_justif    text := nullif(trim(coalesce(p_justificativa, '')), '');
BEGIN
  SELECT total_pendentes, estado, data
    INTO v_pendentes, v_estado, v_data
  FROM public.caixa WHERE id = p_caixa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado = 'fechado' THEN
    RAISE EXCEPTION 'Este caixa ja esta fechado.' USING ERRCODE = '22023';
  END IF;

  IF v_pendentes > 0 AND p_forcar = false THEN
    RAISE EXCEPTION
      'Existem % pendencias no caixa. Para fechar mesmo assim, marque a opcao de forcar fechamento.',
      v_pendentes
      USING ERRCODE = '22023', HINT = 'Use p_forcar=true junto de uma justificativa.';
  END IF;

  IF v_pendentes > 0
     AND (v_justif IS NULL OR length(v_justif) < 20) THEN
    RAISE EXCEPTION
      'Justificativa obrigatoria (>= 20 caracteres) ao forcar fechamento com pendencias.'
      USING ERRCODE = '22023';
  END IF;

  IF v_data < CURRENT_DATE
     AND (v_justif IS NULL OR length(v_justif) < 10) THEN
    RAISE EXCEPTION
      'Fechamento retroativo exige justificativa de pelo menos 10 caracteres.'
      USING ERRCODE = '22023', HINT = 'Registre o motivo do atraso no campo de divergencia.';
  END IF;

  UPDATE public.caixa
     SET estado                = 'fechado',
         fechado_em            = now(),
         fechado_por           = auth.uid(),
         observacao_fechamento = v_justif
   WHERE id = p_caixa_id;

  RETURN p_caixa_id;
END;
$$;

COMMENT ON FUNCTION public.fechar_caixa(uuid, boolean, text) IS
  'CP6 — fecha um caixa. Regras: (1) pendencias > 0 exige p_forcar + justif >= 20. '
  '(2) data do caixa < hoje (fechamento retroativo) exige justif >= 10. '
  'Grava em caixa.observacao_fechamento.';

GRANT EXECUTE ON FUNCTION public.fechar_caixa(uuid, boolean, text) TO authenticated;
