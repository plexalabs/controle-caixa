# Instalador Caixa Boti — Windows 10

Instalação automatizada do sistema Caixa Boti com Cloudflare Tunnel.
Single-click para o Operador rodar no PC do trabalho.

> Documento de referência completa do que está sendo instalado:
> [`docs/DEPLOY_LOCAL.md`](../../docs/DEPLOY_LOCAL.md).

## Pré-requisitos

- Windows 10 com permissão admin
- Conexão de internet estável (egress 443)
- Conta Cloudflare ativa (já existente)
- Domínio `plexalabs.com` em zona Cloudflare (já existente)
- Acesso ao `VITE_SUPABASE_ANON_KEY` e `VITE_SENTRY_DSN` do projeto
  (operador deve ter os valores em mãos antes de começar)

## Como usar

1. Baixe a pasta `infra/instalador/` para o PC (ou clone o repo
   inteiro e navegue até essa pasta)
2. Clique com o botão direito em `instalar-caixa-boti.bat`
3. Selecione **"Executar como administrador"**
4. Siga as instruções no terminal
5. Em algum momento vai abrir o browser para autorizar o Cloudflare —
   selecione zona `plexalabs.com` e clique **Authorize**
6. Cole as credenciais quando pedir
7. Aguarde conclusão (~10–15 min na primeira execução)

## Pós-instalação

Sistema disponível em: <https://caixa-boti.plexalabs.com>

### Verificar status

```cmd
sc query cloudflared       :: servico do tunnel
pm2 status                 :: servico do app
```

Ambos devem aparecer como `RUNNING` / `online`.

### Atualizar código (após `git push` na main)

```cmd
cd C:\caixa-boti
git pull
npm install
npm run build
pm2 restart caixa-boti
```

Tudo isso pode ser executado rodando o instalador novamente — as
etapas 5, 7 e 9 são idempotentes e farão exatamente esses 4 passos.

### Logs

```cmd
pm2 logs caixa-boti              :: logs em streaming do app
pm2 logs caixa-boti --lines 50   :: ultimas 50 linhas
```

`cloudflared` loga em `C:\Windows\System32\config\systemprofile\.cloudflared\`.
Erros de runtime do app vão pro Sentry (se `VITE_SENTRY_DSN` foi
configurado na etapa 6).

## Fluxo das 9 etapas

| # | Arquivo | O que faz | Idempotente? |
|---|---|---|---|
| 1 | `01-verificar-prereqs.bat` | Admin, internet, PowerShell ExecutionPolicy | sim |
| 2 | `02-instalar-nodejs.bat` | Baixa+instala Node 20.18.0 LTS | sim — pula se `node` no PATH |
| 3 | `03-instalar-git.bat` | Baixa+instala Git for Windows (latest release) | sim — pula se `git` no PATH |
| 4 | `04-instalar-cloudflared.bat` | Baixa+instala cloudflared MSI | sim — pula se `cloudflared` no PATH |
| 5 | `05-clonar-repo.bat` | `git clone` em `C:\caixa-boti` | sim — `git pull` se já clonado |
| 6 | `06-configurar-env.bat` | Prompt interativo, escreve `.env.local` | sim — pula se já existe |
| 7 | `07-build-inicial.bat` | `npm install` + `npm run build` | sim — npm garante |
| 8 | `08-setup-tunnel.bat` | `cloudflared login`+`create`+route DNS+service install | sim — checa se tunnel existe |
| 9 | `09-pm2-autostart.bat` | PM2 + `pm2-windows-startup` + `pm2 start` | sim — `restart` se já existe |

Idempotência é total: se uma etapa falhar, conserte a causa e
**rode o instalador de novo**. Ele retoma do ponto correto sem
duplicar trabalho ou estragar configuração já feita.

## Troubleshooting

### Antivírus bloqueando `cloudflared.exe`

Adicione exceção no Windows Defender:

1. Configurações → Segurança do Windows → Proteção contra vírus e ameaças
2. Gerenciar configurações → Adicionar ou remover exclusões
3. Adicionar exclusão → Pasta → `C:\Program Files (x86)\cloudflared\`

### PowerShell ExecutionPolicy bloqueado

A etapa 1 já trata, mas se ainda assim falhar:

```cmd
powershell -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force"
```

### Tunnel não conecta

```cmd
cloudflared tunnel info caixa-boti
sc query cloudflared
```

`STATE: RUNNING` no `sc query` é obrigatório. Se estiver `STOPPED`:

```cmd
sc start cloudflared
```

### App não está rodando (502 ou erro de gateway)

```cmd
pm2 status
pm2 logs caixa-boti --lines 50
```

Reinicia: `pm2 restart caixa-boti`.

### Repo privado (clone retorna 403)

Se o `plexalabs/controle-caixa` virar privado:

1. Crie um Personal Access Token com escopo `repo` em
   <https://github.com/settings/tokens>
2. Habilite o Git Credential Manager:

   ```cmd
   git config --global credential.helper manager
   ```

3. Rode o instalador de novo. O Credential Manager vai abrir um
   diálogo pedindo usuário/PAT na primeira vez.

### Reinstalação do zero

```cmd
pm2 stop caixa-boti
pm2 delete caixa-boti
pm2 save --force
sc stop cloudflared
cloudflared service uninstall
rmdir /s /q C:\caixa-boti
```

Depois rode o instalador.

## Limites conhecidos

- **Versão do Node hardcoded** (`v20.18.0`). Quando passar de ~6 meses
  da release, atualizar a URL em `etapas/02-instalar-nodejs.bat`.
- **Pasta `recursos/` vazia**: a estratégia escolhida foi baixar
  instaladores em runtime (mais leve no Git, sempre versão recente).
  Se quiser pacote 100% offline, baixar os MSIs e o EXE do Git para
  `recursos/` e adaptar etapas 2–4 para checar a pasta antes de
  baixar da internet.
- **Não testado headlessly**: este instalador foi escrito por agente
  sem ambiente Windows. Sintaxe `.bat` validada, mas o fluxo
  end-to-end depende de validação manual no PC alvo. Reportar bugs
  para tratar em iteração futura.
