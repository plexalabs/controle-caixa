-- Migration 016: ao inserir/atualizar lancamento, atualiza cliente_cache para autocomplete.
-- O cache não é fonte da verdade — é usado apenas pela UI (Excel coluna D, Web modal).

CREATE OR REPLACE FUNCTION public.fn_atualizar_cliente_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Não cachear cancelados/excluídos (não são padrões úteis para autocomplete).
    IF NEW.estado IN ('cancelado', 'excluido') THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.cliente_cache (
        codigo_pedido, cliente_nome, valor_nf_ultimo, ultima_vez_visto
    )
    VALUES (NEW.codigo_pedido, NEW.cliente_nome, NEW.valor_nf, now())
    ON CONFLICT (codigo_pedido) DO UPDATE SET
        cliente_nome     = EXCLUDED.cliente_nome,
        valor_nf_ultimo  = EXCLUDED.valor_nf_ultimo,
        ultima_vez_visto = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_cache_cliente ON public.lancamento;
CREATE TRIGGER trg_lancamento_cache_cliente
    AFTER INSERT OR UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_cliente_cache();
