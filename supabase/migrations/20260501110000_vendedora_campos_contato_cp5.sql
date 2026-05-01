-- CP5.1 — adiciona campos de contato/observação na vendedora.
-- Idempotente: ADD COLUMN IF NOT EXISTS. A coluna `ativa` já existe (default true)
-- desde as migrations base; este aqui só introduz email/telefone/observacoes.

ALTER TABLE public.vendedora
  ADD COLUMN IF NOT EXISTS email       varchar(160),
  ADD COLUMN IF NOT EXISTS telefone    varchar(40),
  ADD COLUMN IF NOT EXISTS observacoes text;

COMMENT ON COLUMN public.vendedora.email       IS 'Contato opcional. Validado no cliente (formato simples).';
COMMENT ON COLUMN public.vendedora.telefone    IS 'Contato opcional, formato livre. UI sugere (DD) 9XXXX-XXXX.';
COMMENT ON COLUMN public.vendedora.observacoes IS 'Notas internas da gerência. Sem limite, mas UI corta em ~600.';
