# INFRA — Configurações de produção

> Coisas que precisam ser feitas **fora do código** (Dashboards, env vars,
> contas) antes do deploy. Atualizado em 2026-05-02 (CP-PRE-DEPLOY-1).

## Sentry — logs de produção

Sem o DSN, o `Sentry.init()` em `web/app/main.js` é pulado e nada vai pra
plataforma. Erros viram apenas `console.error`.

### Setup

1. Criar conta em https://sentry.io (free tier 5K eventos/mês)
2. Criar org **plexalabs** + projeto **caixa-boti** (platform: Browser JavaScript)
3. Copiar o DSN do projeto (formato `https://xxx@sentry.io/yyy`)
4. Em `.env.production` (ou env do Cloudflare Pages), adicionar:
   ```
   VITE_SENTRY_DSN=https://xxx@sentry.io/yyy
   ```
5. Rebuild: `npm run build` — Vite injeta `import.meta.env.VITE_SENTRY_DSN`
   no bundle apenas em PROD.

### Por que condicional ao PROD

Em dev (`npm run dev`), `import.meta.env.PROD` é `false` — Sentry init
nunca roda. Evita ruído de logs de desenvolvimento poluindo o dashboard
e facilita rodar local sem precisar de DSN.

### O que vai pro Sentry

- `log.warn(msg, ctx)` → captureMessage level=warning
- `log.erro(msg, error, ctx)` → captureException (Error) ou captureMessage (outros)
- `log.info(msg, ctx)` **NÃO** vai (só console — evita volume de dados informativos)

URLs com tokens (`?token=`, `?access_token=`, `?refresh_token=`, `?code=`) são
sanitizadas em `beforeSend` antes de enviar — nunca expomos credenciais ao Sentry.

## Edge function `arquivar-mensal` — agendamento cron

A RPC `arquivar_antigos()` move lançamentos `finalizado`/`cancelado_pos`
de caixas com `data < hoje - dias_retencao_arquivamento` (default 365)
para `lancamento_arquivado`. A edge function expõe isso via HTTP, mas
**não roda sozinha** — precisa de cron.

### Deploy da edge function

```bash
npx supabase functions deploy arquivar-mensal
```

### Configurar cron

No Dashboard Supabase → **Edge Functions** → **arquivar-mensal** → **Schedules**:

| Campo | Valor |
|---|---|
| Cron expression | `0 3 1 * *` |
| Descrição | "Arquivamento mensal automático às 3h do dia 1" |

Cron `0 3 1 * *` = todo dia 1 do mês às 3h da manhã (horário do servidor Supabase = UTC).

### Validação manual

```bash
curl -X POST -H "Authorization: Bearer SERVICE_ROLE" \
  https://shjtwrojdgotmxdbpbta.supabase.co/functions/v1/arquivar-mensal
```

Resposta esperada:
```json
{
  "ok": true,
  "arquivados": 0,
  "ignorados_com_observacoes": 0,
  "executado_em": "2026-05-02T..."
}
```

### Comportamento crítico

A RPC **só arquiva lançamentos sem observações**. Lançamentos com
`lancamento_observacao` ficam vivos para preservar a auditoria
(observações são imutáveis por trigger; FK ON DELETE RESTRICT bloquearia
o DELETE de qualquer jeito). O retorno mostra quantos foram ignorados
nessa categoria.

Para mudar o período de retenção, admin edita a chave
`dias_retencao_arquivamento` em `/configuracoes/sistema` (sem precisar
re-deploy).

## Storage de sessão (IndexedDB)

A sessão Supabase fica em IndexedDB (`caixa-boti-auth` database, store
`sessao`) via adapter síncrono em `web/app/auth-storage.js`. Pré-carregada
no boot pelo `prepararAuthStorage()` antes de `getSession()`.

Se o operador relatar "F5 me joga pra login" (regressão do bug do
CP-PRE-DEPLOY-1), conferir:

1. Console: erro `IndexedDB open failed` → indica navegador sem suporte
   ou modo privado bloqueando IndexedDB
2. Application → Storage → IndexedDB → `caixa-boti-auth` → store `sessao`
   → deve ter chave `caixa-boti-auth` com valor JSON da sessão
3. Se vazio mesmo logado: `prepararAuthStorage` falhou silenciosamente
   (cai pra `cacheMemoria` em RAM, F5 perde como antes)

## Variáveis de ambiente

| Variável | Onde | Quando |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` (dev) e env Cloudflare (prod) | sempre |
| `VITE_SUPABASE_ANON_KEY` | idem | sempre |
| `VITE_SENTRY_DSN` | `.env.production` ou env Cloudflare | só prod, opcional |

`.env.local` está no `.gitignore` — nunca commitar.
