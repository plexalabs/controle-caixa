-- Migration 031: RPC upsert_lancamento_lote — versão batch para o VBA do Excel.
-- Aceita ate 50 lancamentos por chamada. Retorna array com resultado por item:
-- { indice, id, conflito, erro }.
-- CRITICA para Fase 3 — sem isso o Excel nao sincroniza eficientemente.
--
-- Formato de entrada (jsonb array):
-- [
--   {
--     "data_caixa": "2026-04-29",
--     "numero_nf": "12345",
--     "codigo_pedido": "PED-001",
--     "cliente_nome": "ACME",
--     "valor_nf": 150.00,
--     "categoria": "cartao",
--     "estado": "completo",
--     "dados_categoria": { ... }
--   },
--   ...
-- ]

CREATE OR REPLACE FUNCTION public.upsert_lancamento_lote(
    p_lote jsonb,
    p_fonte_origem varchar DEFAULT 'excel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_resultado    jsonb := '[]'::jsonb;
    v_item         jsonb;
    v_indice       int   := 0;
    v_id           uuid;
    v_erro         text;
    v_data_caixa   date;
    v_categoria    public.categoria_lancamento;
    v_estado       public.estado_lancamento;
    v_total        int;
BEGIN
    IF jsonb_typeof(p_lote) <> 'array' THEN
        RAISE EXCEPTION 'p_lote deve ser um JSON array';
    END IF;

    v_total := jsonb_array_length(p_lote);

    IF v_total > 50 THEN
        RAISE EXCEPTION 'Lote excede limite de 50 itens (% itens)', v_total;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lote)
    LOOP
        v_indice := v_indice + 1;
        v_id := NULL;
        v_erro := NULL;

        BEGIN
            v_data_caixa := (v_item->>'data_caixa')::date;
            v_categoria  := NULLIF(v_item->>'categoria', '')::public.categoria_lancamento;
            v_estado     := COALESCE(NULLIF(v_item->>'estado', ''), 'completo')::public.estado_lancamento;

            v_id := public.upsert_lancamento(
                v_data_caixa,
                v_item->>'numero_nf',
                v_item->>'codigo_pedido',
                v_item->>'cliente_nome',
                (v_item->>'valor_nf')::numeric,
                v_categoria,
                v_estado,
                COALESCE(v_item->'dados_categoria', '{}'::jsonb),
                p_fonte_origem
            );
        EXCEPTION WHEN OTHERS THEN
            v_erro := SQLERRM;
        END;

        v_resultado := v_resultado || jsonb_build_object(
            'indice',   v_indice,
            'id',       v_id,
            'erro',     v_erro,
            'sucesso',  v_erro IS NULL
        );
    END LOOP;

    RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION public.upsert_lancamento_lote IS
'Versao em lote do upsert. Ate 50 itens. Retorna array com {indice, id, erro, sucesso}. Critica para sync do Excel.';
