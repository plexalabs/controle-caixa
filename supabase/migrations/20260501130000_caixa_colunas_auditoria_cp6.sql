-- CP6.1A — colunas auxiliares de auditoria em caixa.
-- Idempotente via IF NOT EXISTS.

ALTER TABLE public.caixa
  ADD COLUMN IF NOT EXISTS total_resolvidas       integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cancelado_pos    integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cancelado_pos    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_finalizado       integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_finalizado       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_fechamento  text;

COMMENT ON COLUMN public.caixa.total_resolvidas IS
  'Quantidade de NFs em estado completo ou finalizado (categorizadas e resolvidas).';
COMMENT ON COLUMN public.caixa.total_cancelado_pos IS
  'Quantidade de NFs canceladas pos-pagamento (estado=cancelado_pos). Nao soma em total_valor.';
COMMENT ON COLUMN public.caixa.valor_cancelado_pos IS
  'Soma de valor_nf das NFs canceladas pos-pagamento. Auditoria de estornos do dia.';
COMMENT ON COLUMN public.caixa.total_finalizado IS
  'Quantidade de NFs finalizadas (cliente buscou/recebeu).';
COMMENT ON COLUMN public.caixa.valor_finalizado IS
  'Soma de valor_nf das NFs finalizadas no dia.';
COMMENT ON COLUMN public.caixa.observacao_fechamento IS
  'Texto livre informado pelo Operador no momento de fechar o caixa. CP6 — separa observacoes gerais (caixa.observacoes) da observacao especifica do fechamento.';
