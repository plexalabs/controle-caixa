-- CP-PRE-DEPLOY-1 — Política de retenção: arquivamento mensal de
-- lançamentos antigos finalizados/cancelado_pos.
--
-- Cria chave de configuração (default 365 dias = 1 ano) + tabela de
-- arquivo (espelho do schema de lancamento) + RPC arquivar_antigos
-- que move e deleta da tabela viva.
--
-- A edge function `arquivar-mensal` chama a RPC; o agendamento cron
-- (0 3 1 * *) precisa ser configurado manualmente no Dashboard
-- Supabase → Edge Functions → Schedules (ver docs/INFRA.md).

-- ─── 5A. Chave de configuração ──────────────────────────────────────
INSERT INTO public.config (chave, valor, tipo, descricao)
VALUES (
  'dias_retencao_arquivamento',
  '365'::jsonb,
  'number',
  'Dias após o lançamento ser finalizado/cancelado_pos antes de mover para arquivo. Padrão: 365 (1 ano).'
)
ON CONFLICT (chave) DO NOTHING;

-- ─── 5B. Tabela espelho (estrutura idêntica a lancamento) ──────────
CREATE TABLE IF NOT EXISTS public.lancamento_arquivado (
  LIKE public.lancamento INCLUDING ALL
);

ALTER TABLE public.lancamento_arquivado
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS arquivado_por text NOT NULL DEFAULT 'sistema';

CREATE INDEX IF NOT EXISTS idx_lancamento_arquivado_data
  ON public.lancamento_arquivado(criado_em);

-- RLS: só leitura para authenticated. Sem INSERT/UPDATE/DELETE direto
-- (apenas a RPC SECURITY DEFINER pode escrever).
ALTER TABLE public.lancamento_arquivado ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.lancamento_arquivado'::regclass
       AND polname = 'lancamento_arquivado_select'
  ) THEN
    CREATE POLICY "lancamento_arquivado_select" ON public.lancamento_arquivado
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
