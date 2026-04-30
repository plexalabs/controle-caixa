-- Migration 200: habilita Realtime para tabelas usadas no frontend.
-- Movido para Fase 2 (estava marcado como "adiar" no PROGRESSO da Fase 1).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'lancamento'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamento;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'caixa'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'notificacao'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacao;
    END IF;
END $$;
