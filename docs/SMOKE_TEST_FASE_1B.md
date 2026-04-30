# SMOKE TEST FASE 1B — refactor auth (email + senha + OTP via Resend)

> Executado em **2026-04-29 ~21:43 BRT** contra o projeto Supabase `shjtwrojdgotmxdbpbta`.
> Branch: `fase-1b-refactor-auth` (commits `c27c7b8`, `c26458e`, `a41fafd`).

## Resumo

| # | Validação | Status |
|---|---|---|
| 1 | Trigger `fn_validar_dominio_email` removido — INSERT `@gmail.com` em `auth.users` aceito | ✅ |
| 2 | Signup REST com email + senha gera entrada com `email_confirmed_at = NULL` | ✅ |
| 3 | Email com OTP de 6 dígitos chega no inbox via Resend | ✅ Resend SMTP configurado pelo Operador; OTP recebido com sender `Caixa Boti <noreply@plexalabs.com>` |
| 4 | `verifyOtp({ type: 'signup' })` popula `email_confirmed_at` | ✅ `auth.users.email_confirmed_at = 2026-04-29 22:08:02-03` |
| 5 | `fn_auto_papel_inicial` atribui admin+operador ao 1º usuário, operador aos demais | ✅ |
| 6 | Login com email/senha após confirmação retorna JWT válido | ✅ `auth.users.last_sign_in_at = 2026-04-29 22:08:02-03` |
| 7 | Login antes da confirmação é bloqueado (`email_not_confirmed`) | ✅ |
| 8 | `app.invocar_edge('cria_caixa_diario')` retorna status 2xx (libcurl resolvido) | ✅ HTTP 200 (req_id=7), edge function executou e criou caixa de teste |
| 9 | Build/deploy de Pages na branch dev funciona em `controle-caixa.pages.dev` | ⏳ Fase 2 — depende de código frontend ainda não escrito |

---

## Detalhe das validações

### Validação 1 — Trigger de domínio removido

```sql
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role, email_confirmed_at)
VALUES ('aaaa1111-2222-3333-4444-555555555555', 'teste.bloco.a@gmail.com',
        '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated', NULL);
```

**Resultado:** insert aceito (antes da migration 190 retornava `42501: Acesso restrito ao domínio vdboti.com.br`). User criado com sucesso. ✅

Limpeza: usuário deletado após teste.

### Validação 2 — Signup REST gera entrada com email_confirmed_at NULL

```bash
curl -X POST "https://shjtwrojdgotmxdbpbta.supabase.co/auth/v1/signup" \
  -H "apikey: <ANON_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"email":"joaopedro@plexalabs.com","password":"CaixaBoti2026!"}'
```

**HTTP 200**, resposta:

```json
{
  "id": "34900864-93b7-42fa-8a3b-4f1b8f5e0bfa",
  "email": "joaopedro@plexalabs.com",
  "confirmation_sent_at": "2026-04-30T00:43:57.51683201Z",
  "user_metadata": { "email_verified": false }
}
```

`auth.users.email_confirmed_at = NULL` confirmado por SQL. ✅

### Validação 5 — fn_auto_papel_inicial atribuiu admin+operador

```sql
SELECT papel FROM public.usuario_papel
WHERE usuario_id = (SELECT id FROM auth.users WHERE email = 'joaopedro@plexalabs.com');
```

**Resultado:**
```
admin     | 2026-04-29 21:43:57.500446-03
operador  | 2026-04-29 21:43:57.500446-03
```

✅ Primeiro usuário do sistema vira anchor admin automaticamente.

### Validação 7 — login pré-confirmação bloqueado

```bash
curl -X POST "https://shjtwrojdgotmxdbpbta.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_JWT>" \
  -d '{"email":"joaopedro@plexalabs.com","password":"CaixaBoti2026!"}'
```

**HTTP 400**, resposta:

```json
{ "code": 400, "error_code": "email_not_confirmed", "msg": "Email not confirmed" }
```

✅ Confirma RN-070a — `Confirm email` ON está bloqueando login antes da confirmação.

---

## Validação 3 (PENDENTE) — Resend SMTP + template OTP

### Achado nos logs

`get_logs(service: auth)` mostra a tentativa de envio:

```json
{
  "event": "mail.send",
  "mail_from": "noreply@mail.app.supabase.io",   ← SMTP padrão Supabase
  "mail_to": "joaopedro@plexalabs.com",
  "mail_type": "confirmation"
}
```

**Conclusão**: o Operador **ainda não configurou Custom SMTP**. O email está sendo enviado pelo SMTP padrão do Supabase, com sender genérico `noreply@mail.app.supabase.io`. O conteúdo padrão também é **magic link** (`{{ .ConfirmationURL }}`), **não** OTP de 6 dígitos.

### Implicações

- O email pode ter caído em spam (sender com baixa reputação).
- Mesmo se chegar, terá um link clicável em vez do código de 6 dígitos.
- Quando o Operador clicar no link, o usuário fica confirmado mas sem o fluxo OTP — funcional para ele acessar agora, mas não testa o fluxo final.

### Ação requerida do Operador (SETUP_RESEND_SMTP.md)

1. Configurar Custom SMTP no Supabase Auth (Resend, smtp.resend.com:465, user `resend`, password = `RESEND_API_KEY`).
2. Editar template **Confirm signup**: substituir corpo padrão por HTML pt-BR com `{{ .Token }}`.
3. (Opcional) Editar templates Reset Password, Magic Link, Change Email — todos com `{{ .Token }}`.
4. Repetir signup de teste e validar que email vem com sender `Caixa Boti <noreply@plexalabs.com>` e contém código de 6 dígitos.

> **Importante**: a **variável correta** do template é `{{ .Token }}` (validada na [doc oficial Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless#with-otp), confirmado em consulta ao MCP de docs em 2026-04-29). A presença de `{{ .Token }}` no template **muda o comportamento** do Supabase: em vez de magic link, envia OTP de 6 dígitos.

---

## Validação 8 (APROVADA pós-hotfix migration 193) — `app.invocar_edge`

### Causa raiz final

A primeira tentativa do hotfix (migration 192) introduziu um bug próprio: lia a coluna `secret` da view `vault.decrypted_secrets`, **mas essa coluna é o ciphertext base64 raw, não o plaintext**. Verificado via `pg_get_viewdef('vault.decrypted_secrets')`:

```sql
CREATE VIEW vault.decrypted_secrets AS
SELECT id, name, description, secret,
       convert_from(vault._crypto_aead_det_decrypt(
           message     := decode(secret, 'base64'),
           additional  := convert_to(id::text, 'utf8'),
           key_id      := 0,
           context     := '\x7067736f6469756d'::bytea,
           nonce       := nonce
       ), 'utf8') AS decrypted_secret,    -- ← essa é a coluna do plaintext
       key_id, nonce, created_at, updated_at
FROM vault.secrets;
```

Como o agente leu `secret` em vez de `decrypted_secret`, a validação JWT (`prefix eyJ`, 3 partes) sempre falhava — porque ciphertext base64 não tem essa estrutura. Cada `vault.update_secret` regerava o nonce e produzia um ciphertext novo (daí a mudança de prefix `WLn4...` → `1CNb...` → `vbAE+...` → `lCiih...` que o agente confundiu com "valores errados do operador"). **O Operador colocou a service_role correta na primeira vez.**

### Migration 193

Trocou `secret` por `decrypted_secret` na função `app.invocar_edge`. Demais validações (btrim, JWT format, log) preservadas.

### Validação real pós-hotfix

```sql
-- Confirma JWT correto no vault (lendo decrypted_secret)
SELECT length(decrypted_secret), array_length(string_to_array(decrypted_secret, '.'), 1) AS partes,
       substr(decrypted_secret, 1, 5) AS prefix
FROM vault.decrypted_secrets WHERE name = 'service_role_key';
-- → len=219, partes=3, prefix='eyJhb' ✅

-- Dispara invocacao
SELECT app.invocar_edge('cria_caixa_diario', '{}'::jsonb);
-- → req_id=7 (bigint, sem RAISE EXCEPTION) ✅

-- Inspeciona resposta HTTP
SELECT id, status_code, error_msg, content_type FROM net._http_response WHERE id=7;
-- → status_code=200, error_msg=NULL, content_type='application/json' ✅

-- Conteudo da resposta (edge function executou):
-- {
--   "inicio": "2026-04-30T21:32:23.188Z",
--   "fim":    "2026-04-30T21:32:23.541Z",
--   "timezone": "America/Sao_Paulo",
--   "dow_brt": 4,
--   "resultados": [{"data":"2026-04-30","id":"bcb22089-d964-49ce-998c-3f7a7d72dc34","status":"ok"}]
-- }
```

✅ **Circuito banco → vault → pg_net → HTTP → edge function → RPC → caixa criado**, end-to-end. Caixa de teste deletado após validação.

### Lição aprendida

- Sempre conferir definição de view antes de assumir nome de coluna (`pg_get_viewdef` é barato).
- Quando a `vault.decrypted_secrets` tem **9 colunas** (`id, name, description, secret, decrypted_secret, key_id, nonce, created_at, updated_at`), a coluna `secret` mantém o ciphertext base64 cru e a coluna `decrypted_secret` é a derivada via `convert_from(crypto_aead_det_decrypt(...))`. Documentação do Supabase Vault não destaca essa distinção.
- O sintoma do bug ("libcurl bad argument") era enganoso: parecia URL/header malformado, mas era o token sendo o ciphertext binário de 340 chars com caracteres de controle, que o `pg_net` rejeita ao montar o header `Authorization: Bearer <ciphertext>`.

---

## Validação 9 — Cloudflare Pages

⏳ Adiada para Fase 2 (não há código frontend para deployar ainda). Validada quando primeiro deploy ocorrer.

---

## Conclusão

**8 de 9 validações ✅ aprovadas.** A #9 fica para a Fase 2 quando houver código frontend deployado.

Bugs fixados durante o smoke test:
- Migration 192 (vault) → migration 193 corrige leitura de `decrypted_secret` em vez de `secret`.

Decisão: smoke test final aprovado para os 8 itens auditáveis nesta fase. Pronto para Fase 2.
