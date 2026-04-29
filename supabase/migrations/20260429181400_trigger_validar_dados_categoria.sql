-- Migration 014: trigger valida JSONB `dados_categoria` por categoria.
-- Implementa Apêndice A do arquivo 01: cada categoria tem campos obrigatórios.
-- Pendentes (sem categoria) e em_preenchimento são tolerados — só estados
-- 'completo' / 'resolvido' / 'cancelado' exigem dados completos.

CREATE OR REPLACE FUNCTION public.fn_validar_dados_categoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    exige_completos boolean;
BEGIN
    IF NEW.estado = 'pendente' THEN
        RETURN NEW;
    END IF;

    exige_completos := NEW.estado IN ('completo', 'resolvido', 'cancelado');

    IF NEW.categoria IS NULL THEN
        RAISE EXCEPTION 'Categoria obrigatória para estado %', NEW.estado;
    END IF;

    CASE NEW.categoria
        WHEN 'cartao' THEN
            IF exige_completos AND NOT (
                NEW.dados_categoria ? 'codigo_autorizacao' AND
                NEW.dados_categoria ? 'bandeira' AND
                NEW.dados_categoria ? 'modalidade' AND
                NEW.dados_categoria ? 'parcelas'
            ) THEN
                RAISE EXCEPTION 'Dados de Cartão incompletos: requer codigo_autorizacao, bandeira, modalidade, parcelas';
            END IF;

        WHEN 'pix' THEN
            IF exige_completos AND NOT (
                NEW.dados_categoria ? 'comprovante_id_externo' AND
                NEW.dados_categoria ? 'chave_recebedora' AND
                NEW.dados_categoria ? 'data_hora_pix'
            ) THEN
                RAISE EXCEPTION 'Dados de Pix incompletos: requer comprovante_id_externo, chave_recebedora, data_hora_pix';
            END IF;

        WHEN 'dinheiro' THEN
            IF exige_completos AND NOT (
                NEW.dados_categoria ? 'vendedora_id' AND
                NEW.dados_categoria ? 'valor_recebido'
            ) THEN
                RAISE EXCEPTION 'Dados de Dinheiro incompletos: requer vendedora_id e valor_recebido';
            END IF;

        WHEN 'cancelado' THEN
            IF NOT (
                NEW.dados_categoria ? 'motivo_cancelamento' AND
                NEW.dados_categoria ? 'cancelado_por' AND
                NEW.dados_categoria ? 'data_cancelamento'
            ) THEN
                RAISE EXCEPTION 'Dados de Cancelamento incompletos: requer motivo, cancelado_por e data';
            END IF;
            IF length(NEW.dados_categoria->>'motivo_cancelamento') < 10 THEN
                RAISE EXCEPTION 'Motivo de cancelamento muito curto (minimo 10 caracteres)';
            END IF;

        WHEN 'cartao_link' THEN
            IF exige_completos AND NOT (
                NEW.dados_categoria ? 'link_url' AND
                NEW.dados_categoria ? 'status_link'
            ) THEN
                RAISE EXCEPTION 'Dados de Cartão Link incompletos: requer link_url e status_link';
            END IF;
            IF NEW.dados_categoria ? 'link_url'
               AND NEW.dados_categoria->>'link_url' NOT LIKE 'https://%' THEN
                RAISE EXCEPTION 'Link deve comecar com https://';
            END IF;
            IF NEW.dados_categoria->>'status_link' = 'pago'
               AND NOT (NEW.dados_categoria ? 'codigo_autorizacao') THEN
                RAISE EXCEPTION 'Cartao Link pago exige codigo_autorizacao';
            END IF;

        WHEN 'obs' THEN
            IF exige_completos AND NOT (
                NEW.dados_categoria ? 'tipo_obs' AND
                NEW.dados_categoria ? 'descricao'
            ) THEN
                RAISE EXCEPTION 'Dados de Obs incompletos: requer tipo_obs e descricao';
            END IF;
            IF exige_completos
               AND length(NEW.dados_categoria->>'descricao') < 20 THEN
                RAISE EXCEPTION 'Descricao de Obs muito curta (minimo 20 caracteres)';
            END IF;
    END CASE;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_validar_dados ON public.lancamento;
CREATE TRIGGER trg_lancamento_validar_dados
    BEFORE INSERT OR UPDATE ON public.lancamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_dados_categoria();
