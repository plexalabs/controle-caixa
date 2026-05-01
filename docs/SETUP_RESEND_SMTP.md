# SETUP RESEND SMTP — passo a passo no Dashboard Supabase

> **Objetivo:** configurar o Supabase Auth para enviar emails de confirmação (OTP de 6 dígitos) via Resend, usando o domínio `plexalabs.com` já verificado.
>
> **Quem executa:** Operador, no Dashboard do Supabase Cloud.
>
> **Por que manual:** o MCP `mcp__plugin_supabase_supabase__*` **não expõe** APIs de configuração de Auth/SMTP/Templates. Esses ajustes só acontecem via Dashboard ou via Management API REST. Como a operação é única (não recorrente), o caminho mais limpo é o Dashboard.
>
> **Tempo estimado:** 3 a 5 minutos.

---

## Pré-requisitos

- [ ] `RESEND_API_KEY` em mãos (formato `re_...`). Disponível em `docs/Vault.md` local.
- [ ] Domínio `plexalabs.com` já verificado no Resend (DKIM + SPF passando). Confirmar em Resend → Domains.
- [ ] Acesso de **Owner** ou **Developer** ao projeto Supabase `controle-caixa-prod` (ref `shjtwrojdgotmxdbpbta`).

---

## Passo 1 — Habilitar Custom SMTP

1. Acessar https://supabase.com/dashboard/project/shjtwrojdgotmxdbpbta/auth/providers
2. Localizar a seção **"SMTP Settings"** (rola para baixo na página de Auth Providers).
3. Toggle **Enable Custom SMTP** → ON.
4. Preencher exatamente:

| Campo | Valor |
|---|---|
| **Sender email** | `noreply@plexalabs.com` |
| **Sender name** | `Caixa Boti` |
| **Host** | `smtp.resend.com` |
| **Port number** | `465` |
| **Username** | `resend` |
| **Password** | (cole a `RESEND_API_KEY` do Vault — começa com `re_`) |
| **Minimum interval between emails** | `60` (segundos — rate limit anti-spam) |

5. Clicar em **Save**.

> **Por que porta 465 e não 587:** porta 465 usa SSL implícito (mais robusto em redes corporativas que bloqueiam STARTTLS). Resend suporta ambas; o Supabase Auth tem melhor compatibilidade com 465.

---

## Passo 2 — Habilitar Confirm Email

1. Na mesma página de Auth, ir em **"Email" provider**.
2. Confirmar que está **Enabled** (deve estar por padrão).
3. Toggle **Confirm email** → ON. **Crítico** — sem isso, signup não dispara email.
4. Toggle **Secure email change** → ON (boa prática).
5. Toggle **Secure password change** → ON.
6. Toggle **Allow signups** → ON (queremos cadastro aberto).
7. **Email OTP Expiration**: deixar em `3600` (1 hora) — padrão. O prompt original dizia 10 minutos; no Supabase atual o mínimo configurável via Dashboard é 1 hora.
8. **Email OTP Length**: `6` (padrão).
9. Clicar em **Save** se houver alterações.

---

## Passo 3 — Editar template "Confirm signup" (OTP em pt-BR)

1. Acessar https://supabase.com/dashboard/project/shjtwrojdgotmxdbpbta/auth/templates
2. Selecionar **"Confirm signup"** na lista lateral.
3. Em **Subject heading**, colar:
   ```
   Seu código de acesso — Caixa Boti
   ```
4. Em **Message body**, **APAGAR todo o conteúdo padrão** (que usa Magic Link `{{ .ConfirmationURL }}`) e colar exatamente:
   ```html
   <h2>Bem-vindo ao Caixa Boti</h2>
   <p>Seu código de verificação é:</p>
   <h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">{{ .Token }}</h1>
   <p>Esse código expira em 1 hora.</p>
   <p>Se você não solicitou esse código, ignore este email.</p>
   ```
5. Clicar em **Save changes**.

> **Variável crítica:** `{{ .Token }}` — confirmado na [documentação oficial](https://supabase.com/docs/guides/auth/auth-email-passwordless#with-otp). O Supabase atual usa exatamente esse nome (não `{{ .ConfirmationCode }}`).
>
> **Como funciona:** quando o template do "Confirm signup" contém `{{ .Token }}` (e não `{{ .ConfirmationURL }}`), o Supabase muda o comportamento e envia o OTP de 6 dígitos em vez do magic link. Mesma escolha vale para "Magic Link", "Reset Password", "Change Email", etc — basta colocar `{{ .Token }}` no template.

---

## Passo 4 — (Opcional, recomendado) Editar templates relacionados

Para experiência consistente em pt-BR, também editar:

### Template "Reset Password"
- **Subject:** `Redefinir senha — Caixa Boti`
- **Body:**
  ```html
  <h2>Redefinição de senha — Caixa Boti</h2>
  <p>Use este código para redefinir sua senha:</p>
  <h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">{{ .Token }}</h1>
  <p>Esse código expira em 1 hora. Se você não solicitou, ignore este email.</p>
  ```

### Template "Magic Link"
Não vamos usar magic link no MVP, mas se algum cliente acidentalmente disparar:
- **Subject:** `Código de acesso — Caixa Boti`
- **Body:**
  ```html
  <h2>Acesso ao Caixa Boti</h2>
  <p>Seu código:</p>
  <h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">{{ .Token }}</h1>
  ```

### Template "Change Email"
- **Subject:** `Confirmar troca de email — Caixa Boti`
- **Body:**
  ```html
  <h2>Confirmação de troca de email</h2>
  <p>Use este código para confirmar a alteração:</p>
  <h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">{{ .Token }}</h1>
  ```

---

## Passo 5 — URL Configuration (referência)

Para a Fase 2 (Web), configurar em https://supabase.com/dashboard/project/shjtwrojdgotmxdbpbta/auth/url-configuration:

- **Site URL:** `https://controle-caixa.pages.dev` (dev) — atualizar para `https://caixa-boti.plexalabs.com` quando UAT aprovar.
- **Redirect URLs (Additional):**
  - `https://controle-caixa.pages.dev/**`
  - `https://caixa-boti.plexalabs.com/**`
  - `http://localhost:5173/**` (Vite dev server)

**Não precisa fazer agora** — a Web ainda não está deployada. Faz na Fase 2.

---

## Passo 6 — Validar com signup de teste

Logo após salvar tudo acima, voltar aqui no chat e me avisar **"SMTP configurado, pode testar signup"**. Eu rodo via SQL Editor:

```sql
-- O agente vai rodar isso no smoke test do Bloco F:
-- (signup REST direto em vez de SDK porque não temos cliente JS instalado ainda)

-- 1. POST para /auth/v1/signup com email=joaopedro@plexalabs.com + senha aleatória
-- 2. Verifica auth.users.email_confirmed_at = NULL
-- 3. Operador verifica inbox e me passa o OTP recebido
-- 4. POST para /auth/v1/verify com type=signup + token=<OTP>
-- 5. Confirma email_confirmed_at != NULL
-- 6. POST para /auth/v1/token?grant_type=password retorna JWT
```

Se o email **não chegar** em até 2 minutos:
- Verificar pasta de spam do `joaopedro@plexalabs.com`.
- Conferir em Resend → Logs se a tentativa apareceu.
- Conferir em Supabase Dashboard → Authentication → Logs se há erro de SMTP.
- Conferir DKIM/SPF do domínio `plexalabs.com` no painel do Resend.

---

## Troubleshooting

### "535 Authentication failed"
- A `RESEND_API_KEY` foi colada errada. Conferir que começa com `re_`.
- Username deve ser literalmente `resend` (não o seu email).

### "Email rate limit exceeded"
- O usuário tentou signup mais de uma vez em < 60s. Aguarde ou ajuste o "Minimum interval" no SMTP settings.

### Email chega com link em vez de código
- O template "Confirm signup" ainda contém `{{ .ConfirmationURL }}`. Apagar e usar só `{{ .Token }}` conforme passo 3.

### Email não chega e não tem erro
- Verificar Resend → Logs filtrando por "to: joaopedro@plexalabs.com".
- Conferir se domínio `plexalabs.com` está com `Verified` no Resend (DKIM verde).
- Aumentar tempo de espera — Resend pode levar até 30s em horários de pico.

### "Email signup is disabled"
- Toggle "Allow signups" estava OFF. Ligar conforme Passo 2 item 6.

---

## Após este passo a passo

Avise no chat **"SMTP configurado"**. O agente vai rodar:
- Smoke test #2 (signup gera entrada com `email_confirmed_at = NULL`)
- Smoke test #3 (email com OTP de 6 dígitos chega no inbox)
- Smoke test #4 (verify popula `email_confirmed_at`)
- Smoke test #5 (papel atribuído)
- Smoke test #6 (login pós-confirmação retorna JWT)
- Smoke test #7 (login pré-confirmação bloqueado)

E reporta o resultado consolidado em `docs/SMOKE_TEST_FASE_1B.md`.

---

**Versão deste documento:** 1.0 — 2026-04-29
**Substituí:** `docs/SETUP_GOOGLE_OAUTH.md` (Google OAuth descontinuado nesta refatoração).
