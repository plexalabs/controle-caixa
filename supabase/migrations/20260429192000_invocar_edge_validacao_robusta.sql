-- Migration 192: app.invocar_edge mais defensiva.
--
-- Bug encontrado: quando o secret cadastrado no vault NAO e um JWT valido
-- (ex.: Operador colou a "JWT secret" do Settings em vez da "service_role_key",
-- ou colou com whitespace embutido), pg_net retorna "A libcurl function was
-- given a bad argument" sem status_code — silencioso e dificil de diagnosticar.
--
-- Esta refatoracao:
--   1. Trim de whitespace em volta do token (defesa contra copy-paste sujo)
--   2. Valida formato JWT (3 partes separadas por '.', começa com 'eyJ')
--   3. RAISE EXCEPTION precoce com mensagem clara se o secret estiver errado
--   4. Loga toda invocacao em app.edge_invocation_log para debug futuro

CREATE TABLE IF NOT EXISTS app.edge_invocation_log (
    id              bigserial PRIMARY KEY,
    edge_function   text        NOT NULL,
    request_id      bigint,
    payload         jsonb,
    erro_validacao  text,
    invocado_em     timestamptz NOT NULL DEFAULT now(),
    invocado_por    uuid
);

CREATE INDEX IF NOT EXISTS edge_invocation_log_invocado_em
    ON app.edge_invocation_log (invocado_em DESC);
CREATE INDEX IF NOT EXISTS edge_invocation_log_request
    ON app.edge_invocation_log (request_id) WHERE request_id IS NOT NULL;

COMMENT ON TABLE app.edge_invocation_log IS
'Log de invocacoes de app.invocar_edge. Permite correlacionar request_id em net._http_response com a edge invocada e o payload original.';

-- Reescreve app.invocar_edge com validacao robusta.
CREATE OR REPLACE FUNCTION app.invocar_edge(p_nome text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    v_url    constant text := 'https://shjtwrojdgotmxdbpbta.supabase.co';
    v_token  text;
    v_request_id bigint;
    v_erro   text;
BEGIN
    -- Valida nome da edge function (ja que vai virar parte de URL).
    IF p_nome IS NULL OR p_nome !~ '^[a-zA-Z0-9_-]+$' THEN
        v_erro := format('Nome de edge function invalido: %L (so [a-zA-Z0-9_-])', p_nome);
        INSERT INTO app.edge_invocation_log (edge_function, payload, erro_validacao, invocado_por)
        VALUES (p_nome, p_payload, v_erro, auth.uid());
        RAISE EXCEPTION '%', v_erro;
    END IF;

    -- Le e SANITIZA o token do vault (trim de whitespace, defesa contra copy-paste sujo).
    SELECT btrim(secret) INTO v_token
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_token IS NULL THEN
        v_erro := 'Secret service_role_key nao encontrada no Vault. Rode: SELECT vault.create_secret(<chave>, ''service_role_key'', ''...'')';
        INSERT INTO app.edge_invocation_log (edge_function, payload, erro_validacao, invocado_por)
        VALUES (p_nome, p_payload, v_erro, auth.uid());
        RAISE WARNING '%', v_erro;
        RETURN NULL;
    END IF;

    -- Valida formato JWT: 3 partes separadas por '.' e inicio "eyJ".
    -- Esta validacao detecta o bug onde o admin cola "JWT secret" em vez de
    -- "service_role_key" (sao coisas diferentes na pagina Settings/API do Supabase).
    IF v_token NOT LIKE 'eyJ%'
       OR array_length(string_to_array(v_token, '.'), 1) <> 3
       OR length(v_token) < 100 THEN
        v_erro := format(
            'Conteudo de service_role_key NAO e um JWT valido. Esperado formato eyJxxx.yyy.zzz com ~250 chars. '
            'Recebido: %s caracteres, %s partes, prefixo %L. '
            'Provavel causa: foi colado o "JWT Secret" (HMAC interno) em vez da "service_role" key. '
            'Conferir em Supabase Dashboard > Settings > API > "Project API keys" > service_role.',
            length(v_token),
            array_length(string_to_array(v_token, '.'), 1),
            substr(v_token, 1, 10) || '...'
        );
        INSERT INTO app.edge_invocation_log (edge_function, payload, erro_validacao, invocado_por)
        VALUES (p_nome, p_payload, v_erro, auth.uid());
        RAISE EXCEPTION '%', v_erro
            USING ERRCODE = '22023', -- invalid_parameter_value
                  HINT    = 'Atualize o vault: SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name=''service_role_key''), ''<jwt-correto>'')';
    END IF;

    -- Tudo validado, dispara HTTP.
    SELECT net.http_post(
        url     := v_url || '/functions/v1/' || p_nome,
        body    := p_payload,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_token,
            'Content-Type',  'application/json'
        )
    ) INTO v_request_id;

    -- Loga sucesso de enfileiramento.
    INSERT INTO app.edge_invocation_log (edge_function, request_id, payload, invocado_por)
    VALUES (p_nome, v_request_id, p_payload, auth.uid());

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.invocar_edge(text, jsonb) FROM anon, public;
GRANT  EXECUTE ON FUNCTION app.invocar_edge(text, jsonb) TO postgres;

COMMENT ON FUNCTION app.invocar_edge IS
'Invoca edge function via pg_net + supabase_vault. Sanitiza token, valida formato JWT (3 partes, prefixo eyJ), loga em app.edge_invocation_log. Detecta o bug de colar "JWT Secret" em vez de "service_role" key.';
