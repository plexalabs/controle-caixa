-- Migration 203: trigger anti-mudanca em lancamento.
--
-- Apos a categorizacao, congela campos imutaveis (categoria,
-- dados_categoria, numero_nf, valor_nf, cliente_nome) e valida transicoes
-- de estado:
--
--   pendente      -> completo / excluido
--   completo      -> finalizado / cancelado_pos / excluido
--   finalizado    -> excluido
--   cancelado_pos -> excluido
--
-- Vale para service_role tambem — a unica forma de mudar campos travados
-- e atraves das RPCs adequadas (categorizar_lancamento, marcar_finalizado,
-- marcar_cancelado_pos), que primeiro validam estado e dispatcham UPDATE
-- minimo aprovado por esta trigger.
--
-- Estados travados que ALLOW transicao para finalizado/cancelado_pos:
-- a trigger ainda recebe NEW com campos potencialmente diferentes, mas o
-- check exige que esses campos NAO mudem — apenas o estado.

CREATE OR REPLACE FUNCTION public.fn_lancamento_travar_pos_categoria()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Trava em estados completo/finalizado/cancelado_pos: campos imutaveis
  IF OLD.estado IN ('completo', 'finalizado', 'cancelado_pos') THEN
    IF NEW.categoria       IS DISTINCT FROM OLD.categoria       OR
       NEW.dados_categoria IS DISTINCT FROM OLD.dados_categoria OR
       NEW.numero_nf       IS DISTINCT FROM OLD.numero_nf       OR
       NEW.valor_nf        IS DISTINCT FROM OLD.valor_nf        OR
       NEW.cliente_nome    IS DISTINCT FROM OLD.cliente_nome    THEN
      RAISE EXCEPTION 'Lançamento já categorizado não pode ter categoria, dados_categoria, numero_nf, valor_nf ou cliente_nome alterados. Use a RPC adequada (categorizar/finalizar/cancelar) em vez de UPDATE direto. Estado atual: %.', OLD.estado
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Validacao de transicoes de estado
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      -- pendente -> completo (categorizacao) ou excluido (soft-delete)
      (OLD.estado = 'pendente'         AND NEW.estado IN ('completo','excluido'))         OR
      -- em_preenchimento (legado) -> mesmas opcoes que pendente
      (OLD.estado = 'em_preenchimento' AND NEW.estado IN ('completo','excluido'))         OR
      -- completo -> desfecho ou soft-delete
      (OLD.estado = 'completo'         AND NEW.estado IN ('finalizado','cancelado_pos','excluido')) OR
      -- finalizado/cancelado_pos -> apenas soft-delete
      (OLD.estado = 'finalizado'       AND NEW.estado = 'excluido')                        OR
      (OLD.estado = 'cancelado_pos'    AND NEW.estado = 'excluido')                        OR
      -- legado: resolvido/cancelado -> apenas excluido
      (OLD.estado = 'resolvido'        AND NEW.estado = 'excluido')                        OR
      (OLD.estado = 'cancelado'        AND NEW.estado = 'excluido')
    ) THEN
      RAISE EXCEPTION 'Transição de estado inválida: % -> %.', OLD.estado, NEW.estado
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_travar_pos_categoria ON public.lancamento;
CREATE TRIGGER trg_lancamento_travar_pos_categoria
  BEFORE UPDATE ON public.lancamento
  FOR EACH ROW EXECUTE FUNCTION public.fn_lancamento_travar_pos_categoria();

COMMENT ON FUNCTION public.fn_lancamento_travar_pos_categoria() IS
  'Apos categorizacao, congela campos imutaveis e valida transicoes de '
  'estado. Vale tambem para service_role — RPCs adequadas (categorizar/'
  'finalizar/cancelar) sao a unica forma legitima de mexer.';
