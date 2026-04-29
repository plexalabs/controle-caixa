-- Migration 011: trigger que recalcula caches em caixa após mutação em lancamento.
-- Mantém total_lancamentos, total_pendentes, total_valor sempre atualizados.

CREATE OR REPLACE FUNCTION public.fn_recalcular_caixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- precisa para tocar caixa mesmo com RLS ligado depois.
SET search_path = public, pg_temp
AS $$
DECLARE
    cx_id uuid;
BEGIN
    cx_id := COALESCE(NEW.caixa_id, OLD.caixa_id);

    UPDATE public.caixa
    SET
        total_lancamentos = (
            SELECT COUNT(*) FROM public.lancamento
            WHERE caixa_id = cx_id AND estado <> 'excluido'
        ),
        total_pendentes = (
            SELECT COUNT(*) FROM public.lancamento
            WHERE caixa_id = cx_id AND estado IN ('pendente','em_preenchimento')
        ),
        total_valor = (
            SELECT COALESCE(SUM(valor_nf), 0) FROM public.lancamento
            WHERE caixa_id = cx_id AND estado NOT IN ('cancelado','excluido')
        ),
        atualizado_em = now()
    WHERE id = cx_id;

    -- Se moveu de caixa (raríssimo), recalcula o caixa antigo também.
    IF TG_OP = 'UPDATE' AND OLD.caixa_id IS DISTINCT FROM NEW.caixa_id THEN
        UPDATE public.caixa
        SET
            total_lancamentos = (
                SELECT COUNT(*) FROM public.lancamento
                WHERE caixa_id = OLD.caixa_id AND estado <> 'excluido'
            ),
            total_pendentes = (
                SELECT COUNT(*) FROM public.lancamento
                WHERE caixa_id = OLD.caixa_id AND estado IN ('pendente','em_preenchimento')
            ),
            total_valor = (
                SELECT COALESCE(SUM(valor_nf), 0) FROM public.lancamento
                WHERE caixa_id = OLD.caixa_id AND estado NOT IN ('cancelado','excluido')
            ),
            atualizado_em = now()
        WHERE id = OLD.caixa_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_recalcular_caixa ON public.lancamento;
CREATE TRIGGER trg_lancamento_recalcular_caixa
    AFTER INSERT OR UPDATE OR DELETE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_recalcular_caixa();
