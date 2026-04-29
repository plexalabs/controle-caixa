-- Migration 062: ajusta fn_audit_log_imutavel para permitir UPDATE apenas no caso
-- de cascata FK SET NULL em usuario_id (quando o user e deletado de auth.users).
-- Todos os outros campos continuam imutaveis. DELETE permanece bloqueado.

CREATE OR REPLACE FUNCTION public.fn_audit_log_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Excecao unica: FK SET NULL em usuario_id (quando auth.users e deletado).
        -- Todos os outros campos devem permanecer iguais.
        IF OLD.usuario_id IS NOT NULL
           AND NEW.usuario_id IS NULL
           AND OLD.tabela        IS NOT DISTINCT FROM NEW.tabela
           AND OLD.registro_id   IS NOT DISTINCT FROM NEW.registro_id
           AND OLD.acao          IS NOT DISTINCT FROM NEW.acao
           AND OLD.dados_antes   IS NOT DISTINCT FROM NEW.dados_antes
           AND OLD.dados_depois  IS NOT DISTINCT FROM NEW.dados_depois
           AND OLD.usuario_email IS NOT DISTINCT FROM NEW.usuario_email
           AND OLD.fonte         IS NOT DISTINCT FROM NEW.fonte
           AND OLD.ip            IS NOT DISTINCT FROM NEW.ip
           AND OLD.user_agent    IS NOT DISTINCT FROM NEW.user_agent
           AND OLD.criado_em     IS NOT DISTINCT FROM NEW.criado_em
        THEN
            RETURN NEW;
        END IF;
    END IF;

    RAISE EXCEPTION 'audit_log é imutável: % nao permitido', TG_OP
        USING ERRCODE = '42501',
              HINT    = 'Para corrigir um registro, insira novo evento descrevendo a correção.';
END;
$$;
