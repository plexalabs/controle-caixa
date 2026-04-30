# HOTFIX — `pg_net` retornando "A libcurl function was given a bad argument"

> Investigado em 2026-04-29 ~21:20 BRT. Causa raiz identificada e mitigação aplicada.
> Migration: `20260429192000_invocar_edge_validacao_robusta.sql`.

## Sintoma

Após cadastrar `service_role_key` no Vault e invocar `app.invocar_edge('cria_caixa_diario', '{}'::jsonb)`:

```sql
SELECT id, status_code, error_msg
FROM net._http_response
ORDER BY created DESC LIMIT 1;
```

Retornava:
```
id=3, status_code=NULL, error_msg='A libcurl function was given a bad argument'
```

Sem timeout, sem status, sem corpo.

## Causa raiz

O conteúdo cadastrado no Vault não era um JWT válido. Diagnóstico via SQL:

```sql
SELECT
    length(secret)                                      AS len,
    secret ~ '\s'                                       AS tem_whitespace,
    array_length(string_to_array(secret, '.'), 1)       AS partes_jwt,
    substr(secret, 1, 30)                               AS prefix
FROM vault.decrypted_secrets WHERE name = 'service_role_key';
```

Resultado:
| len | tem_whitespace | partes_jwt | prefix |
|---|---|---|---|
| 340 | **TRUE** | **1** | `WLn4UEEdCz2ZRmVQLc5rl8lJ+88XVy` |

Um JWT real tem:
- **3 partes** separadas por `.` (header.payload.signature)
- Começa com `eyJ` (base64url de `{"`)
- ~250 caracteres
- **Sem whitespace**

O Operador colou no Vault o **"JWT Secret"** do Supabase (HMAC interno de 340 chars usado para assinar JWTs) em vez da **"service_role" key** (que é um JWT pré-assinado).

Esses dois valores aparecem em telas diferentes do Dashboard:
- **Settings → API → Project API keys → service_role** (✅ correto, é um JWT)
- **Settings → API → JWT Settings → JWT Secret** (❌ errado, é HMAC raw)

`libcurl` rejeita o header `Authorization: Bearer <conteúdo-com-quebra-de-linha>` porque headers HTTP não podem conter `\n` ou `\r` — daí o "bad argument" sem detalhe.

## Validação do diagnóstico

Para confirmar que o `pg_net` e o `app.invocar_edge` estavam corretos, e o problema era 100% conteúdo do Vault, fiz teste isolado com a `anon_key` (que sabidamente é um JWT válido):

```sql
SELECT net.http_post(
    url     := 'https://shjtwrojdgotmxdbpbta.supabase.co/functions/v1/cria_caixa_diario',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGc...iNYDow4v...' /* anon_key real */,
        'Content-Type',  'application/json'
    )
);
-- req_id 6
```

Resultado em `net._http_response WHERE id=6`:
```
status_code: 200
content_type: application/json
content: { "inicio": "2026-04-30T00:23:16.658Z", ..., "resultados": [ ... ] }
```

✅ HTTP 200, edge function executou — confirma que a infra `pg_net` + `supabase_vault` + `app.invocar_edge` estava 100% funcional. O único problema era o conteúdo do secret.

## Mitigação aplicada (migration 192)

A nova `app.invocar_edge` agora:

1. **Sanitiza o token** com `btrim(secret)` para remover whitespace inadvertido.
2. **Valida formato JWT antes de chamar pg_net**: prefixo `eyJ`, exatamente 3 partes separadas por `.`, comprimento ≥ 100.
3. Em caso de violação, lança `RAISE EXCEPTION '22023'` com **mensagem detalhada** indicando exatamente o problema:
   ```
   Conteudo de service_role_key NAO e um JWT valido. Esperado formato
   eyJxxx.yyy.zzz com ~250 chars. Recebido: 340 caracteres, 1 partes,
   prefixo 'WLn4UEEdCz...'. Provavel causa: foi colado o "JWT Secret"
   (HMAC interno) em vez da "service_role" key. Conferir em Supabase
   Dashboard > Settings > API > "Project API keys" > service_role.

   HINT: Atualize o vault: SELECT vault.update_secret(
       (SELECT id FROM vault.secrets WHERE name='service_role_key'),
       '<jwt-correto>'
   )
   ```
4. **Valida nome da edge function** com regex `^[a-zA-Z0-9_-]+$` (defesa contra injection na URL).
5. **Loga toda invocação** em `app.edge_invocation_log` (request_id, payload, erro de validação, autor) para debug futuro.

## Como o Operador corrige

No SQL Editor:

```sql
-- Pegar a service_role correta no Dashboard:
--   Settings > API > Project API keys > service_role > Reveal
-- Conferir que começa com "eyJ" e tem 2 pontos (3 partes).

SELECT vault.update_secret(
    (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
    'eyJhbGc...<COLE_AQUI_A_SERVICE_ROLE_REAL>...'
);

-- Validar:
SELECT app.invocar_edge('cria_caixa_diario', '{}'::jsonb);

-- Esperado: bigint > 0 (sem RAISE EXCEPTION).
-- Em alguns segundos, conferir em net._http_response:
SELECT id, status_code, error_msg
FROM net._http_response ORDER BY created DESC LIMIT 1;
-- Esperado: status_code 200 (ou 4xx, conforme o que a edge retornar).
```

## Lições aprendidas

- **Telas similares no Supabase Dashboard confundem** "JWT Secret" com "service_role key". Documentar visualmente para o próximo admin.
- **`pg_net` engole erros de header**: um header com `\n` retorna "bad argument" sem indicar qual argumento. Validação no caller economiza horas de debug.
- **Vault preserva whitespace** que veio com copy-paste — sanitizar com `btrim()` antes de uso.
- **Sempre testar** invocação de edge function imediatamente após cadastrar a secret, não esperar o cron disparar (que rodaria horas depois).
