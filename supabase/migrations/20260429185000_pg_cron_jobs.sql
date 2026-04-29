-- Migration 050: agendamento de pg_cron jobs.
--
-- Horarios em UTC (banco em UTC); valores BRT comentados.
-- BRT = UTC-3, entao 06:00 BRT = 09:00 UTC.
--
-- Os jobs que invocam edge functions so funcionarao apos rodar:
--   SELECT app.configurar_cron('<service_role_key>', 'https://<ref>.supabase.co');
-- Os jobs SQL puros (limpeza, notif via funcoes app.*) funcionam imediatamente.

-- Remove jobs antigos com mesmos nomes (idempotencia).
DO $$
DECLARE
    v_jobid bigint;
BEGIN
    FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname IN (
        'cria_caixa_diario',
        'gerar_notificacoes_atrasadas',
        'gerar_notificacoes_caixa_nao_fechado',
        'disparar_notificacoes_4h',
        'arquivar_ano',
        'backup_semanal',
        'limpar_logs_antigos'
    )
    LOOP
        PERFORM cron.unschedule(v_jobid);
    END LOOP;
END $$;

SELECT cron.schedule(
    'cria_caixa_diario',
    '0 9 * * *',
    $$ SELECT app.invocar_edge('cria_caixa_diario'); $$
);

SELECT cron.schedule(
    'gerar_notificacoes_atrasadas',
    '0 11,15,19 * * 1-6',
    $$ SELECT app.gerar_notificacoes_pendencias_atrasadas(); $$
);

SELECT cron.schedule(
    'gerar_notificacoes_caixa_nao_fechado',
    '0 12 * * 1-5',
    $$ SELECT app.gerar_notificacoes_caixas_nao_fechados(); $$
);

SELECT cron.schedule(
    'disparar_notificacoes_4h',
    '0 11,15,19 * * 1-6',
    $$ SELECT app.invocar_edge('disparar_notificacoes'); $$
);

SELECT cron.schedule(
    'arquivar_ano',
    '30 3 1 1 *',
    $$ SELECT app.invocar_edge('arquivar_ano'); $$
);

SELECT cron.schedule(
    'backup_semanal',
    '0 7 * * 0',
    $$ SELECT app.invocar_edge('backup_semanal'); $$
);

SELECT cron.schedule(
    'limpar_logs_antigos',
    '0 6 * * 0',
    $$ SELECT app.limpar_logs_antigos(); $$
);
