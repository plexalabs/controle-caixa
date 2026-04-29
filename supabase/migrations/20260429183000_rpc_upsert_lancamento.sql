-- Migration 030: RPC upsert_lancamento (singular).
-- Insere ou atualiza idempotentemente baseado em (caixa_id, numero_nf) onde
-- estado <> 'excluido'. Garante o caixa do dia se ainda nao existir.
-- Chamada por Excel (via REST) e Web (via supabase-js).

CREATE OR REPLACE FUNCTION public.upsert_lancamento(
    p_data_caixa     date,
    p_numero_nf      varchar,
    p_codigo_pedido  varchar,
    p_cliente_nome   varchar,
    p_valor_nf       numeric,
    p_categoria      public.categoria_lancamento,
    p_estado         public.estado_lancamento,
    p_dados_categoria jsonb DEFAULT '{}'::jsonb,
    p_fonte_origem   varchar DEFAULT 'web'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caixa_id      uuid;
    v_lancamento_id uuid;
BEGIN
    SELECT id INTO v_caixa_id FROM public.caixa WHERE data = p_data_caixa;
    IF v_caixa_id IS NULL THEN
        INSERT INTO public.caixa (data, criado_por)
        VALUES (p_data_caixa, auth.uid())
        RETURNING id INTO v_caixa_id;
    END IF;

    PERFORM set_config('app.fonte_origem', p_fonte_origem, true);

    INSERT INTO public.lancamento (
        caixa_id, numero_nf, codigo_pedido, cliente_nome, valor_nf,
        categoria, estado, dados_categoria, fonte_origem,
        criado_por, atualizado_por,
        resolvido_em, resolvido_por
    )
    VALUES (
        v_caixa_id, p_numero_nf, p_codigo_pedido, p_cliente_nome, p_valor_nf,
        p_categoria, p_estado, p_dados_categoria, p_fonte_origem,
        auth.uid(), auth.uid(),
        CASE WHEN p_estado = 'resolvido' THEN now() ELSE NULL END,
        CASE WHEN p_estado = 'resolvido' THEN auth.uid() ELSE NULL END
    )
    ON CONFLICT (caixa_id, numero_nf)
    WHERE estado <> 'excluido'
    DO UPDATE SET
        codigo_pedido    = EXCLUDED.codigo_pedido,
        cliente_nome     = EXCLUDED.cliente_nome,
        valor_nf         = EXCLUDED.valor_nf,
        categoria        = EXCLUDED.categoria,
        estado           = EXCLUDED.estado,
        dados_categoria  = EXCLUDED.dados_categoria,
        fonte_origem     = EXCLUDED.fonte_origem,
        resolvido_em     = CASE WHEN EXCLUDED.estado = 'resolvido' AND public.lancamento.resolvido_em IS NULL
                                THEN now() ELSE public.lancamento.resolvido_em END,
        resolvido_por    = CASE WHEN EXCLUDED.estado = 'resolvido' AND public.lancamento.resolvido_por IS NULL
                                THEN auth.uid() ELSE public.lancamento.resolvido_por END
    RETURNING id INTO v_lancamento_id;

    RETURN v_lancamento_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_lancamento IS
'Insert/update idempotente. Cria caixa do dia se nao existir. Chamada por Excel e Web.';
