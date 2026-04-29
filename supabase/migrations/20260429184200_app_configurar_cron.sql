-- Migration 042: funcao app.configurar_cron — invocada UMA VEZ pelo admin
-- via SQL Editor para popular GUCs do banco com service_role_key e project_url.
-- Apos invocar essa funcao com os valores reais, os jobs de pg_cron passam a
-- conseguir invocar edge functions.
--
-- Uso (pelo admin no SQL Editor, com service_role do Vault corporativo):
--
--   SELECT app.configurar_cron(
--       p_service_role_key := '<eyJ... service_role JWT>',
--       p_project_url      := 'https://shjtwrojdgotmxdbpbta.supabase.co'
--   );

CREATE OR REPLACE FUNCTION app.configurar_cron(
    p_service_role_key text,
    p_project_url      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
    IF p_service_role_key IS NULL OR length(p_service_role_key) < 50 THEN
        RAISE EXCEPTION 'p_service_role_key invalido (parece nao ser um JWT)';
    END IF;
    IF p_project_url IS NULL OR p_project_url NOT LIKE 'https://%.supabase.co' THEN
        RAISE EXCEPTION 'p_project_url invalido (esperado https://*.supabase.co)';
    END IF;

    EXECUTE format('ALTER DATABASE %I SET app.settings.service_role_key TO %L',
                   current_database(), p_service_role_key);
    EXECUTE format('ALTER DATABASE %I SET app.settings.project_url TO %L',
                   current_database(), p_project_url);

    PERFORM set_config('app.settings.service_role_key', p_service_role_key, false);
    PERFORM set_config('app.settings.project_url', p_project_url, false);

    RAISE NOTICE 'GUCs app.settings.* configuradas com sucesso. Jobs pg_cron agora conseguem invocar edge functions.';
END;
$$;

COMMENT ON FUNCTION app.configurar_cron IS
'Popula GUCs app.settings.service_role_key e app.settings.project_url para que pg_cron invoque edge functions. Execute UMA VEZ via SQL Editor com valores do vault.';
