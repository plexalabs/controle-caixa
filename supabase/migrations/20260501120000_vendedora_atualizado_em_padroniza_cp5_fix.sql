-- CP5-FIX — bug "record NEW has no field atualizado_em" em UPDATE de vendedora.
--
-- Causa raiz: a coluna foi criada como `atualizada_em` (feminino) na migration
-- inicial, mas a function `fn_atualizar_timestamp()` (BEFORE UPDATE em todas as
-- tabelas auditáveis) faz `NEW.atualizado_em = now()` (masculino — convenção
-- do projeto, presente em caixa, config, lancamento). INSERT funciona porque
-- o trigger só dispara em UPDATE.
--
-- Fix: renomear a coluna para alinhar com a convenção. Idempotente via
-- DO block — só renomeia se ainda existir a versão feminina.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendedora' AND column_name='atualizada_em'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendedora' AND column_name='atualizado_em'
  ) THEN
    EXECUTE 'ALTER TABLE public.vendedora RENAME COLUMN atualizada_em TO atualizado_em';
  END IF;
END $$;

COMMENT ON COLUMN public.vendedora.atualizado_em IS
  'Atualizado automaticamente pelo trigger trg_vendedora_atualizar_ts em cada UPDATE. '
  'Nome padronizado em CP5-FIX (era atualizada_em — outlier feminino histórico).';
