# INFRA — Configurações de produção

> Coisas que precisam ser feitas **fora do código** (Dashboards, env vars,
> contas) antes do deploy. Atualizado em 2026-05-03 (deploy em Cloudflare Pages).

## Deploy via Cloudflare Pages

Sistema rodando em `https://caixa-boti.plexalabs.com` via Cloudflare
Pages. Build estático (`dist/`) servido pela CDN da Cloudflare; cada
push em `main` dispara redeploy automático via integração GitHub.

### Arquitetura

```
Internet → caixa-boti.plexalabs.com → Cloudflare Pages (CDN global)
                                              ↓
                                        Browser do usuario
                                              ↓
                                  Supabase (shjtwrojdgotmxdbpbta)
```

### Variáveis de ambiente (painel Cloudflare Pages)

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://shjtwrojdgotmxdbpbta.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (anon JWT do projeto) |
| `VITE_SENTRY_DSN` | DSN do projeto Sentry |
| `NODE_VERSION` | `20` |

### Web Analytics da Cloudflare

Desabilitado no Dashboard (Pages → Settings → Web Analytics) para
evitar conflito com a CSP estrita do `web/public/_headers`. O beacon
era injetado via `<script>` inline + carga de `static.cloudflareinsights.com`,
ambos bloqueados por `script-src 'self'`.

Mesmo desabilitado, o `_headers` permite explicitamente
`static.cloudflareinsights.com` em `script-src` e `cloudflareinsights.com`
em `connect-src` — funciona como fallback caso alguém reative o
Analytics no Dashboard sem coordenar.

## Sentry — logs de produção

Sem o DSN, o `Sentry.init()` em `web/app/main.js` é pulado e nada vai pra
plataforma. Erros viram apenas `console.error`.

### Status atual

- Conta + projeto criados em sentry.io
- DSN configurado em `.env.production` local (gitignored)
- Pendente: setar a env var no painel **Cloudflare Pages → Settings →
  Environment variables** antes do deploy de produção

DSN: `https://9b198954a1ba50aa05d79ec34f6ab304@o4511051433115648.ingest.us.sentry.io/4511321945210880`

### Configuração ativa em main.js

- `tracesSampleRate: 0.1` — 10% das transações
- `sendDefaultPii: true` — envia IP/user-agent (recomendado pelo Sentry pra
  apps internos próprios; ajuda no debug). Sistema é interno (operadores
  autenticados), então PII tá ok.
- `beforeSend` higieniza tokens de auth em URLs antes de enviar ao Sentry

### Reset / troca de projeto

Se precisar trocar de projeto/conta no futuro:
1. Atualizar `VITE_SENTRY_DSN` em `.env.production` local
2. Atualizar a env var no painel Cloudflare Pages
3. Próximo deploy injeta o novo DSN no bundle

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

## Backups do banco (Supabase Pro)

Supabase Pro inclui **Daily Backups** automáticos com retenção de 7 dias
— visível em [Dashboard → Database → Backups](https://supabase.com/dashboard/project/shjtwrojdgotmxdbpbta/database/backups).
Antes do deploy em produção, confirmar que está ativo e considerar
habilitar **Point-in-Time Recovery (PITR)** pra granularidade fina (qualquer
ponto nos últimos 7 dias, em vez de apenas o snapshot diário).

### Restaurar um backup

1. Dashboard → Database → Backups → seleciona snapshot → **Restore**
2. **CUIDADO**: restore sobrescreve o estado atual do banco — não há undo
3. Em produção, sempre testar o restore num projeto staging primeiro pra
   validar que não quebrou triggers/RLS/extensões custom

### Seeds vs dados operacionais

Lição do CP-PRE-DEPLOY-1: o TRUNCATE de "limpar tudo" pegou também a tabela
`config`, que é **seed** (parte do esqueleto do sistema, não dado
operacional). Resultado: app rodava mas `/configuracoes/sistema` ficou
vazio e RPCs que leem chaves passaram a falhar silenciosamente.

Distinguir antes de truncar:

| Categoria | Tabelas | Pode truncar? |
|---|---|---|
| Operacional | `lancamento`, `caixa`, `lancamento_observacao`, `notificacao`, `audit_log` | sim, pra reset |
| Seed | `config`, `feriado` | **não** — restaurar via migration `20260502150000_restore_seeds_pos_limpeza.sql` se truncar acidentalmente |
| Identidade | `usuario_papel`, `auth.users`, `vendedora` | só se for reset deliberado de acesso |

## CSP — Cloudflare Web Analytics

Cloudflare Pages injeta automaticamente um `<script>` inline + carrega
`beacon.min.js` de `static.cloudflareinsights.com` em todas as páginas
para coletar métricas de Web Analytics. A CSP estrita do `web/public/_headers`
bloqueia esses dois recursos por padrão.

Sintoma: tela em branco em produção; console mostra:

```
Executing inline script violates CSP directive 'script-src 'self''.
Loading 'https://static.cloudflareinsights.com/beacon.min.js' violates CSP.
```

Fix aplicado em `_headers`:
- `script-src` ganha `'sha256-VY2U1GTJm5dVbF6ZC0w0a1xAXWCy9dqDJB+VSyBud8E='`
  (hash exato do inline injetado) + `https://static.cloudflareinsights.com`
- `connect-src` ganha `https://cloudflareinsights.com` (beacon de telemetria)

**Nunca usar `'unsafe-inline'`** — derrubaria a segurança da CSP toda.
O hash específico só aceita aquele script exato.

### Se a Cloudflare atualizar o script

O hash quebra e o sintoma volta. Procedimento:
1. Abrir DevTools → Console em prod
2. Copiar o novo `'sha256-...'` que aparece na mensagem de erro
3. Substituir em `web/public/_headers`
4. Commit + push (Cloudflare redeploya em ~2 min)

## Variáveis de ambiente

| Variável | Onde | Quando |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` (dev) e env Cloudflare (prod) | sempre |
| `VITE_SUPABASE_ANON_KEY` | idem | sempre |
| `VITE_SENTRY_DSN` | `.env.production` ou env Cloudflare | só prod, opcional |

`.env.local` está no `.gitignore` — nunca commitar.
