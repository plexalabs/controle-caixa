-- CP6.2B — fechar_caixa atualizada: grava em observacao_fechamento dedicada
-- (em vez de concatenar em observacoes), e padroniza o p_justificativa como
-- observacao formal de fechamento. Mantém a regra: forcar=true exigido se
-- houver pendencias.

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
BEGIN
  SELECT total_pendentes, estado INTO v_pendentes, v_estado
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
     AND (p_justificativa IS NULL OR length(trim(p_justificativa)) < 20) THEN
    RAISE EXCEPTION
      'Justificativa obrigatoria (>= 20 caracteres) ao forcar fechamento com pendencias.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.caixa
     SET estado                = 'fechado',
         fechado_em            = now(),
         fechado_por           = auth.uid(),
         observacao_fechamento = p_justificativa
   WHERE id = p_caixa_id;

  RETURN p_caixa_id;
END;
$$;

COMMENT ON FUNCTION public.fechar_caixa(uuid, boolean, text) IS
  'CP6 — fecha um caixa. Grava p_justificativa em caixa.observacao_fechamento '
  '(coluna dedicada, sem misturar com observacoes gerais). Bloqueia se '
  'pendentes > 0 a menos que p_forcar=true; nesse caso justificativa '
  'precisa ter >= 20 chars.';

GRANT EXECUTE ON FUNCTION public.fechar_caixa(uuid, boolean, text) TO authenticated;
