-- ============================================================
-- OBS-RES: aceita 'resolucao_obs' no CHECK constraint da
-- lancamento_observacao.fonte. Novo valor usado pela RPC
-- resolver_obs_lancamento quando o operador converte uma nota
-- categorizada como 'obs' pra categoria definitiva.
-- ============================================================

ALTER TABLE public.lancamento_observacao
  DROP CONSTRAINT IF EXISTS lancamento_observacao_fonte_check;

ALTER TABLE public.lancamento_observacao
  ADD CONSTRAINT lancamento_observacao_fonte_check
  CHECK (fonte = ANY (ARRAY[
    'manual'::text, 'sistema'::text, 'finalizar'::text,
    'cancelar_pos'::text, 'edicao'::text, 'exclusao'::text,
    'resolucao_obs'::text
  ]));
