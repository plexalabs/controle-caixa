-- Migration 010: trigger BEFORE UPDATE atualiza atualizado_em, atualizado_por, versao.
-- Aplicado em lancamento, caixa, vendedora, config (qualquer tabela com esses campos).

CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.atualizado_em = now();
    -- auth.uid() pode ser NULL em chamadas via service_role/edge function:
    -- nesse caso preserva o OLD.atualizado_por para nao perder autoria.
    IF auth.uid() IS NOT NULL THEN
        IF TG_TABLE_NAME = 'lancamento' THEN
            NEW.atualizado_por = auth.uid();
        END IF;
    END IF;
    -- versao incremental para sincronia (apenas em lancamento).
    IF TG_TABLE_NAME = 'lancamento' THEN
        NEW.versao = COALESCE(OLD.versao, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_atualizar_ts ON public.lancamento;
CREATE TRIGGER trg_lancamento_atualizar_ts
    BEFORE UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_caixa_atualizar_ts ON public.caixa;
CREATE TRIGGER trg_caixa_atualizar_ts
    BEFORE UPDATE ON public.caixa
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_vendedora_atualizar_ts ON public.vendedora;
CREATE TRIGGER trg_vendedora_atualizar_ts
    BEFORE UPDATE ON public.vendedora
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_config_atualizar_ts ON public.config;
CREATE TRIGGER trg_config_atualizar_ts
    BEFORE UPDATE ON public.config
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();
