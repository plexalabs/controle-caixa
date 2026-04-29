-- Migration 032: RPC resolver_pendencia.
-- Marca lancamento como resolvido, mantendo-o no caixa de origem (RN-031).
-- Aplica categoria definitiva e dados_categoria.

CREATE OR REPLACE FUNCTION public.resolver_pendencia(
    p_lancamento_id   uuid,
    p_categoria       public.categoria_lancamento,
    p_dados_categoria jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lanc public.lancamento;
BEGIN
    SELECT * INTO v_lanc FROM public.lancamento WHERE id = p_lancamento_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lancamento % nao encontrado', p_lancamento_id;
    END IF;

    IF v_lanc.estado NOT IN ('pendente', 'em_preenchimento') THEN
        RAISE EXCEPTION 'Lancamento % nao esta pendente (estado=%)', p_lancamento_id, v_lanc.estado;
    END IF;

    UPDATE public.lancamento
    SET
        categoria       = p_categoria,
        estado          = 'resolvido',
        dados_categoria = p_dados_categoria,
        resolvido_em    = now(),
        resolvido_por   = auth.uid()
    WHERE id = p_lancamento_id;

    INSERT INTO public.notificacao (tipo, severidade, titulo, mensagem, lancamento_id)
    VALUES (
        'pendencia_aberta', 'info',
        'Pendencia resolvida',
        format('NF %s classificada como %s', v_lanc.numero_nf, p_categoria),
        p_lancamento_id
    );

    RETURN p_lancamento_id;
END;
$$;

COMMENT ON FUNCTION public.resolver_pendencia IS
'Move pendente -> resolvido preservando caixa de origem (RN-031).';
