# SETUP GOOGLE OAUTH — passo a passo manual

> **Objetivo:** criar o OAuth Client no Google Cloud Console que será usado pelo Supabase Auth para autenticar usuários do domínio `@vdboti.com.br` no sistema de Controle de Caixa.
>
> **Quem executa:** o Operador (você), com conta admin do Google Workspace `vdboti.com.br`.
>
> **Quando executar:** depois que o agente tiver criado o projeto Supabase e te passado a URL exata do callback (`https://<project-ref>.supabase.co/auth/v1/callback`). Sem essa URL você não pode terminar o passo 5.
>
> **Tempo estimado:** 10 a 15 minutos.
>
> **Por que duas camadas de defesa de domínio:**
> - Camada 1 (esta) — **OAuth consent screen com User Type = Internal**. O Google só aceita logins de contas do Workspace `vdboti.com.br`. Esta é a defesa real e mais forte.
> - Camada 2 — **Trigger Postgres `BEFORE INSERT` em `auth.users`** (será aplicada pelo agente no Checkpoint 3). Mesmo se algum dia o Workspace for desconfigurado, o banco rejeita.
> - Camada 3 — Parâmetro `hd=vdboti.com.br` na URL OAuth da Web. **NÃO é segurança**, apenas filtra o seletor de contas do Google na UI.

---

## SUMÁRIO

1. Pré-requisitos
2. Passo 1 — Acessar o Google Cloud Console
3. Passo 2 — Criar (ou reutilizar) projeto Google Cloud
4. Passo 3 — Configurar OAuth consent screen
5. Passo 4 — Criar OAuth 2.0 Client ID
6. Passo 5 — Adicionar Authorized redirect URIs (depende do agente)
7. Passo 6 — Capturar credenciais para devolver ao agente
8. Checklist final
9. O que NÃO fazer
10. Troubleshooting

---

## 1. PRÉ-REQUISITOS

- [ ] Conta Google logada no navegador com permissão de **Super Admin** ou **Project Editor** no Workspace `vdboti.com.br`.
- [ ] Acesso ao chat com o agente (para receber a URL do callback do Supabase no passo 5).
- [ ] Vault corporativo aberto para guardar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

---

## 2. PASSO 1 — ACESSAR O GOOGLE CLOUD CONSOLE

1. Abrir [`console.cloud.google.com`](https://console.cloud.google.com/) em uma janela anônima ou na sua conta `@vdboti.com.br` do Workspace.
2. No canto superior esquerdo, ao lado do logo "Google Cloud", clicar no **seletor de projeto** (mostra o nome do projeto atual ou "Selecionar um projeto").
3. Confirmar que a organização ativa no canto superior direito é **vdboti.com.br** — se não for, clicar no avatar e trocar a conta antes de prosseguir.

**Como saber que está certo:** o seletor de projeto mostra "Organização: vdboti.com.br" no topo da janela de seleção.

---

## 3. PASSO 2 — CRIAR (OU REUTILIZAR) PROJETO GOOGLE CLOUD

Você tem duas opções. **Recomendamos a opção A** (projeto novo) porque isolamento facilita auditoria e exclusão futura.

### Opção A — Projeto novo (recomendada)

1. No seletor de projeto, clicar em **NOVO PROJETO** (canto superior direito da janela).
2. Preencher:
   - **Nome do projeto:** `controle-caixa-auth`
   - **Organização:** `vdboti.com.br` (já preenchido se você seguiu o passo 1)
   - **Local:** `vdboti.com.br` (organização) — **não** deixar como "Sem organização"
3. Clicar em **CRIAR**.
4. Aguardar 10-30 segundos. Notificação aparece no sininho do canto superior direito quando pronto.
5. Trocar o seletor de projeto para `controle-caixa-auth` recém-criado.

### Opção B — Reutilizar projeto existente

Se você prefere reutilizar um projeto já existente do Workspace (ex.: o projeto onde já cria recursos da Plexalabs), confirme que:

- O projeto está dentro da organização `vdboti.com.br` (não em "Sem organização").
- Você tem permissão de **Owner** ou **Editor** nele.
- O nome é mnemônico (se for um projeto genérico, considere a Opção A).

Anote o **Project ID** (não o Project Name — é o identificador imutável, geralmente com hífen, tipo `controle-caixa-auth-123456`). Aparece logo abaixo do nome no seletor de projeto.

> **`PROJECT_ID` para devolver ao agente:** este valor.

---

## 4. PASSO 3 — CONFIGURAR OAUTH CONSENT SCREEN

> **Esta é a camada principal de defesa de domínio.** Configurar como **Internal** garante que o Google só permite logins de contas `@vdboti.com.br`.

1. No menu lateral esquerdo (☰ no canto superior esquerdo): **APIs e serviços** → **Tela de consentimento OAuth** (em inglês: *APIs & Services → OAuth consent screen*).
2. Na primeira tela (User Type), aparecem duas opções:
   - **Internal** — apenas usuários do Workspace `vdboti.com.br` podem se autenticar.
   - **External** — qualquer conta Google pode se autenticar (após verificação).
3. **Selecionar `Internal`** e clicar em **CRIAR**.

> **Atenção:** se a opção `Internal` estiver desabilitada/cinza, significa que o projeto Google Cloud está em "Sem organização" (orphan). Voltar ao Passo 2 e criar/mover o projeto para dentro da organização `vdboti.com.br`.

### Tela "Edit app registration" — Informações do app

Preencher:

| Campo | Valor |
|---|---|
| **App name** | `Controle de Caixa` |
| **User support email** | `joaopedro@plexalabs.com` (ou outro email do Workspace que receba avisos) |
| **App logo** (opcional) | pular nesta primeira passada |

Em **App domain**:

| Campo | Valor |
|---|---|
| **Application home page** | `https://caixaboti.plexalabs.com` |
| **Application privacy policy link** | (deixar em branco — pode preencher depois) |
| **Application terms of service link** | (deixar em branco — pode preencher depois) |

Em **Authorized domains** clicar em **+ ADD DOMAIN** e adicionar:

- `plexalabs.com`
- `supabase.co` (necessário porque a URL de callback é `https://<ref>.supabase.co/auth/v1/callback`)

> **Nota:** Google só aceita domínios "raiz" aqui (sem subdomínios e sem `https://`). Subdomínios são automaticamente cobertos.

**Developer contact information:**

- Email: `joaopedro@plexalabs.com`

Clicar em **SAVE AND CONTINUE**.

### Tela "Scopes"

> **Pedir o mínimo possível.** Quanto menos escopo, menor o risco se um token vazar.

1. Clicar em **ADD OR REMOVE SCOPES**.
2. Marcar apenas:
   - `openid`
   - `.../auth/userinfo.email` (e o subitem `email` aparece)
   - `.../auth/userinfo.profile` (e o subitem `profile` aparece)
3. **NÃO MARCAR** nenhum escopo de Drive, Calendar, Gmail, Sheets, ou qualquer Google Workspace API. **Só os 3 acima.**
4. Clicar em **UPDATE**.
5. Confirmar que a tela mostra apenas três escopos não-sensíveis:
   - `email`
   - `profile`
   - `openid`
6. Clicar em **SAVE AND CONTINUE**.

### Tela "Summary"

- Conferir que **User type** = `Internal`.
- Conferir que os scopes listados são exatamente `email`, `profile`, `openid`.
- Clicar em **BACK TO DASHBOARD**.

---

## 5. PASSO 4 — CRIAR OAUTH 2.0 CLIENT ID

1. Menu lateral: **APIs e serviços** → **Credenciais** (*APIs & Services → Credentials*).
2. Clicar em **+ CRIAR CREDENCIAL** (canto superior) → **ID do cliente OAuth** (*OAuth client ID*).
3. **Application type:** `Web application`.
4. **Name:** `Controle de Caixa — Supabase` (esse nome é interno, fica visível na lista de credenciais; serve para você identificar).

### Authorized JavaScript origins

Clicar em **+ ADD URI** três vezes e cadastrar exatamente:

- `https://controle-caixa.pages.dev`
- `https://caixaboti.plexalabs.com`
- `http://localhost:8080`

> **Atenção a três detalhes:**
> 1. Não pode ter `/` no final.
> 2. `localhost` usa `http://`, não `https://`.
> 3. Não cadastrar `https://localhost:8080` — não vai funcionar para dev local.

### Authorized redirect URIs

> **DEIXE ESTA SEÇÃO EXPLICITAMENTE EM BRANCO NESTE MOMENTO.**
>
> A URL exata depende do `project-ref` do Supabase, que o agente vai criar no Checkpoint 2 e te passar.
>
> Você vai voltar nesta tela depois (Passo 5 abaixo) para preencher o redirect URI.

Clicar em **CRIAR** com Authorized redirect URIs vazio.

> O Google **permite** salvar com Authorized redirect URIs vazio. Se ele recusar, adicione um placeholder temporário tipo `https://example.com/callback` e remova depois.

### Janela "OAuth client created"

Aparece um popup com:

- **Your Client ID:** algo como `123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`
- **Your Client Secret:** algo como `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3456`

**NÃO FECHE ESTA JANELA AINDA.** Antes:

1. Clicar em **DOWNLOAD JSON** e salvar o arquivo em local seguro (ex.: vault corporativo). Esse arquivo contém Client ID e Client Secret.
2. Copiar **Your Client ID** para o vault como `GOOGLE_CLIENT_ID`.
3. Copiar **Your Client Secret** para o vault como `GOOGLE_CLIENT_SECRET`.

Pode fechar a janela depois de salvar tudo.

> **Se você fechou a janela antes de copiar:** volte em Credenciais, clique no nome do client criado, na próxima tela aparece "Show client secret" — funciona, mas não baixa o JSON de novo. Recriar é mais limpo.

---

## 6. PASSO 5 — ADICIONAR AUTHORIZED REDIRECT URIS

> **Pré-condição:** o agente já criou o projeto Supabase e te passou a URL do callback no formato `https://<project-ref>.supabase.co/auth/v1/callback`.

1. Voltar em **APIs e serviços → Credenciais**.
2. Clicar no nome do client `Controle de Caixa — Supabase`.
3. Em **Authorized redirect URIs**, clicar em **+ ADD URI**.
4. Colar exatamente a URL que o agente te passou:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   Substituir `<project-ref>` pelo valor real (algo como `xpnvxfcmbgyhpvqebhqq`).
5. Clicar em **SALVAR** (canto inferior).
6. Aguardar a mensagem "OAuth 2.0 Client ID atualizado" — pode demorar até **5 minutos** para a mudança propagar nos servidores do Google.

---

## 7. PASSO 6 — CAPTURAR CREDENCIAIS PARA DEVOLVER AO AGENTE

Volte ao chat com o agente e cole **somente** os valores abaixo:

```
PROJECT_ID (Google Cloud): controle-caixa-auth-XXXXXX
GOOGLE_CLIENT_ID: 123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET: 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3456
```

> **Avisos importantes:**
> - **Nunca compartilhe esses valores em canais não criptografados** (email aberto, Slack público, repositório git).
> - **Após o agente confirmar que cadastrou no Supabase**, mantenha as cópias em vault. O agente NÃO precisa mais delas.
> - Se você precisar **rotacionar** o secret no futuro: Credenciais → clicar no client → **+ ADD SECRET** → desativar o secret antigo após confirmar que tudo funciona com o novo.

---

## 8. CHECKLIST FINAL

Antes de devolver as credenciais ao agente, conferir:

- [ ] Projeto Google Cloud criado dentro da organização `vdboti.com.br` (não em "Sem organização").
- [ ] OAuth consent screen com **User Type = Internal**.
- [ ] App name = `Controle de Caixa`.
- [ ] Authorized domains contém `plexalabs.com` e `supabase.co`.
- [ ] Scopes contém **apenas** `email`, `profile`, `openid`.
- [ ] OAuth 2.0 Client ID tipo **Web application**.
- [ ] Authorized JavaScript origins tem exatamente as 3 URLs:
  - `https://controle-caixa.pages.dev`
  - `https://caixaboti.plexalabs.com`
  - `http://localhost:8080`
- [ ] Authorized redirect URIs contém a URL do Supabase callback (depois do passo 5).
- [ ] `Client ID` e `Client Secret` salvos em vault corporativo.
- [ ] JSON com credenciais baixado e salvo em vault.

---

## 9. O QUE NÃO FAZER

- ❌ **Nunca** marcar User Type = External. Isso permite qualquer conta Google logar e exige verificação adicional do Google (semanas).
- ❌ **Nunca** adicionar escopos sensíveis (Drive, Calendar, Gmail, Sheets) — não precisamos e aumentam o risco.
- ❌ **Nunca** cadastrar `localhost` em Authorized redirect URIs (só em Authorized JavaScript origins).
- ❌ **Nunca** colar `Client Secret` em commit, em screenshot público, ou em chat fora do canal autorizado.
- ❌ **Nunca** desabilitar 2FA na conta admin do Workspace que controla este OAuth Client.
- ❌ **Nunca** deletar o OAuth Client em produção sem ter um substituto pronto e cadastrado no Supabase.

---

## 10. TROUBLESHOOTING

### "User Type = Internal está desabilitado"

**Causa:** projeto Google Cloud não está dentro da organização `vdboti.com.br`.

**Solução:**
- Voltar ao seletor de projeto.
- Confirmar que o projeto aparece com o ícone da organização ao lado, não com ícone "Sem organização".
- Se está em "Sem organização", é melhor criar projeto novo dentro da organização correta (Passo 2 — Opção A) do que tentar mover o projeto.

### "Erro 400: redirect_uri_mismatch" no login de teste

**Causa 1:** redirect URI cadastrado é diferente do que o Supabase está enviando.

**Solução:**
- Conferir que a URL cadastrada é **exatamente** `https://<ref>.supabase.co/auth/v1/callback` — sem barra no final, com `https://`, sem maiúsculas no `<ref>`.
- Esperar até 5 minutos após salvar no Google — a propagação não é instantânea.

**Causa 2:** o client_id usado pelo Supabase não bate com o do Google Cloud.

**Solução:** o agente deve confirmar via MCP que o `client_id` cadastrado no Supabase é o mesmo do Google Cloud.

### "Erro 403: org_internal" no login

**Causa:** usuário tentou logar com conta que não pertence ao Workspace `vdboti.com.br` (ex.: gmail pessoal).

**Solução:** isso é o **comportamento esperado** — a defesa funcionou. Usar conta `@vdboti.com.br`.

### "JavaScript origin not allowed" no console do navegador

**Causa:** a URL atual da Web não está em Authorized JavaScript origins.

**Solução:** voltar em Credenciais e adicionar a URL exata (sem barra final, com protocolo correto).

### "Não consigo achar o secret depois de fechar a janela"

**Solução:** Credenciais → clicar no client → na próxima tela aparece um botão "Show client secret" ou similar. Se mesmo assim sumir, criar novo secret via **+ ADD SECRET** e desativar o antigo.

### "Client ID antigo não funciona após rotacionar"

**Causa:** o secret novo não está cadastrado no Supabase.

**Solução:** atualizar `GOOGLE_CLIENT_SECRET` no Supabase Auth provider antes de desativar o secret antigo. Sempre fazer rotação na ordem: cadastrar novo → testar → desativar antigo.

---

## REFERÊNCIAS OFICIAIS

- [Google Cloud — OAuth consent screen](https://support.google.com/cloud/answer/10311615)
- [Google Identity — Setting up OAuth 2.0](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Supabase Auth — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

---

**Versão deste documento:** 1.0 — 2026-04-29
**Mantido por:** Plexalabs / Operador de Controle de Caixa
**Próxima revisão:** após primeiro UAT
