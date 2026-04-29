-- Migration 060: remediação de avisos do Supabase database-linter.
-- Revoga EXECUTE de funcoes SECURITY DEFINER internas (acessadas apenas por triggers,
-- nao deveriam ser callable via /rest/v1/rpc/). Adiciona search_path onde faltava.

ALTER FUNCTION public.fn_audit_log_imutavel() SET search_path = public, pg_temp;

DO $$
DECLARE
    f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'fn_audit_log_imutavel()',
        'fn_atualizar_cliente_cache()',
        'fn_auditar_mutacao()',
        'fn_auto_papel_inicial()',
        'fn_notificar_pendencia_criada()',
        'fn_recalcular_caixa()',
        'fn_validar_dominio_email()'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated, public', f);
    END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_tem_papel(varchar) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_tem_papel(varchar) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_lancamento(date, varchar, varchar, varchar, numeric, public.categoria_lancamento, public.estado_lancamento, jsonb, varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_lancamento_lote(jsonb, varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_pendencia(uuid, public.categoria_lancamento, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_lancamento(uuid, text, varchar, date, varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_caixa_se_nao_existe(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resumo(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revelar_pii(uuid, varchar) TO authenticated;
