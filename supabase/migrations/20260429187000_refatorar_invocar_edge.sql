-- Migration 187: refatora app.invocar_edge para usar Supabase Vault.
--
-- Motivo: a abordagem anterior (ALTER DATABASE postgres SET app.settings.*)
-- exige privilegio de superuser, indisponivel em managed Postgres do Supabase
-- Cloud. A funcao app.configurar_cron falhava com:
--   ERROR: permission denied to set parameter "app.settings.service_role_key"
--
-- Solucao Supabase-native: armazenar a service_role_key na extensao
-- supabase_vault (ja habilitada como vault 0.3.1) e ler em runtime via
-- vault.decrypted_secrets dentro de app.invocar_edge. URL do projeto fica
-- hardcoded (nao e segredo — esta no anon_key publico).
--
-- ============================================================
-- ACAO REQUERIDA DO ADMIN — UMA VEZ APOS APLICAR ESTA MIGRATION
-- ============================================================
-- Rodar no SQL Editor (NUNCA comitar) com a service_role do vault corporativo:
--
--   SELECT vault.create_secret(
--       '<COLE_SERVICE_ROLE_DO_VAULT_CORPORATIVO>',
--       'service_role_key',
--       'Chave service_role para invocacao de edge functions via pg_cron'
--   );
--
-- Se ja existe (re-execucao, rotacao), use update_secret:
--
--   SELECT vault.update_secret(
--       (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
--       '<NOVA_SERVICE_ROLE>'
--   );
--
-- Validacao apos cadastro:
--   SELECT app.invocar_edge('cria_caixa_diario', '{}'::jsonb);
--
-- Qualquer status HTTP retornado (200/401) prova que o circuito
-- banco -> vault -> HTTP -> edge esta funcionando. Erro NULL+WARNING
-- significa secret nao cadastrada.

-- supabase_vault ja vem habilitada por padrao no Supabase Cloud, mas garantimos.
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Reescreve app.invocar_edge para ler service_role_key do vault.
-- Mantem a mesma assinatura (p_nome text, p_payload jsonb DEFAULT '{}'::jsonb)
-- para que os 4 cron jobs ja agendados continuem funcionando sem alteracao.
CREATE OR REPLACE FUNCTION app.invocar_edge(p_nome text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    -- URL do projeto (publica, nao e segredo). Hardcoded para evitar exigir
    -- 2o secret no vault. Se trocar de projeto, atualizar aqui.
    v_url   constant text := 'https://shjtwrojdgotmxdbpbta.supabase.co';
    v_token text;
    v_request_id bigint;
BEGIN
    -- Le service_role_key do Vault em runtime (descriptografada).
    SELECT secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_token IS NULL THEN
        RAISE WARNING
            'app.invocar_edge: secret service_role_key nao encontrada no Vault. '
            'Rode: SELECT vault.create_secret(''<chave>'', ''service_role_key'', ''...'')';
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

REVOKE EXECUTE ON FUNCTION app.invocar_edge(text, jsonb) FROM anon, public;
GRANT  EXECUTE ON FUNCTION app.invocar_edge(text, jsonb) TO postgres;

COMMENT ON FUNCTION app.invocar_edge IS
'Invoca edge function via pg_net + supabase_vault. Le service_role_key do vault.decrypted_secrets em runtime. URL do projeto hardcoded.';

-- Marca app.configurar_cron como deprecated. Mantem a funcao para nao quebrar
-- referencias historicas, mas retorna erro orientando o admin ao novo metodo.
CREATE OR REPLACE FUNCTION app.configurar_cron(
    p_service_role_key text,
    p_project_url      text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'app.configurar_cron foi DEPRECADA (Supabase Cloud nao permite ALTER DATABASE SET). '
        'Use o Supabase Vault: SELECT vault.create_secret(''<chave>'', ''service_role_key'', ''...''). '
        'Ver docs/03 §12 e migration 187.'
        USING ERRCODE = '0A000', -- feature_not_supported
              HINT    = 'A nova app.invocar_edge le service_role_key do vault.decrypted_secrets em runtime.';
END;
$$;

COMMENT ON FUNCTION app.configurar_cron IS
'DEPRECADA. ALTER DATABASE SET nao funciona em Supabase Cloud. Use vault.create_secret na migration 187.';
