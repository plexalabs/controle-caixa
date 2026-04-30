-- Migration 193: HOTFIX da migration 192.
--
-- Bug introduzido em 192: a funcao app.invocar_edge lia a coluna `secret`
-- da view vault.decrypted_secrets — mas essa coluna e o CIPHERTEXT base64
-- (raw), nao o plaintext. A coluna correta e `decrypted_secret`.
--
-- Definicao da view (verificada via pg_get_viewdef):
--   SELECT id, name, description, secret,
--          convert_from(vault._crypto_aead_det_decrypt(...)) AS decrypted_secret,
--          key_id, nonce, created_at, updated_at
--   FROM vault.secrets s;
--
-- Sintoma: 'A libcurl function was given a bad argument' porque o ciphertext
-- base64 contem caracteres de whitespace que invalidam o header Authorization.
-- A validacao da migration 192 (prefixo eyJ, 3 partes) sempre falhava porque
-- estava conferindo ciphertext, nao JWT.
--
-- Correcao: trocar `secret` por `decrypted_secret` na funcao.
-- O resto da logica (btrim, validacao JWT, log) permanece.

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
    IF p_nome IS NULL OR p_nome !~ '^[a-zA-Z0-9_-]+$' THEN
        v_erro := format('Nome de edge function invalido: %L (so [a-zA-Z0-9_-])', p_nome);
        INSERT INTO app.edge_invocation_log (edge_function, payload, erro_validacao, invocado_por)
        VALUES (p_nome, p_payload, v_erro, auth.uid());
        RAISE EXCEPTION '%', v_erro;
    END IF;

    -- HOTFIX: le decrypted_secret (plaintext), nao secret (ciphertext base64).
    SELECT btrim(decrypted_secret) INTO v_token
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
            USING ERRCODE = '22023',
                  HINT    = 'Atualize o vault: SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name=''service_role_key''), ''<jwt-correto>'')';
    END IF;

    SELECT net.http_post(
        url     := v_url || '/functions/v1/' || p_nome,
        body    := p_payload,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_token,
            'Content-Type',  'application/json'
        )
    ) INTO v_request_id;

    INSERT INTO app.edge_invocation_log (edge_function, request_id, payload, invocado_por)
    VALUES (p_nome, v_request_id, p_payload, auth.uid());

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.invocar_edge(text, jsonb) FROM anon, public;
GRANT  EXECUTE ON FUNCTION app.invocar_edge(text, jsonb) TO postgres;

COMMENT ON FUNCTION app.invocar_edge IS
'Invoca edge function via pg_net + supabase_vault. Le DECRYPTED_SECRET de vault.decrypted_secrets (nao secret, que e ciphertext). Valida formato JWT (3 partes, prefixo eyJ). Loga em app.edge_invocation_log.';
