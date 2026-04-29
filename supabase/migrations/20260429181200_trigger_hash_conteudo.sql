-- Migration 012: trigger BEFORE INSERT/UPDATE calcula SHA-256 dos campos críticos.
-- Detecta corrupção em sincronia entre Excel ↔ Supabase ↔ Web (docs/05 §3.1).

CREATE OR REPLACE FUNCTION public.fn_calcular_hash_conteudo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.hash_conteudo := encode(
        digest(
            COALESCE(NEW.numero_nf, '') || '|' ||
            COALESCE(NEW.codigo_pedido, '') || '|' ||
            COALESCE(NEW.valor_nf::text, '') || '|' ||
            COALESCE(NEW.categoria::text, '') || '|' ||
            COALESCE(NEW.estado::text, '') || '|' ||
            COALESCE(NEW.dados_categoria::text, '{}'),
            'sha256'
        ),
        'hex'
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_hash ON public.lancamento;
CREATE TRIGGER trg_lancamento_hash
    BEFORE INSERT OR UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_hash_conteudo();
