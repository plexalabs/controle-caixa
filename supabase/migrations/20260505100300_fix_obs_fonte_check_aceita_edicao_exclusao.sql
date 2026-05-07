-- ============================================================
-- FEAT-EDIT-DEL (fix): check constraint aceita edicao + exclusao
--
-- Bug: as RPCs editar_lancamento e excluir_lancamento criadas
-- na migration 20260505100100/100200 inserem em
-- lancamento_observacao com fonte='edicao' / 'exclusao', mas o
-- check constraint original so aceitava manual/sistema/finalizar/
-- cancelar_pos -- INSERTs falhavam com 23514.
--
-- Adiciona 'edicao' e 'exclusao' ao set permitido.
-- ============================================================

ALTER TABLE public.lancamento_observacao
  DROP CONSTRAINT IF EXISTS lancamento_observacao_fonte_check;

ALTER TABLE public.lancamento_observacao
  ADD CONSTRAINT lancamento_observacao_fonte_check
  CHECK (fonte = ANY (ARRAY[
    'manual'::text,
    'sistema'::text,
    'finalizar'::text,
    'cancelar_pos'::text,
    'edicao'::text,
    'exclusao'::text
  ]));
