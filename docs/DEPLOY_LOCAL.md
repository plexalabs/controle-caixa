# Deploy Local — Caixa Boti via Cloudflare Tunnel

Documento de instalação manual. A Sessão 2 do CP-DEPLOY-LOCAL produzirá
um instalador empacotado (`.bat`) que automatiza estes passos.

## Visão geral

```
Internet → caixa-boti.plexalabs.com
              ↓
         Cloudflare (DNS + TLS)
              ↓
       Cloudflare Tunnel (cloudflared)
              ↓
    PC do trabalho (Windows 10)
              ↓
   Vite preview em 127.0.0.1:4173
              ↓
   Supabase em shjtwrojdgotmxdbpbta.supabase.co
```

## Pré-requisitos

- Windows 10 com permissão admin
- Conta Cloudflare (já existente)
- Domínio `plexalabs.com` em zona Cloudflare (já existente)
- Sem firewall corporativo bloqueando saída HTTPS (cloudflared usa 443)

## Passo 1 — Instalar dependências

### Node.js 20+

Baixar em https://nodejs.org/ (LTS).
Durante instalação, marcar opção "Add to PATH".

```cmd
node --version    :: esperado: v20.x.x ou superior
npm --version     :: esperado: 10.x.x ou superior
```

### Git

Baixar em https://git-scm.com/download/win.
Aceitar defaults durante instalação.

```cmd
git --version    :: esperado: 2.x.x
```

### cloudflared

Baixar MSI em https://github.com/cloudflare/cloudflared/releases
(arquivo `cloudflared-windows-amd64.msi`). Instalar normalmente.

```cmd
cloudflared --version
```

## Passo 2 — Clonar o repositório

```cmd
mkdir C:\caixa-boti
cd C:\caixa-boti
git clone https://github.com/plexalabs/controle-caixa.git .
npm install
```

## Passo 3 — Configurar credenciais

Criar `.env.local` na raiz do projeto:

```
VITE_SUPABASE_URL=https://shjtwrojdgotmxdbpbta.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...COLE_AQUI...
VITE_SENTRY_DSN=https://9b198954a1ba50aa05d79ec34f6ab304@o4511051433115648.ingest.us.sentry.io/4511321945210880
```

`VITE_SUPABASE_ANON_KEY` e `VITE_SENTRY_DSN`: o Operador deve copiar
de fonte pessoal segura (não estão no Git). Referência completa em
`.env.example`.

> **Por que `.env.local` e não `.env.production`?** O Vite preview também
> serve um build de produção (`PROD === true`), mas lê `.env.local` em
> modos `development` E `production` quando o arquivo existe. Manter
> tudo num arquivo só evita confusão.

## Passo 4 — Build inicial

```cmd
npm run build
```

Esperar `✓ built in Xs`. Pasta `dist/` fica criada.

## Passo 5 — Cloudflare Tunnel: setup

### 5A. Login no cloudflared

```cmd
cloudflared tunnel login
```

Abre o browser. Autorizar o domínio `plexalabs.com`. Voltar ao terminal.

### 5B. Criar tunnel

```cmd
cloudflared tunnel create caixa-boti
```

Saída tipo:
```
Created tunnel caixa-boti with id 12345678-abcd-...
Credentials file: C:\Users\OPERADOR\.cloudflared\12345678-abcd-....json
```

**Anotar o TUNNEL_ID e o caminho do credentials-file.**

### 5C. Atualizar config.yml

Editar `infra/tunnel/config.yml`:

- Substituir `TUNNEL_ID_AQUI` pelo id real (nas duas ocorrências)
- Substituir caminho do credentials-file pelo real

Confirmar que `service:` aponta pra `http://127.0.0.1:4173` (não usar
`localhost` — pode resolver pra IPv6 e falhar).

### 5D. Configurar DNS

```cmd
cloudflared tunnel route dns caixa-boti caixa-boti.plexalabs.com
```

Cria automaticamente o registro CNAME no Cloudflare.

### 5E. Testar tunnel manualmente

Em uma janela CMD, rodar o sistema:

```cmd
cd C:\caixa-boti
npm run start:local
```

Espera ver `Local: http://127.0.0.1:4173/`.

Em outra janela CMD, subir o tunnel:

```cmd
cloudflared tunnel --config C:\caixa-boti\infra\tunnel\config.yml run caixa-boti
```

Em qualquer browser, abrir https://caixa-boti.plexalabs.com.

Esperado: site carrega, login funciona.

Se funcionar, fechar o tunnel (Ctrl+C). Vamos transformá-lo em serviço.

## Passo 6 — Cloudflare Tunnel como serviço Windows

Em CMD admin:

```cmd
cloudflared service install --config C:\caixa-boti\infra\tunnel\config.yml
```

Iniciar serviço:

```cmd
sc start cloudflared
```

Conferir status:

```cmd
sc query cloudflared
```

Deve mostrar `STATE: RUNNING`.

A partir daqui, o tunnel sobe automaticamente quando o Windows liga.

## Passo 7 — Sistema rodando 24/7

O Vite preview NÃO é serviço Windows nativo. Precisa de um wrapper.

### Opção A — Manual (Operador inicia ao chegar)

Atalho na área de trabalho:

- Target: `cmd /k "cd /d C:\caixa-boti && npm run start:local"`

Operador clica de manhã. Sistema fica rodando enquanto a janela CMD
estiver aberta.

### Opção B — Auto-start via Task Scheduler

Tarefa do Windows que dispara `npm run start:local` no boot:

1. Abrir Task Scheduler
2. Create Task
3. Triggers: `At startup`
4. Actions: `Start a program`
   - Program: `C:\Program Files\nodejs\npm.cmd`
   - Arguments: `run start:local`
   - Start in: `C:\caixa-boti`
5. Marcar `Run whether user is logged on or not`
6. Salvar

### Opção C — PM2 (recomendado)

```cmd
npm install -g pm2 pm2-windows-startup
pm2-startup install
cd C:\caixa-boti
pm2 start npm --name "caixa-boti" -- run start:local
pm2 save
```

PM2 reinicia o app automaticamente se ele crashar e mantém log
estruturado.

## Passo 8 — Atualizar Supabase Auth

Em https://supabase.com/dashboard/project/shjtwrojdgotmxdbpbta/auth/url-configuration:

- **Site URL**: `https://caixa-boti.plexalabs.com`
- **Redirect URLs**:
  - `https://caixa-boti.plexalabs.com/**`
  - `http://localhost:5173/**` (dev)

Sem isso, links de email (recovery, magic link) caem no domínio errado.

## Passo 9 — Smoke test

1. Acessar `https://caixa-boti.plexalabs.com` de qualquer dispositivo
2. Login com email/senha
3. Criar lançamento de teste
4. Conferir realtime (abrir 2 abas, criar num e ver chegar no outro)
5. Logout, login novamente
6. Disparar email de recuperação de senha — confere que chega e link funciona

## Manutenção

### Atualizar código

```cmd
cd C:\caixa-boti
git pull
npm install
npm run build
pm2 restart caixa-boti   :: se usando PM2
```

Se não usar PM2, fechar o CMD que rodava `npm run start:local` e abrir
de novo (ou rebootar para Task Scheduler relançar).

### Rebootar PC

Tudo volta automaticamente:

- `cloudflared` (serviço Windows)
- `npm preview` (PM2 ou Task Scheduler)

### Logs

- cloudflared: `C:\Windows\System32\config\systemprofile\.cloudflared\*.log`
- PM2: `pm2 logs caixa-boti`
- Sentry: https://sentry.io (erros do navegador chegam por DSN)

## Trade-offs aceitos

- PC do trabalho deve estar ligado para o sistema funcionar
- Internet do trabalho é a SLA do sistema
- Restart do PC = ~30s de downtime
- Sentry continua funcionando (DSN configurado em `.env.local`)
- Cron do arquivamento mensal roda no Supabase, não depende do PC
  (configurar uma vez no Dashboard → Edge Functions → Schedules)

## Pendências

- Sessão 2 do CP-DEPLOY-LOCAL: instalador `.bat` que automatiza
  Passos 1 a 7 num clique
