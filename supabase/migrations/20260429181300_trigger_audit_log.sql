-- Migration 013: garante que audit_log seja imutável (RN-072).
-- Bloqueia UPDATE e DELETE em audit_log mesmo via service_role.

CREATE OR REPLACE FUNCTION public.fn_audit_log_imutavel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_log é imutável: % nao permitido', TG_OP
        USING ERRCODE = '42501',
              HINT    = 'Para corrigir um registro, insira novo evento descrevendo a correção.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON public.audit_log;
CREATE TRIGGER trg_audit_log_no_update
    BEFORE UPDATE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_imutavel();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON public.audit_log;
CREATE TRIGGER trg_audit_log_no_delete
    BEFORE DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_imutavel();

-- Função genérica de auditoria que pode ser anexada a qualquer tabela com `id uuid`.
CREATE OR REPLACE FUNCTION public.fn_auditar_mutacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    rec_id     uuid;
    user_id    uuid;
    user_email varchar;
    fonte_val  varchar;
BEGIN
    rec_id := COALESCE(NEW.id, OLD.id);
    user_id := auth.uid();

    -- Captura email no momento (cache imutável; user pode ser deletado depois).
    IF user_id IS NOT NULL THEN
        SELECT email INTO user_email FROM auth.users WHERE id = user_id;
    END IF;

    -- Captura a fonte (web|excel|edge_function) via GUC; quem chama deve setar.
    BEGIN
        fonte_val := current_setting('app.fonte_origem', true);
    EXCEPTION WHEN OTHERS THEN
        fonte_val := NULL;
    END;

    INSERT INTO public.audit_log (
        tabela, registro_id, acao, dados_antes, dados_depois,
        usuario_id, usuario_email, fonte
    )
    VALUES (
        TG_TABLE_NAME,
        rec_id,
        TG_OP::public.acao_audit,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        user_id,
        user_email,
        fonte_val
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_audit ON public.lancamento;
CREATE TRIGGER trg_lancamento_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();

DROP TRIGGER IF EXISTS trg_caixa_audit ON public.caixa;
CREATE TRIGGER trg_caixa_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.caixa
    FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();

DROP TRIGGER IF EXISTS trg_vendedora_audit ON public.vendedora;
CREATE TRIGGER trg_vendedora_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.vendedora
    FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();

DROP TRIGGER IF EXISTS trg_config_audit ON public.config;
CREATE TRIGGER trg_config_audit
    AFTER UPDATE ON public.config
    FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_mutacao();
