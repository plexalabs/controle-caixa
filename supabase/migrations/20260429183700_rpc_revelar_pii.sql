-- Migration 037: RPC revelar_pii.
-- Retorna o valor completo de um campo sensivel de dados_categoria
-- (ultimos_4_digitos, chave_recebedora, link_url completo) e registra
-- a revelacao no audit_log (RN-080).

CREATE OR REPLACE FUNCTION public.revelar_pii(
    p_lancamento_id uuid,
    p_campo         varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dados jsonb;
    v_valor jsonb;
BEGIN
    IF NOT (
        public.fn_tem_papel('operador') OR
        public.fn_tem_papel('supervisor') OR
        public.fn_tem_papel('auditor') OR
        public.fn_tem_papel('admin')
    ) THEN
        RAISE EXCEPTION 'Acesso negado: usuario sem papel valido';
    END IF;

    -- Whitelist de campos que podem ser revelados (defesa em profundidade).
    IF p_campo NOT IN (
        'ultimos_4_digitos', 'chave_recebedora',
        'link_url', 'comprovante_id_externo'
    ) THEN
        RAISE EXCEPTION 'Campo % nao esta na whitelist de revelacao', p_campo;
    END IF;

    SELECT dados_categoria INTO v_dados FROM public.lancamento WHERE id = p_lancamento_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lancamento % nao encontrado', p_lancamento_id;
    END IF;

    v_valor := v_dados -> p_campo;

    INSERT INTO public.audit_log (
        tabela, registro_id, acao,
        dados_antes, dados_depois,
        usuario_id, usuario_email
    )
    VALUES (
        'lancamento',
        p_lancamento_id,
        'REVEAL_PII',
        jsonb_build_object('campo', p_campo),
        NULL,
        auth.uid(),
        (SELECT email FROM auth.users WHERE id = auth.uid())
    );

    RETURN v_valor;
END;
$$;

COMMENT ON FUNCTION public.revelar_pii IS
'Revela campo sensivel mascarado e registra REVEAL_PII em audit_log (RN-080). Whitelist de campos.';
