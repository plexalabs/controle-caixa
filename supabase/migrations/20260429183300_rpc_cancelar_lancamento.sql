-- Migration 033: RPC cancelar_lancamento.
-- Soft-cancel: muda estado/categoria para 'cancelado' preservando o historico
-- da categoria anterior em _archived_dados_categoria_anterior.

CREATE OR REPLACE FUNCTION public.cancelar_lancamento(
    p_lancamento_id      uuid,
    p_motivo             text,
    p_cancelado_por      varchar,
    p_data_cancelamento  date,
    p_numero_estorno     varchar DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_categoria_anterior public.categoria_lancamento;
    v_dados_anteriores   jsonb;
BEGIN
    IF p_motivo IS NULL OR length(p_motivo) < 10 THEN
        RAISE EXCEPTION 'Motivo deve ter ao menos 10 caracteres';
    END IF;

    SELECT categoria, dados_categoria
    INTO v_categoria_anterior, v_dados_anteriores
    FROM public.lancamento WHERE id = p_lancamento_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lancamento % nao encontrado', p_lancamento_id;
    END IF;

    UPDATE public.lancamento
    SET
        categoria = 'cancelado',
        estado    = 'cancelado',
        dados_categoria = jsonb_build_object(
            'motivo_cancelamento', p_motivo,
            'cancelado_por',       p_cancelado_por,
            'data_cancelamento',   to_char(p_data_cancelamento, 'YYYY-MM-DD'),
            'numero_estorno',      p_numero_estorno,
            'categoria_anterior',  v_categoria_anterior,
            '_archived_dados_categoria_anterior', v_dados_anteriores
        )
    WHERE id = p_lancamento_id;

    RETURN p_lancamento_id;
END;
$$;

COMMENT ON FUNCTION public.cancelar_lancamento IS
'Cancela lancamento preservando dados anteriores em _archived. Motivo >=10 chars.';
