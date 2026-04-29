-- Migration 041: helpers no schema `app` para invocacao de edge functions via cron
-- e tarefas de limpeza em SQL puro.
--
-- ATENCAO: app.invocar_edge() depende de duas GUCs definidas via:
--   ALTER DATABASE postgres SET app.settings.service_role_key TO '<service_role_jwt>';
--   ALTER DATABASE postgres SET app.settings.project_url      TO 'https://<ref>.supabase.co';
-- Essas GUCs sao populadas por app.configurar_cron() (proxima migration) que o
-- admin invoca uma vez via SQL Editor passando os valores do vault.

CREATE OR REPLACE FUNCTION app.invocar_edge(p_nome text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    v_url        text;
    v_token      text;
    v_request_id bigint;
BEGIN
    v_url   := current_setting('app.settings.project_url', true);
    v_token := current_setting('app.settings.service_role_key', true);

    IF v_url IS NULL OR v_token IS NULL THEN
        RAISE WARNING 'app.invocar_edge: GUCs nao definidas. Rode app.configurar_cron(...) primeiro.';
        RETURN NULL;
    END IF;

    SELECT net.http_post(
        url     := v_url || '/functions/v1/' || p_nome,
        body    := p_payload,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_token,
            'Content-Type',  'application/json'
        )
    ) INTO v_request_id;

    RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION app.invocar_edge IS
'Invoca edge function via pg_net. Requer GUCs app.settings.service_role_key e app.settings.project_url.';

CREATE OR REPLACE FUNCTION app.limpar_logs_antigos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
    v_sync_removidos    int;
    v_notif_removidas   int;
BEGIN
    DELETE FROM public.sync_log WHERE criado_em < now() - interval '90 days';
    GET DIAGNOSTICS v_sync_removidos = ROW_COUNT;

    DELETE FROM public.notificacao
    WHERE lida_em IS NOT NULL AND lida_em < now() - interval '60 days';
    GET DIAGNOSTICS v_notif_removidas = ROW_COUNT;

    RETURN jsonb_build_object(
        'sync_log_removidos',   v_sync_removidos,
        'notificacoes_removidas', v_notif_removidas,
        'executado_em',         now()
    );
END;
$$;

COMMENT ON FUNCTION app.limpar_logs_antigos IS
'Limpeza periodica: sync_log >90d, notificacao lida >60d. audit_log NUNCA apagado.';

CREATE OR REPLACE FUNCTION app.gerar_notificacoes_pendencias_atrasadas()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
    v_dias_atraso int;
    v_pend        record;
    v_count       int := 0;
BEGIN
    v_dias_atraso := COALESCE(
        (SELECT (valor::text)::int FROM public.config WHERE chave = 'pendencia.dias_alerta_atraso'),
        3
    );

    FOR v_pend IN
        SELECT l.id, l.numero_nf, l.cliente_nome, l.caixa_id,
               public.dias_uteis_entre(l.criado_em::date, current_date) AS idade
        FROM public.lancamento l
        WHERE l.estado IN ('pendente', 'em_preenchimento')
          AND public.dias_uteis_entre(l.criado_em::date, current_date) > v_dias_atraso
          AND NOT EXISTS (
              SELECT 1 FROM public.notificacao n
              WHERE n.lancamento_id = l.id
                AND n.tipo = 'pendencia_atrasada'
                AND n.criada_em > now() - interval '24 hours'
          )
    LOOP
        INSERT INTO public.notificacao (
            tipo, severidade, titulo, mensagem,
            lancamento_id, caixa_id
        )
        VALUES (
            'pendencia_atrasada', 'urgente',
            'Pendencia atrasada',
            format('NF %s — %s — aberta ha %s dias uteis. Resolver com prioridade.',
                   v_pend.numero_nf, v_pend.cliente_nome, v_pend.idade),
            v_pend.id, v_pend.caixa_id
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.gerar_notificacoes_pendencias_atrasadas IS
'Cron job: cria notif urgente para pendencias > config.pendencia.dias_alerta_atraso. Dedup 24h.';

CREATE OR REPLACE FUNCTION app.gerar_notificacoes_caixas_nao_fechados()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
    v_caixa  record;
    v_count  int := 0;
BEGIN
    FOR v_caixa IN
        SELECT id, data
        FROM public.caixa
        WHERE estado <> 'fechado'
          AND data < current_date
          AND data >= current_date - interval '7 days'
          AND NOT EXISTS (
              SELECT 1 FROM public.notificacao n
              WHERE n.caixa_id = caixa.id
                AND n.tipo = 'caixa_nao_fechado'
                AND n.criada_em > now() - interval '24 hours'
          )
    LOOP
        INSERT INTO public.notificacao (
            tipo, severidade, titulo, mensagem, caixa_id
        )
        VALUES (
            'caixa_nao_fechado', 'aviso',
            'Caixa nao fechado',
            format('Caixa de %s ainda nao foi fechado.', to_char(v_caixa.data, 'DD/MM/YYYY')),
            v_caixa.id
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.gerar_notificacoes_caixas_nao_fechados IS
'Cron job: alerta caixas dos ultimos 7 dias sem fechamento. Dedup 24h.';
