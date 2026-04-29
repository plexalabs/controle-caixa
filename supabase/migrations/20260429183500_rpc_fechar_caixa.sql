-- Migration 035: RPC fechar_caixa.
-- Fecha o caixa apos validar pre-condicoes (RN-062). Permite forcar com justificativa.

CREATE OR REPLACE FUNCTION public.fechar_caixa(
    p_caixa_id      uuid,
    p_forcar        boolean DEFAULT false,
    p_justificativa text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pendentes int;
    v_estado    public.estado_caixa;
BEGIN
    SELECT total_pendentes, estado INTO v_pendentes, v_estado
    FROM public.caixa WHERE id = p_caixa_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caixa % nao encontrado', p_caixa_id;
    END IF;

    IF v_estado = 'fechado' THEN
        RAISE EXCEPTION 'Caixa ja esta fechado';
    END IF;

    IF v_pendentes > 0 AND p_forcar = false THEN
        RAISE EXCEPTION 'Caixa possui % pendencias em aberto. Resolva ou use p_forcar=true.', v_pendentes;
    END IF;

    IF v_pendentes > 0
       AND (p_justificativa IS NULL OR length(p_justificativa) < 20) THEN
        RAISE EXCEPTION 'Justificativa obrigatoria (>=20 chars) ao forcar fechamento com pendencias';
    END IF;

    UPDATE public.caixa
    SET estado      = 'fechado',
        fechado_em  = now(),
        fechado_por = auth.uid(),
        observacoes = COALESCE(observacoes, '') ||
                      E'\n[fechamento ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' ||
                      COALESCE(p_justificativa, 'sem pendencias')
    WHERE id = p_caixa_id;

    RETURN p_caixa_id;
END;
$$;

COMMENT ON FUNCTION public.fechar_caixa IS
'Fecha caixa. Bloqueado se ha pendencias, exceto com p_forcar+justificativa>=20 chars.';
