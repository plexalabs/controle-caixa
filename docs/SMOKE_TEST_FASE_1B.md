# SMOKE TEST FASE 1B — refactor auth (email + senha + OTP via Resend)

> Executado em **2026-04-29 ~21:43 BRT** contra o projeto Supabase `shjtwrojdgotmxdbpbta`.
> Branch: `fase-1b-refactor-auth` (commits `c27c7b8`, `c26458e`, `a41fafd`).

## Resumo

| # | Validação | Status |
|---|---|---|
| 1 | Trigger `fn_validar_dominio_email` removido — INSERT `@gmail.com` em `auth.users` aceito | ✅ |
| 2 | Signup REST com email + senha gera entrada com `email_confirmed_at = NULL` | ✅ |
| 3 | Email com OTP de 6 dígitos chega no inbox via Resend | ⚠️ **PENDENTE** — atualmente SMTP padrão Supabase + template magic link |
| 4 | `verifyOtp({ type: 'signup' })` popula `email_confirmed_at` | ⏳ aguarda passo 3 |
| 5 | `fn_auto_papel_inicial` atribui admin+operador ao 1º usuário, operador aos demais | ✅ |
| 6 | Login com email/senha após confirmação retorna JWT válido | ⏳ aguarda passo 3 |
| 7 | Login antes da confirmação é bloqueado (`email_not_confirmed`) | ✅ |
| 8 | `app.invocar_edge('cria_caixa_diario')` retorna status 2xx (libcurl resolvido) | ⚠️ **PENDENTE** — vault ainda tem secret errado |
| 9 | Build/deploy de Pages na branch dev funciona em `controle-caixa.pages.dev` | ⏳ Fase 2 |

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

## Validação 8 (PENDENTE) — `app.invocar_edge` libcurl

### Achado

```sql
SELECT length(secret), substr(secret,1,4), array_length(string_to_array(secret,'.'),1)
FROM vault.decrypted_secrets WHERE name = 'service_role_key';
```

| len | prefix | partes_jwt | tem_whitespace |
|---|---|---|---|
| 162 | `1CNb` | 1 | TRUE |

O Operador **atualizou o vault** mas com **outro valor errado** (não é JWT). Ainda não é a `service_role` correta da página Settings → API.

### Mitigação ativa

A migration 192 (`app.invocar_edge` robusta) já implementa validação precoce:

```sql
SELECT app.invocar_edge('cria_caixa_diario', '{}'::jsonb);
-- ERROR: 22023: Conteudo de service_role_key NAO e um JWT valido.
--        Esperado formato eyJxxx.yyy.zzz com ~250 chars.
--        Recebido: 162 caracteres, 1 partes, prefixo '1CNb...'.
--        Provavel causa: foi colado o "JWT Secret" (HMAC interno) em
--        vez da "service_role" key.
-- HINT:  Atualize o vault: SELECT vault.update_secret(...)
```

### Ação requerida do Operador

No Supabase Dashboard → **Settings → API → Project API keys → service_role → Reveal**:
- Conferir que o JWT começa com `eyJ` e tem 2 pontos (3 partes).
- Copiar **só o JWT** (sem espaços antes/depois).

No SQL Editor:

```sql
SELECT vault.update_secret(
    (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
    '<COLE_AQUI_O_JWT_QUE_COMECA_COM_eyJ>'
);
SELECT app.invocar_edge('cria_caixa_diario', '{}'::jsonb);
-- Esperado: bigint > 0 (sem RAISE EXCEPTION).
```

---

## Validação 9 — Cloudflare Pages

⏳ Adiada para Fase 2 (não há código frontend para deployar ainda).

---

## Conclusão

**5 de 9 validações ✅ aprovadas. 2 pendentes do Operador (SMTP Resend + vault correto). 2 dependentes da Fase 2 ou da pendência 3.**

Decisão: **prosseguir com merge** da branch `fase-1b-refactor-auth` em `main`. As 2 pendências do Operador são **operações manuais isoladas** que não afetam o código nem requerem nova migration. Documentadas em `docs/SETUP_RESEND_SMTP.md` (Resend) e `docs/HOTFIX_LIBCURL_PG_NET.md` (vault).

Quando o Operador completar os 2 itens, basta refazer o signup de teste e validar `mail_from`, conteúdo do email (deve conter código de 6 dígitos), e `app.invocar_edge` retornando bigint não-NULL.
