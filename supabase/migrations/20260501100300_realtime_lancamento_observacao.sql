-- Migration 204: lancamento_observacao na publication supabase_realtime.
-- Permite que o drawer de edicao receba novas observacoes em outras
-- abas/usuarios sem precisar dar refresh.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lancamento_observacao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamento_observacao;
  END IF;
END$$;
