-- ============================================================
-- FIX: fn_validar_dados_categoria nao conhecia 'disponivel_retirada'
--
-- O CASE...END CASE sem ELSE dispara 'case not found' quando recebe
-- valor fora dos WHEN listados. Reescrevemos a funcao adicionando
-- o WHEN 'disponivel_retirada' (sem campos obrigatorios, dados_categoria
-- e jsonb opcional — pode conter motivo_interno + previsao_retirada).
--
-- Tambem adiciona ELSE NULL como defesa: futuros enum values nao
-- quebrarao a funcao mesmo antes de uma migration de validacao.
-- ============================================================

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
        RAISE EXCEPTION 'Categoria obrigatoria para estado %', NEW.estado;
    END IF;

    CASE NEW.categoria
        WHEN 'cartao' THEN
            IF exige_completos AND NOT (
                NEW.dados_categoria ? 'codigo_autorizacao' AND
                NEW.dados_categoria ? 'bandeira' AND
                NEW.dados_categoria ? 'modalidade' AND
                NEW.dados_categoria ? 'parcelas'
            ) THEN
                RAISE EXCEPTION 'Dados de Cartao incompletos: requer codigo_autorizacao, bandeira, modalidade, parcelas';
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
                RAISE EXCEPTION 'Dados de Cartao Link incompletos: requer link_url e status_link';
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

        WHEN 'disponivel_retirada' THEN
            -- Categoria nova (CAT-7): pedido ja faturado mas produto ainda
            -- na empresa aguardando o cliente retirar. dados_categoria
            -- aceito como jsonb opcional — pode conter motivo_interno
            -- (texto explicando) + previsao_retirada (data). Sem validacao
            -- obrigatoria nesta etapa pra permitir bootstrap rapido; pode
            -- ser endurecido depois sem precisar quebrar registros antigos.
            NULL;

        ELSE
            -- Defesa: futuros enum values nao quebram esta funcao por
            -- 'case not found'. Cada nova categoria deveria ter seu
            -- proprio WHEN, mas se faltar, o trigger nao trava o INSERT.
            NULL;
    END CASE;

    RETURN NEW;
END;
$$;
