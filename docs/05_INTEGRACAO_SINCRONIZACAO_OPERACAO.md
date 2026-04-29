# PROMPT 05 — INTEGRAÇÃO, SINCRONIZAÇÃO, DEPLOY E OPERAÇÃO

> **Pré-requisitos de leitura (em ordem):**
> - `01_VISAO_GERAL_E_REGRAS_DE_NEGOCIO.md` — contexto, regras, dicionário de dados.
> - `02_PLANILHA_EXCEL_ESPECIFICACAO_COMPLETA.md` — implementação Excel/VBA + Apps Script.
> - `03_BACKEND_SUPABASE_DATABASE.md` — schema, RPCs, edge functions, RLS.
> - `04_FRONTEND_WEB_MICROSITE.md` — micro-site web, telas, supabase-js.
>
> Este é o **documento de fechamento**. Ele costura as três pontas (Excel ↔ Supabase ↔ Web) em um sistema único, define como o Operador opera no dia-a-dia, como faz o deploy, como monitora, como recupera de desastre e como evolui.
>
> Este documento é, simultaneamente:
> - **Especificação técnica de integração** — para o agente executor.
> - **Manual operacional** — para o Operador (usuário final).
> - **Runbook de produção** — para qualquer pessoa que herde o sistema.
>
> Cada seção é autocontida; é seguro consultar fora de ordem.

---

## SUMÁRIO

1. Princípios de integração
2. Visão geral da arquitetura de sincronização
3. Modelo de dados de sincronização (campos de controle)
4. Sincronização Excel → Supabase (push)
5. Sincronização Supabase → Excel (pull)
6. Sincronização Supabase → Web (realtime)
7. Sincronização Web → Supabase (mutações)
8. Resolução de conflitos
9. Alternativa Google Sheets + Apps Script
10. Alternativa Power Query (read-only)
11. Deploy do Supabase — passo a passo executável
12. Deploy do micro-site — Cloudflare Pages
13. Deploy do micro-site — alternativa Netlify
14. Deploy do micro-site — alternativa GitHub Pages
15. Configuração inicial completa (checklist mestre)
16. Variáveis de ambiente e segredos
17. Migração de dados legados (importar histórico)
18. Manual operacional do dia-a-dia
19. Manual de início de semana
20. Manual de fim de mês
21. Manual de virada de ano
22. Manual de feriados e exceções de calendário
23. Troubleshooting — Excel
24. Troubleshooting — Supabase
25. Troubleshooting — Web
26. Troubleshooting — Sincronização
27. Disaster recovery — perda total da planilha
28. Disaster recovery — corrupção de banco
29. Disaster recovery — vazamento de credencial
30. Segurança operacional contínua
31. Monitoramento e alertas técnicos
32. Logs, auditoria e retenção
33. Performance — diagnóstico e tuning
34. Testes end-to-end (E2E)
35. Cenários de aceite (UAT)
36. Treinamento e onboarding do Operador substituto
37. Documentação a ser mantida pela empresa
38. Manutenção evolutiva — como adicionar uma nova categoria
39. Manutenção evolutiva — como adicionar um novo campo
40. Manutenção evolutiva — como adicionar um segundo Operador
41. Quando NÃO mudar o sistema
42. Glossário operacional
43. Apêndice J — Tabela de horários (cron consolidado)
44. Apêndice K — Tabela de telefones / canais de suporte (modelo)
45. Apêndice L — Plano de testes UAT (formato planilha)
46. Apêndice M — Modelo de relatório de incidente
47. Apêndice N — Checklist mensal de saúde do sistema
48. Apêndice O — Roteiro de virada de ciclo (fim de mês)

---

## 1. PRINCÍPIOS DE INTEGRAÇÃO

A arquitetura escolhida obedece a quatro princípios que **não devem ser violados** ao longo da implementação:

### 1.1. Supabase é a fonte da verdade

Toda decisão de "qual versão do dado é a oficial" é resolvida olhando para o Postgres no Supabase. Excel e Web são **clientes**, não bancos paralelos. Em qualquer divergência, o Supabase vence.

Implicações:
- Nunca usar a planilha como backup primário. O backup primário é o Postgres + dump diário em Storage.
- Em caso de conflito, o registro do Postgres deve prevalecer e os clientes devem se reconciliar com ele.
- Leitura na planilha que ainda não sincronizou é "dado em trânsito" — não é fonte oficial até subir.

### 1.2. Tudo carrega `id_lancamento` UUID

Não existe lançamento sem UUID. Mesmo lançamentos criados offline na planilha recebem UUID local (gerado por VBA via `CreateObject("Scriptlet.TypeLib").Guid`) que será reconciliado quando subir.

### 1.3. Última escrita ganha (LWW), com auditoria

A política de conflito é **last-writer-wins** baseada em `updated_at`. Mas **toda escrita perdida fica registrada** no `audit_log` com flag `conflito_lww=true`. O Operador pode revisar conflitos do dia na tela de pendências.

### 1.4. Nunca delete; arquive

Lançamentos não são deletados. O campo `excluido_em` (soft-delete) é setado, e o registro fica oculto da UI mas presente no banco. Ações destrutivas reais só ocorrem via SQL administrativo, e jamais em produção sem dump prévio.

---

## 2. VISÃO GERAL DA ARQUITETURA DE SINCRONIZAÇÃO

```
                    ┌─────────────────────┐
                    │   SUPABASE (PG)     │
                    │   fonte da verdade  │
                    └─────────┬───────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
      ┌──────────┐      ┌──────────┐      ┌──────────┐
      │ EXCEL VBA│      │   WEB    │      │  EDGE FN │
      │  push 5m │      │ realtime │      │  pg_cron │
      │  pull 5m │      │ supa-js  │      │  schedule│
      └──────────┘      └──────────┘      └──────────┘
```

### 2.1. Modos de sincronização

| Cliente | Push (envio) | Pull (recepção) | Latência típica |
|---|---|---|---|
| Excel VBA | timer 5 min + botão manual | timer 5 min | 0 a 5 min |
| Web | imediato (await RPC) | realtime + polling 60 s | 0 a 60 s |
| Edge Functions | acionadas por cron | leitura direta SQL | imediato |

### 2.2. Por que Excel é o mais lento

O Excel é cliente "pesado" e roda em PC corporativo lento. Empurrar a cada mutação travaria a UX da planilha. Por isso lote a cada 5 minutos. O Operador pode forçar com botão **🔄 Sincronizar agora** se quiser ver no celular o que acabou de digitar.

### 2.3. Channels de Realtime

A Web assina três canais (descritos em `04`, seção 15):

- `lancamento_changes` — INSERT/UPDATE/DELETE em `lancamento`.
- `pendencia_changes` — alterações em `pendencia`.
- `notificacao_user` — INSERT em `notificacao` filtrado pelo `user_id`.

---

## 3. MODELO DE DADOS DE SINCRONIZAÇÃO (CAMPOS DE CONTROLE)

Toda tabela sincronizável tem seis campos de controle:

| Campo | Tipo | Função |
|---|---|---|
| `id_lancamento` | uuid | Identidade global. Gerado no cliente que criou. |
| `created_at` | timestamptz | Quando nasceu. |
| `created_by` | uuid (auth.uid) | Quem criou. |
| `updated_at` | timestamptz | Última escrita. **Chave do LWW**. |
| `updated_by` | uuid | Quem atualizou. |
| `origem` | text | `excel` \| `web` \| `import` \| `system`. |
| `excluido_em` | timestamptz null | Soft-delete. |
| `versao` | int | Counter incremental opcional. |

### 3.1. Hash de integridade

Adicionalmente, cada lançamento tem `hash_conteudo` (SHA-256 dos campos críticos), gerado a cada `UPDATE`. Permite detectar corrupção em sincronia.

```sql
hash_conteudo = encode(
  digest(
    coalesce(numero_nf,'') || '|' ||
    coalesce(codigo_pedido,'') || '|' ||
    coalesce(valor::text,'') || '|' ||
    coalesce(categoria,'') || '|' ||
    coalesce(detalhes::text,'{}'),
    'sha256'
  ),
  'hex'
)
```

### 3.2. Tabela `sync_log`

Cada cliente reporta sincronia em `sync_log`:

```
id, cliente, tipo (push|pull), inicio, fim, qtd_enviados, qtd_recebidos,
qtd_conflitos, qtd_erros, mensagem, created_at
```

Permite ao Operador ver, na aba `_AUDIT` do Excel ou na tela Configurações, **quando foi a última sincronia bem-sucedida**.

---

## 4. SINCRONIZAÇÃO EXCEL → SUPABASE (PUSH)

### 4.1. Disparadores

A função VBA `mod_Sync.PushLancamentosModificados` é chamada por:

1. **Timer Application.OnTime** a cada 300 segundos.
2. **Botão manual** "🔄 Sincronizar agora" no DASHBOARD.
3. **Workbook_BeforeClose** — push final antes de fechar.
4. **Mudança de aba** opcional (se o Operador habilitar em `_CONFIG`).

### 4.2. Fluxo

```
1. Identificar linhas com sync_pendente=true (coluna oculta R)
2. Para cada linha:
   2.1. Montar JSON do lançamento
   2.2. Calcular hash_conteudo local
   2.3. Chamar RPC upsert_lancamento(payload)
   2.4. Receber id_lancamento e updated_at do servidor
   2.5. Atualizar linha:
        - sync_pendente = false
        - last_sync = now()
        - id_lancamento = retornado
        - updated_at_servidor = retornado
   2.6. Em caso de conflito (versão divergente):
        - Marcar linha com hachura âmbar
        - Gravar em _CONFLITOS
        - NÃO sobrescrever localmente; deixar Operador resolver
3. Gravar em sync_log: enviados, conflitos, erros
4. Atualizar timestamp "Última sincronia" no DASHBOARD
```

### 4.3. RPC `upsert_lancamento`

Definida em `03`, seção 9. Aceita payload JSON e:

- Se `id_lancamento` não existe no servidor → INSERT.
- Se existe e `updated_at_cliente >= updated_at_servidor` → UPDATE.
- Se existe e `updated_at_cliente < updated_at_servidor` → retorna `{conflito:true, versao_servidor:{...}}`.

### 4.4. Transporte

`MSXML2.XMLHTTP60` síncrono (porque VBA não tem Promise). Limite de 50 linhas por chamada para evitar timeout em PC lento. Lote acima disso é fragmentado.

```vba
Public Sub PushLote(linhas() As Long)
    Dim http As Object: Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    Dim url As String: url = SUPABASE_URL & "/rest/v1/rpc/upsert_lancamento_lote"
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "apikey", SUPABASE_ANON_KEY
    http.setRequestHeader "Authorization", "Bearer " & ObterTokenAuth()
    http.setRequestHeader "Prefer", "return=representation"
    http.send MontarPayload(linhas)
    If http.Status >= 200 And http.Status < 300 Then
        ProcessarResposta http.responseText
    Else
        RegistrarErroSync http.Status, http.responseText
    End If
End Sub
```

### 4.5. Modo offline

Se `http.Status = 0` (sem rede), a função:
- Marca `_CONFIG!sync_status = "offline"`.
- Pinta indicador no DASHBOARD em laranja.
- Repõe agendamento para 2 minutos depois.
- NÃO bloqueia o Operador. Lançamentos continuam sendo digitados localmente.

### 4.6. Backoff

Em erro 5xx ou rede cortada:
- 1ª falha → repete em 2 min.
- 2ª falha consecutiva → 5 min.
- 3ª → 10 min.
- 4ª+ → 15 min, e popup discreto: "Sem rede há X minutos."

---

## 5. SINCRONIZAÇÃO SUPABASE → EXCEL (PULL)

### 5.1. Disparadores

1. **Timer** a cada 300 s, intercalado com push (push aos 0/5/10... e pull aos 2/7/12...).
2. **Workbook_Open** — pull completo do dia atual + dia anterior.
3. **Botão manual**.

### 5.2. Estratégia

Não baixar tudo. Estratégia incremental:

```
SELECT * FROM lancamento
WHERE updated_at > :last_pull_excel
  AND data_caixa >= current_date - 30
ORDER BY data_caixa, updated_at
LIMIT 500;
```

`last_pull_excel` fica em `_CONFIG`. Após pull bem-sucedido, é atualizado para `max(updated_at)` recebido.

### 5.3. Reconciliação por linha

Para cada lançamento recebido:

1. Buscar na planilha por `id_lancamento` (coluna oculta P).
2. Se existe na planilha:
   - Se `updated_at_servidor > updated_at_excel` → sobrescrever célula a célula.
   - Senão → ignorar (Excel já mais novo, push em breve).
3. Se não existe na planilha:
   - Localizar aba do dia (`Caixa DD-MM`).
   - Inserir nova linha após a última.
   - Aplicar formatação condicional via `mod_Validacao.AplicarFormato`.
4. Se `excluido_em IS NOT NULL`:
   - Riscar a linha (formatar com strikethrough cinza).
   - Não remover; manter histórico visual.

### 5.4. Atualização de pendências

Após pull dos lançamentos, pull adicional:

```
SELECT * FROM pendencia
WHERE atualizado_em > :last_pull_pend OR resolvido_em IS NULL;
```

Reconciliar aba `_PENDENCIAS`. Pendências resolvidas remotamente devem ser marcadas como resolvidas localmente (faixa verde 4px).

### 5.5. Performance

- Pull em background (não bloqueia digitação).
- `ScreenUpdating=False` durante repintura.
- Worksheet_Change desligado durante pull para não disparar validações.

---

## 6. SINCRONIZAÇÃO SUPABASE → WEB (REALTIME)

### 6.1. Subscrição

Detalhada em `04`, seção 15. Resumo:

```js
const ch = supabase.channel('lancamento_changes')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'lancamento' },
      (payload) => store.applyChange(payload))
  .subscribe();
```

### 6.2. `store.applyChange`

```js
applyChange({ eventType, new: rec, old: prev }) {
  switch(eventType) {
    case 'INSERT':
      this.lancamentos.set(rec.id_lancamento, rec);
      this.notify('Novo lançamento', rec);
      break;
    case 'UPDATE':
      this.lancamentos.set(rec.id_lancamento, rec);
      this.flashRow(rec.id_lancamento);
      break;
    case 'DELETE':
      this.lancamentos.delete(prev.id_lancamento);
      break;
  }
  this.render();
}
```

### 6.3. `flashRow` (animação visual)

Quando um lançamento muda remotamente (ex.: digitado no Excel agora), a Web pisca a linha em amarelo claro por 1 segundo, alertando o Operador da atualização viva.

### 6.4. Polling de fallback

Se o WebSocket cair (rede instável), `setInterval` a cada 60 s faz `SELECT updated_at > :ultimo` e reconcilia. Indicador visual mostra `🟡 Reconectando…`.

### 6.5. Reconexão automática

`supabase-js` reconecta sozinho. Mas a app força `channel.unsubscribe(); channel.subscribe()` se ficar 5 min sem mensagem (heartbeat falha).

---

## 7. SINCRONIZAÇÃO WEB → SUPABASE (MUTAÇÕES)

### 7.1. Imediatismo

Toda submissão de form chama RPC e aguarda resposta antes de fechar modal. Se demorar > 3 s, exibe spinner; > 10 s, oferece "Tentar de novo" / "Salvar offline".

### 7.2. Fila offline

Se a chamada falhar por rede:

1. Salvar payload em `IndexedDB` (banco local do navegador).
2. Mostrar toast "Salvo offline. Será enviado quando reconectar."
3. Marcar lançamento na UI com ícone 📡 (desconectado).
4. ServiceWorker (vide `04`, seção 17) faz retry quando `online` evento dispara.

### 7.3. Optimistic UI

A Web aplica a mudança visualmente ANTES da confirmação do servidor. Se servidor rejeitar (validação RLS, conflito), reverte e mostra erro inline.

---

## 8. RESOLUÇÃO DE CONFLITOS

### 8.1. Cenário típico

Operador abre Excel às 09:00 e digita lançamento NF=12345. Sai para reunião. Esquece sincronia. Volta às 10:30 e edita o mesmo lançamento na Web pelo celular. Web sincroniza imediatamente. Excel só sincroniza às 10:35 quando próximo timer dispara — e detecta conflito.

### 8.2. Política

**Last-writer-wins por `updated_at`**, com janela de tolerância de 2 segundos para evitar disputas falsas por relógios desalinhados.

### 8.3. UI de conflito

#### No Excel
- Linha ganha hachura diagonal âmbar (regra FC-COND-09).
- Aba `_CONFLITOS` (oculta normalmente, exibida em conflito) mostra os dois snapshots lado a lado.
- Botões: "Manter local", "Aceitar servidor", "Mesclar manualmente".

#### Na Web
- Toast vermelho persistente "Outra edição entrou em conflito".
- Modal de comparação `Sua versão | Servidor`.
- Operador escolhe campo a campo o que prevalece.

### 8.4. Regras automáticas

Alguns campos NUNCA conflitam:
- `numero_nf` — chave imutável.
- `codigo_pedido` — chave imutável.
- `created_at`, `created_by` — imutáveis.

Outros sempre prevalecem do servidor:
- `id_lancamento` — sempre servidor.

Outros aceitam merge automático:
- `detalhes` (JSON) — merge profundo: chaves novas de ambos os lados são preservadas; conflitos em chaves iguais aplicam LWW.

### 8.5. Auditoria

Toda resolução manual gera entrada em `audit_log`:
```json
{
  "evento": "conflito_resolvido",
  "id_lancamento": "...",
  "snapshot_local": { ... },
  "snapshot_servidor": { ... },
  "resolucao": "local" | "servidor" | "merge",
  "campos_alterados": ["..."]
}
```

---

## 9. ALTERNATIVA GOOGLE SHEETS + APPS SCRIPT

A arquitetura suporta substituir Excel por Google Sheets. O documento `02`, seção 10, traz o código Apps Script equivalente.

### 9.1. Quando usar

- PC do Operador é tão lento que mesmo Excel sem VBA trava.
- Operador prefere abrir no celular sem precisar acessar a Web.
- Empresa adota Google Workspace.

### 9.2. Diferenças relevantes

| Aspecto | Excel VBA | Google Sheets Apps Script |
|---|---|---|
| Hospedagem | local (.xlsm) | cloud (Drive) |
| Auth | token salvo em `_CONFIG` | OAuth do Google |
| Sync | timer VBA (`Application.OnTime`) | trigger temporal Apps Script |
| Performance | depende do PC | depende do navegador |
| Backup | manual + Storage | automático (Drive versioning) |

### 9.3. Trigger temporal

```js
function setupTriggers() {
  ScriptApp.newTrigger('sincronizar')
    .timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('criarCaixaDoDia')
    .timeBased().atHour(6).everyDays(1).create();
}
```

### 9.4. Limitação importante

Apps Script tem cota de **6 minutos por execução**. Para volumes maiores, fragmentar em jobs menores ou usar Cloud Functions.

---

## 10. ALTERNATIVA POWER QUERY (READ-ONLY)

Para Operadores que NÃO querem sincronia bidirecional (só leitura ao vivo do Supabase no Excel):

### 10.1. Configuração

`Dados > Obter Dados > De Outras Fontes > Da Web`:

```
URL: https://<projeto>.supabase.co/rest/v1/lancamento?select=*&data_caixa=gte.2026-04-01
Headers:
  apikey: <SUPABASE_ANON_KEY>
  Authorization: Bearer <SUPABASE_ANON_KEY>
```

### 10.2. Atualização

Configurar `Atualizar a cada 5 minutos` no painel de propriedades da consulta.

### 10.3. Limitação

Só leitura. Edições nesta planilha não voltam ao Supabase. Útil para análise (tabelas dinâmicas, gráficos), não para operação.

---

## 11. DEPLOY DO SUPABASE — PASSO A PASSO EXECUTÁVEL

Este é o **runbook canônico** de deploy. Cada passo tem critério de verificação. Não pular.

### 11.1. Pré-requisitos

- [ ] Conta Google Workspace administrativa do domínio `vdboti.com.br` (para criar OAuth Client e configurar consent screen Internal).
- [ ] Conta Supabase com plano Pro ativo (organização da Plexalabs).
- [ ] Conta Cloudflare com acesso à zona DNS `plexalabs.com` (para apontar `caixaboti.plexalabs.com` quando UAT aprovar).
- [ ] **MCPs autorizados**: Supabase MCP (criação de projeto, migrations, edge functions, secrets) e Cloudflare MCP (Pages, DNS).
- [ ] Node 18+ instalado (para Supabase CLI quando MCP não cobrir uma operação).
- [ ] `supabase` CLI instalado: `npm install -g supabase` (fallback ao MCP).
- [ ] `git` instalado.

### 11.2. Passo 1 — Criar projeto

```bash
# Login
supabase login

# Criar projeto
supabase projects create caixa-empresa \
  --org-id <ORG_ID> \
  --db-password '<SENHA_FORTE_64_CHARS>' \
  --region sa-east-1
```

**Verificação:** dashboard Supabase mostra projeto ativo, status "Healthy".

### 11.3. Passo 2 — Configurar secrets

```bash
cd projeto-caixa
supabase link --project-ref <REF>
supabase secrets set \
  ANTHROPIC_KEY=... \
  SMTP_HOST=... \
  SMTP_USER=... \
  SMTP_PASS=...
```

**Verificação:** `supabase secrets list` mostra todas as chaves (sem valores).

### 11.4. Passo 3 — Aplicar migrations

```bash
# As migrations estão em supabase/migrations/
# 20260401000001_schema_inicial.sql
# 20260401000002_rls.sql
# 20260401000003_triggers.sql
# 20260401000004_rpcs.sql
# 20260401000005_storage.sql
# 20260401000006_pgcron.sql

supabase db push
```

**Verificação:** Conectar via SQL Editor e rodar:
```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
-- Deve retornar 8 (lancamento, pendencia, vendedora, cliente_cache, audit_log, notificacao, config, sync_log).
```

### 11.5. Passo 4 — Deploy edge functions

```bash
supabase functions deploy criar-caixa-diario
supabase functions deploy gerar-notificacoes
supabase functions deploy dashboard-agg
supabase functions deploy arquivar-ano
supabase functions deploy backup-semanal
supabase functions deploy sso-callback
```

**Verificação:** `supabase functions list` mostra todas as 6.

### 11.6. Passo 5 — Configurar pg_cron

SQL Editor:
```sql
SELECT cron.schedule(
  'criar-caixa-diario',
  '0 6 * * *',
  $$ SELECT net.http_post(
    url := '<URL>/functions/v1/criar-caixa-diario',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  ); $$
);
SELECT cron.schedule(
  'gerar-notificacoes',
  '0 8,12,16 * * 1-6',
  $$ SELECT net.http_post(...); $$
);
-- ... demais jobs
SELECT * FROM cron.job;
```

**Verificação:** `cron.job` lista 5+ jobs ativos.

### 11.7. Passo 6 — Criar bucket Storage

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', false);

CREATE POLICY "user_access" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'comprovantes' AND auth.uid() IS NOT NULL);
```

**Verificação:** Dashboard Storage mostra bucket `comprovantes` privado.

### 11.8. Passo 7 — Configurar Google OAuth

Detalhes completos em `03 §11`. Resumo do passo a passo:

1. **Google Cloud Console** (`console.cloud.google.com`) → projeto `controle-caixa-auth`.
2. **OAuth consent screen** → tipo **Internal** (restringe ao Workspace `vdboti.com.br`).
3. **Credentials → Create credentials → OAuth 2.0 Client ID** → tipo **Web application**.
   - Nome: `Controle de Caixa — Supabase`.
   - Authorized redirect URIs: `https://<projeto>.supabase.co/auth/v1/callback`.
4. Anotar `Client ID` e `Client Secret`.
5. **Supabase Authentication > Providers > Google** → habilitar, colar `Client ID` e `Client Secret`.
6. **Authentication → URL Configuration**:
   - Site URL: `https://controle-caixa.pages.dev` (dev) ou `https://caixaboti.plexalabs.com` (prod).
   - Redirect URLs (Additional): incluir os dois.
7. Aplicar trigger `BEFORE INSERT` em `auth.users` que valida `email LIKE '%@vdboti.com.br'` (ver `03 §11.4`). **Sem o trigger, qualquer conta Google entra editando a URL** — `hd` é apenas dica visual.

**Verificação:**
- Login com conta `@vdboti.com.br` → redireciona ao Google, volta autenticado, sessão válida.
- Login com conta de outro domínio (ex.: pessoal `@gmail.com`) → trigger rejeita com `Acesso restrito ao domínio vdboti.com.br`.

### 11.9. Passo 8 — Smoke test integral

1. Login no painel Supabase como Service Role.
2. Inserir lançamento via SQL:
   ```sql
   SELECT public.upsert_lancamento(
     '{"numero_nf":"99999","codigo_pedido":"PED-TEST","valor":100.00,"categoria":"Cartão","detalhes":{"autorizacao":"123456","bandeira":"Visa","modalidade":"Crédito","parcelas":1,"ultimos4":"1234"}}'::jsonb
   );
   ```
3. Verificar `audit_log` foi populado.
4. Verificar trigger preencheu `hash_conteudo`.
5. Deletar (soft) e verificar `excluido_em`.

**Verificação:** Tudo passa sem erro.

### 11.10. Passo 9 — Configurar clientes

- Excel: `_CONFIG`!B1 = URL, B2 = anon key.
- Web: `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Verificar conexão de cada lado.

### 11.11. Passo 10 — Documentação interna

Salvar em vault da empresa (1Password / LastPass / Vault):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (CRÍTICA — nunca em código cliente)
- `PROJECT_REF`
- `DB_PASSWORD`
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`
- Acesso admin ao Google Cloud Console do Workspace `vdboti.com.br`
- Link para esta documentação

---

## 12. DEPLOY DO MICRO-SITE — CLOUDFLARE PAGES

Recomendação principal pelo plano gratuito generoso e pela latência sul-americana.

### 12.1. Pré-requisitos

- Conta Cloudflare.
- Repositório Git com o código da Web (estrutura conforme `04`, seção 3).
- Domínio `app.empresa.com.br` (ou subdomínio escolhido).

### 12.2. Setup

1. Cloudflare dashboard > Pages > Create a project > Connect to Git.
2. Selecionar repositório.
3. Configurar build:
   - Framework preset: **None**
   - Build command: (vazio — não há build)
   - Build output directory: `/` ou `/web`
   - Environment variables:
     - `VITE_SUPABASE_URL` (apesar do nome, é só leitura no cliente)
     - `VITE_SUPABASE_ANON_KEY`
4. Save and Deploy.

**Verificação:** URL temporária `<projeto>.pages.dev` carrega o login.

### 12.3. Custom domain

Pages > Custom domains > Add. Configurar CNAME:
```
app.empresa.com.br  CNAME  <projeto>.pages.dev
```

Cloudflare emite SSL automaticamente.

### 12.4. Headers de segurança

Criar `_headers` na raiz:
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data: https:; font-src 'self' data:;
```

### 12.5. Redirects

`_redirects` (para SPA roteada client-side):
```
/*  /index.html  200
```

### 12.6. Verificação final

- Lighthouse score > 85 em Performance, Accessibility, Best Practices, SEO.
- TTI < 3 s em 3G simulada.
- HTTPS forçado.
- Headers presentes (verificar com `curl -I`).

---

## 13. DEPLOY DO MICRO-SITE — ALTERNATIVA NETLIFY

### 13.1. Setup

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

`netlify.toml`:
```toml
[build]
  publish = "web"
  command = ""

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

### 13.2. Variáveis

`netlify env:set VITE_SUPABASE_URL ...`
`netlify env:set VITE_SUPABASE_ANON_KEY ...`

### 13.3. Domínio customizado

Netlify > Site settings > Domain management > Add custom domain.

---

## 14. DEPLOY DO MICRO-SITE — ALTERNATIVA GITHUB PAGES

Apenas para versão **demo** ou interna, pois GitHub Pages não suporta variáveis de ambiente em build (que aqui inexiste). Soluções:

- Embedar URL e anon key em arquivo `config.js` que é servido. (Não há segredo de fato; anon key + RLS.)
- Repositório privado da empresa com Pages habilitado.

`.github/workflows/pages.yml`:
```yaml
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./web
      - uses: actions/deploy-pages@v4
```

---

## 15. CONFIGURAÇÃO INICIAL COMPLETA — CHECKLIST MESTRE

Lista canônica para colocar o sistema em produção do zero.

### Bloco A — Cloud
- [ ] Projeto Supabase criado e Pro ativo.
- [ ] Schema migrations aplicado.
- [ ] RLS ativo em todas as tabelas.
- [ ] Edge functions deployadas.
- [ ] pg_cron schedules ativos.
- [ ] Storage bucket `comprovantes` criado e privado.
- [ ] Google OAuth provider habilitado no Supabase Auth.
- [ ] OAuth consent screen do Google em modo **Internal** restrito ao Workspace `vdboti.com.br`.
- [ ] Trigger `BEFORE INSERT` em `auth.users` validando domínio aplicado e testado.
- [ ] Backup diário automatizado.
- [ ] Service Role Key armazenado em vault.

### Bloco B — Web
- [ ] Repositório Git criado.
- [ ] Cloudflare Pages (ou alternativa) deployado.
- [ ] Domínio `app.empresa.com.br` apontando.
- [ ] HTTPS funcional.
- [ ] CSP, HSTS e demais headers ativos.
- [ ] Service Worker registrado.
- [ ] PWA instalável.

### Bloco C — Excel
- [ ] Planilha `Caixa_2026.xlsm` salva em `OneDrive/Empresa/Financeiro/`.
- [ ] VBA carregado, módulos visíveis.
- [ ] `_CONFIG` preenchida (URL, anon key, last_pull_excel).
- [ ] `_VENDEDORAS` preenchida (lista oficial).
- [ ] `_FERIADOS` preenchida (calendário SP de 2026).
- [ ] Macro habilitada e digitalmente assinada.
- [ ] Marca d'água "MODELO" aplicada nas abas-modelo.
- [ ] Senha de proteção em `_CONFIG`, `_AUDIT`, `_CACHE_CLIENTES`.
- [ ] Botões do DASHBOARD funcionais.

### Bloco D — Operação
- [ ] Operador treinado (fluxo descrito na seção 36).
- [ ] Operador substituto identificado e mapeado.
- [ ] Manual operacional impresso e arquivado.
- [ ] Canal de suporte (Slack/Teams/WhatsApp) definido.
- [ ] Plantão de TI responsável definido.
- [ ] Email de notificações configurado.

### Bloco E — Segurança
- [ ] Senhas únicas, em vault, nunca em texto plano.
- [ ] Service Role Key NUNCA no Excel ou na Web.
- [ ] Logs de auditoria habilitados.
- [ ] Backup testado (restore em ambiente sandbox).
- [ ] Plano de resposta a incidente impresso.

### Bloco F — Documentação
- [ ] 5 prompts (este conjunto) versionados.
- [ ] README do repositório.
- [ ] Diagrama de arquitetura atualizado.
- [ ] Lista de variáveis de ambiente documentada.
- [ ] Lista de pessoas com acesso e seus papéis.

---

## 16. VARIÁVEIS DE AMBIENTE E SEGREDOS

### 16.1. Inventário

| Nome | Local | Sensibilidade | Rotação recomendada |
|---|---|---|---|
| `SUPABASE_URL` | público (em código cliente) | baixa | nunca rotacionar (é endereço) |
| `SUPABASE_ANON_KEY` | público | baixa (RLS protege) | a cada 12 meses |
| `SUPABASE_SERVICE_ROLE_KEY` | só backend | **CRÍTICA** | a cada 6 meses |
| `DB_PASSWORD` | só vault | crítica | a cada 6 meses |
| `SMTP_PASS` | secrets do Supabase | alta | a cada 6 meses |
| `IDP_CLIENT_SECRET` | secrets do Supabase | alta | a cada 12 meses |

### 16.2. Onde ficam

| Variável | Excel | Web | Edge Fn | pg_cron |
|---|---|---|---|---|
| URL | `_CONFIG`!B1 | `.env` | `Deno.env` | hardcoded |
| ANON | `_CONFIG`!B2 | `.env` | — | — |
| SERVICE | ❌ | ❌ | `Deno.env` | secret manager |

### 16.3. Política de rotação

Documentar em planilha separada (`_ROTACOES`):
- Data da última rotação.
- Próxima data prevista.
- Responsável.
- Procedimento curto.

---

## 17. MIGRAÇÃO DE DADOS LEGADOS (IMPORTAR HISTÓRICO)

A colaboradora atual mantém controle manual. Antes de "virar a chave", importar o histórico recente.

### 17.1. Coleta

1. Pedir à colaboradora cópia das planilhas dos últimos 6 meses.
2. Identificar formato (geralmente uma planilha por mês, abas diárias).
3. Mapear colunas reais → colunas canônicas.

### 17.2. Script de import

`tools/importar_historico.js` (Node):

```js
import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

const sb = createClient(URL, SERVICE_ROLE_KEY);

const wb = xlsx.readFile('historico.xlsx');
for (const sheetName of wb.SheetNames) {
  if (!/^Caixa /.test(sheetName)) continue;
  const dataCaixa = parseDataDoNomeAba(sheetName);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);
  for (const r of rows) {
    const payload = mapearLinhaParaCanonico(r, dataCaixa);
    await sb.rpc('upsert_lancamento', { payload, origem: 'import' });
  }
}
```

### 17.3. Validação pós-import

```sql
SELECT data_caixa, count(*), sum(valor)
FROM lancamento
WHERE origem = 'import'
GROUP BY data_caixa
ORDER BY data_caixa;
```

Comparar com o que a colaboradora declara para os mesmos dias.

### 17.4. Marcação

Lançamentos importados ficam com `origem='import'` e tag visual cinza-claro até o Operador "homologar". Importações nunca substituem dados digitados manualmente.

---

## 18. MANUAL OPERACIONAL DO DIA-A-DIA

Manual escrito em linguagem direta para o Operador. Pode ser impresso e plastificado.

### 18.1. 08:00 — Abertura

1. Ligar PC. Abrir `Caixa_2026.xlsm`.
2. Habilitar macros se solicitado.
3. Aguardar 10-30 segundos: o sistema abre o caixa do dia, sincroniza, mostra notificações.
4. Olhar o **DASHBOARD**:
   - Pendências do dia anterior?
   - Caixa de ontem foi fechado?
   - Notificações coloridas no topo?
5. Resolver pendências antigas antes de qualquer lançamento novo.

### 18.2. Durante o dia — fluxo principal

**Para cada NF que precisa controle:**

1. Ir à aba `Caixa DD-MM` do dia.
2. Próxima linha vazia.
3. Coluna **número NF** — digitar.
4. Coluna **código pedido** — digitar; cliente e valor preenchem sozinhos (cache).
5. Coluna **categoria** — escolher (dropdown).
6. As colunas **detalhes** mudam de cabeçalho conforme a categoria.
7. Preencher tudo.
8. Quando completo, **a linha pinta da cor da categoria**.
9. Próxima linha.

**Atalhos úteis:**
- `Ctrl+;` — data de hoje.
- `Ctrl+Shift+:` — hora de agora.
- Botão **Novo lançamento** abre modal com os campos certos.

### 18.3. A cada 4 horas — notificações

Sistema avisa:
- 08:00 — "Bom dia. Você tem N pendências."
- 12:00 — "Resumo da manhã: X cartões, Y pix, Z dinheiro."
- 16:00 — "Atenção: pendência aberta há mais de 3 dias úteis."

Tratar cada notificação no próprio momento. Se não puder tratar, marcar como **adiada** com motivo.

### 18.4. 17:00 — Fechamento

1. Botão **Fechar caixa do dia** no DASHBOARD.
2. Sistema valida:
   - Algum lançamento incompleto? Lista e bloqueia.
   - Algum em conflito? Lista e bloqueia.
   - Total bate com o mybucks? (Operador confere visualmente.)
3. Confirmar fechamento.
4. Linha do caixa do dia ganha selo "Fechado em DD/MM HH:MM por <Operador>".

### 18.5. 17:05 — Sincronia final + log

1. Botão **🔄 Sincronizar agora**.
2. Aguardar mensagem "Sincronia OK".
3. Fechar planilha. Backup automático no OneDrive.

### 18.6. À noite — Web

Em casa, se quiser, abrir `app.empresa.com.br` no celular e revisar:
- Pendências.
- Notificações.
- Lançamentos do dia (visão limpa).

---

## 19. MANUAL DE INÍCIO DE SEMANA

### 19.1. Segunda-feira 08:00

1. Sistema gera **dois caixas**: sábado anterior + segunda atual.
   - Se sábado já existir (Operador trabalhou), mantém.
2. Domingo NÃO tem caixa.
3. Verificar se o caixa do sábado foi fechado.
   - Se não foi, fechar agora ou justificar como "fechado em retroatividade".
4. Resolver pendências da semana anterior que vieram para esta.

### 19.2. Pendências semanais

Pendências abertas há mais de 3 dias úteis aparecem destacadas em vermelho. **São prioridade**. O sistema não deixa fechar a sexta-feira seguinte com pendências dessas em aberto sem justificativa.

---

## 20. MANUAL DE FIM DE MÊS

### 20.1. Cenário do "faturamento forçado"

Como o Operador descreveu: o mybucks marca pedidos como entregues mesmo se ainda estão na central. Por isso, o último dia útil do mês exige cuidado especial.

### 20.2. Roteiro

**D-3 (3 dias úteis antes do fechamento):**
- Listar todas as pendências em aberto.
- Cobrar resolução com vendedoras / responsáveis.
- Marcar todas no sistema com **prioridade alta**.

**D-1:**
- Verificar lançamentos sem categoria definida.
- Verificar conflitos pendentes.
- Sincronizar.

**D (último dia):**
- Lançar tudo até 17:00.
- 17:00 — sistema avisa "fechamento de mês em 1 hora".
- 17:30 — botão **Fechar mês** habilita.
- O sistema:
  - Lista todas as pendências do mês.
  - Pede ação para cada uma: "Resolvida", "Migrar para mês seguinte com motivo", "Cancelada".
  - Gera relatório PDF do mês (via edge function `dashboard-agg`).
  - Marca o mês como "Fechado em DD/MM HH:MM por <Operador>".
- Após fechado, lançamentos no mês ficam read-only por padrão. Reabrir exige login com 2FA do gestor.

### 20.3. Apêndice O (este arquivo) traz roteiro detalhado.

---

## 21. MANUAL DE VIRADA DE ANO

### 21.1. 31 de dezembro 17:30

1. Fechar dezembro como mês normal (seção 20).
2. Botão **Arquivar 2026** no DASHBOARD habilita.
3. Sistema:
   - Renomeia planilha `Caixa_2026.xlsm` → `Caixa_2026_FECHADO.xlsm`.
   - Move para subpasta `Arquivo/` no OneDrive.
   - Cria nova planilha `Caixa_2027.xlsm` a partir do template.
   - Copia configurações (`_CONFIG`, `_VENDEDORAS`, `_FERIADOS` atualizado, `_CACHE_CLIENTES`).
   - NÃO copia lançamentos.
   - Edge function `arquivar-ano` faz o equivalente no Supabase: marca todos os lançamentos do ano com `arquivado=true`.

### 21.2. 1º de janeiro 06:00

- Caixa de 02/01 (próximo dia útil) é gerado automaticamente na planilha nova.
- Operador abre 02/01 e o ano está pronto.

### 21.3. Acesso ao histórico

- Planilha 2026 fica acessível em modo leitura.
- Web mostra histórico de qualquer ano via filtro de data.
- Banco mantém todos os anos online; nunca apaga.

---

## 22. MANUAL DE FERIADOS E EXCEÇÕES DE CALENDÁRIO

### 22.1. Tabela `_FERIADOS`

Planilha `_FERIADOS` (e tabela Postgres `feriado`) contém:
```
data | nome | tipo (nacional|estadual|municipal|empresa) | observacao
```

### 22.2. Comportamento padrão

- Em data marcada como feriado, sistema **não cria caixa**.
- Notificações 08-12-16h ficam mudas.
- Botão de fechamento de mês considera apenas dias úteis.

### 22.3. Exceção — Operador trabalha no feriado

- Botão **Abrir caixa hoje (feriado)** no DASHBOARD.
- Cria caixa marcado com badge "🟡 Feriado trabalhado".
- Lançamentos vão para o dia normal, mas relatórios os destacam.

### 22.4. Cadastro de novos feriados

- Excel: `_FERIADOS` aceita inserção. Em até 5 min sincroniza com Supabase.
- Web: tela Configurações > Feriados > Adicionar.
- Rituais anuais (Carnaval, Corpus Christi) — Operador atualiza em janeiro.

---

## 23. TROUBLESHOOTING — EXCEL

### 23.1. "Macro desabilitada"

**Sintoma:** ao abrir, aparece barra amarela "Macros desabilitadas".

**Causa:** política do Office bloqueia `.xlsm` não confiáveis.

**Solução:**
1. Fechar planilha.
2. Botão direito > Propriedades > Marcar "Desbloquear" > OK.
3. Reabrir e habilitar macros.
4. Para solução permanente: assinar VBA digitalmente com certificado da empresa.

### 23.2. "Linha não pinta após preencher"

**Sintoma:** todos os campos preenchidos, linha continua branca.

**Causa:** `Worksheet_Change` não disparou (formatação condicional desligada por algum motivo).

**Solução:**
1. Botão **Reaplicar formatação** no DASHBOARD.
2. Se não resolver: Macros (Alt+F8) > `mod_Validacao.AplicarFormatoAba`.
3. Se persistir: corrupção. Restaurar do backup do dia anterior.

### 23.3. "Sincronia mostra erro 401"

**Sintoma:** botão sincronizar exibe "Erro de autenticação".

**Causa:** anon key expirada ou trocada.

**Solução:**
1. Pegar nova anon key no painel Supabase > Settings > API.
2. Atualizar `_CONFIG`!B2.
3. Salvar e tentar de novo.

### 23.4. "Sincronia mostra erro 500"

**Sintoma:** "Erro do servidor 500".

**Causa:** problema no backend.

**Solução:**
1. Verificar status.supabase.com.
2. Se incidente: aguardar e digitar offline.
3. Se não há incidente: abrir ticket TI com detalhes do `_AUDIT`.

### 23.5. "Excel travou ao abrir"

**Sintoma:** Excel fica "Não respondendo" por mais de 1 minuto.

**Causa:** pull inicial puxou muitos lançamentos em PC lento.

**Solução:**
1. Aguardar até 3 minutos.
2. Se não responder: forçar fechamento.
3. Reabrir com Shift pressionado (desabilita macros e auto-pull).
4. Em modo seguro, ir a `_CONFIG` e mudar `last_pull_excel` para data recente (ex.: hoje - 7 dias).
5. Salvar, fechar, reabrir normalmente.

### 23.6. "Aba 'Caixa DD-MM' não foi criada hoje"

**Sintoma:** abre planilha às 08:30 e não há aba de hoje.

**Causa:** sistema gera às 06:00; se o PC estava desligado, o trigger não rodou.

**Solução:**
1. Botão **Criar caixa de hoje** no DASHBOARD.
2. Ou Macros > `mod_Caixa.CriarCaixaDoDia`.

### 23.7. "Validação não deixa salvar lançamento"

**Sintoma:** ao tentar avançar, mensagem "Campo X obrigatório".

**Causa:** Lançamento incompleto pelas regras da categoria.

**Solução:**
- Ler a mensagem; preencher o campo.
- Se a regra não faz sentido para o caso: usar categoria **Obs** com descrição clara.

---

## 24. TROUBLESHOOTING — SUPABASE

### 24.1. "503 Service Unavailable"

**Causa típica:** instância pausada (plano Free) ou downtime.

**Solução:**
- Confirmar plano Pro ativo (não pausa).
- status.supabase.com.
- Se incidente: comunicar Operador, ativar modo offline.

### 24.2. "RLS denied"

**Sintoma:** Web exibe "Sem permissão para esta operação".

**Causa:** usuário sem papel correto, ou políticas RLS desalinhadas.

**Solução:**
1. SQL: `SELECT * FROM usuario_papel WHERE usuario_id = '<UID>'`.
2. Se não tem papel: inserir manualmente como Service Role:
   ```sql
   INSERT INTO usuario_papel (usuario_id, papel) VALUES ('<UID>', 'operador');
   ```
3. Re-logar na Web.

### 24.3. "Edge function timeout"

**Sintoma:** edge function falha em 60 s.

**Causa:** consulta pesada.

**Solução:**
- Otimizar consulta (índice, materialized view).
- Fragmentar trabalho (múltiplas invocations menores).
- Mover para pg_cron + tabelas auxiliares.

### 24.4. "pg_cron não está rodando"

**Solução:**
1. `SELECT * FROM cron.job;` — confirmar jobs.
2. `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;` — ver execuções.
3. Se nada: re-executar `SELECT cron.schedule(...)`.

### 24.5. "Storage bucket 403"

**Causa:** policy ausente ou usuário sem acesso.

**Solução:**
- Verificar policy descrita em `03`, seção 11.
- Confirmar `auth.uid()` no contexto.

### 24.6. "Custo do plano subiu inesperadamente"

**Causa:** geralmente bandwidth de Storage ou Edge invocations.

**Solução:**
- Dashboard > Usage.
- Identificar componente gastão.
- Otimizar.

---

## 25. TROUBLESHOOTING — WEB

### 25.1. "Tela branca após login"

**Causa:** erro JS na inicialização.

**Solução:**
1. F12 > Console > ler erro.
2. Tipicamente: anon key inválida, CSP bloqueando, supabase-js falhou ao carregar.
3. Hard reload: Ctrl+Shift+R.

### 25.2. "Realtime não chega"

**Causa:** WebSocket bloqueado por firewall corporativo, ou channel não subscrito.

**Solução:**
1. Console: deve aparecer "Subscribed to lancamento_changes".
2. Se não: verificar `wss://*.supabase.co` no CSP.
3. Verificar firewall corporativo (ports 80/443 raramente bloqueiam WS, mas alguns proxies sim).
4. Fallback: polling a 60s já resolve para uso humano.

### 25.3. "PWA não atualiza"

**Causa:** ServiceWorker em cache.

**Solução:**
- F12 > Application > Service Workers > Unregister.
- Hard reload.
- Para evitar no futuro: estratégia de versionamento do SW (cache name versionado).

### 25.4. "Login Google em loop"

**Causas possíveis:**
- Trigger `BEFORE INSERT` rejeitando o email mas a UI da Web não mostra o erro e tenta de novo.
- Redirect URL não cadastrado no Google Cloud Console (Google retorna ao Supabase mas Supabase não consegue redirecionar de volta).
- Site URL/Redirect URLs mal configurados em Authentication > URL Configuration.

**Solução:**
- Conferir `Authentication > URL Configuration` no Supabase: Site URL e Redirect URLs incluem exatamente o host de origem (com/sem `https://`).
- Conferir Authorized redirect URIs no Google Cloud Console: precisa incluir `https://<projeto>.supabase.co/auth/v1/callback`.
- Conferir `Authentication > Logs` no Supabase — buscar por `RAISE EXCEPTION` da função `fn_validar_dominio_email`. Se aparecer, o usuário está usando conta de outro domínio.
- Conferir consent screen do Google está em modo **Internal**.

### 25.5. "Modal de novo lançamento congela"

**Causa:** lista de pedidos enorme em select.

**Solução:**
- Usar autocomplete com debounce 300ms já implementado.
- Limitar resultados a 50.
- Cache local de pedidos recentes.

### 25.6. "Ícones quebrados"

**Causa:** font de ícones (lucide) não carregou.

**Solução:**
- Verificar CSP permite o CDN.
- Hard reload.

---

## 26. TROUBLESHOOTING — SINCRONIZAÇÃO

### 26.1. "Excel mostra valor diferente da Web"

**Causa:** uma das pontas não sincronizou.

**Solução:**
1. Excel: clicar **🔄 Sincronizar agora** e aguardar.
2. Web: F5 (recarregar).
3. Se persistir: verificar `_AUDIT` no Excel e `audit_log` no Supabase para o lançamento; vai mostrar a sequência de eventos.

### 26.2. "Lancamento aparece duplicado"

**Causa:** falha ao reconciliar UUID. Excel criou com UUID local, Web criou com outro UUID antes da sincronia, e ambos foram aceitos por terem chaves diferentes.

**Solução:**
1. Identificar o duplicado.
2. Apagar (soft-delete) o mais antigo via Web.
3. Refletir no Excel via pull.
4. Investigar log de sync para entender a causa raiz e corrigir lógica se for bug.

### 26.3. "Conflito persistente"

**Causa:** duas pessoas (ou dois clientes) editando concorrentemente.

**Solução:**
- Tela de conflito (seção 8).
- Após resolver, garantir que as duas pontas refletem.

### 26.4. "Sync rodou mas log não atualizou"

**Causa:** sync_log não foi gravado por erro de policy.

**Solução:**
- RLS de `sync_log` deve permitir INSERT por authenticated.
- Verificar.

### 26.5. "Status sempre offline mesmo online"

**Causa:** indicador visual quebrado.

**Solução:**
- Verificar `_CONFIG`!sync_status sendo atualizado.
- Reset: clicar **Sincronizar agora**.

---

## 27. DISASTER RECOVERY — PERDA TOTAL DA PLANILHA

### 27.1. Cenário

PC do Operador formata, OneDrive não sincronizou, planilha local destruída.

### 27.2. Resposta (RTO < 1 hora)

1. Em outro PC: instalar Excel, Office 365.
2. OneDrive > Lixeira > Restaurar `Caixa_2026.xlsm` (até 30 dias).
3. Se não está na Lixeira: pasta `Arquivo/` > pegar último backup nomeado.
4. Se não há backup local: gerar planilha vazia do template e fazer pull completo do Supabase para os últimos 60 dias.

### 27.3. Pull completo

Botão **Reset do cache** no DASHBOARD (visível só em modo admin):
1. Limpa todas as abas Caixa.
2. Faz pull desde data X.
3. Recria abas e popula.

### 27.4. Garantia

Como o Supabase é a fonte da verdade, **nenhum dado é perdido** com perda da planilha. Apenas há custo de tempo para recompor o arquivo local.

---

## 28. DISASTER RECOVERY — CORRUPÇÃO DE BANCO

### 28.1. Cenário

Supabase apresenta dados inconsistentes (ex.: lançamentos com `valor=NaN`, ou tabela truncada).

### 28.2. Resposta (RTO < 4 horas)

1. **PARAR** todos os clientes (mensagem global "Em manutenção").
2. Fazer dump do estado atual (mesmo corrompido) para investigação.
3. Restaurar backup mais recente bom:
   ```bash
   supabase db dump --data-only > backup_atual.sql
   # decidir ponto de restore
   psql <CONN> < backup_de_ontem.sql
   ```
4. Reaplicar lançamentos do gap (entre backup bom e momento da corrupção):
   - Lançamentos que tinham `origem='excel'` provavelmente ainda estão na planilha local — push manual.
   - Lançamentos que tinham `origem='web'` podem ter sido perdidos.
5. Comunicar Operador sobre o gap; pedir reconfirmação dos lançamentos do dia.

### 28.3. Backup automatizado

A edge function `backup-semanal` exporta todo domingo 04:00 para Storage:
- `backups/2026-04-26/lancamento.csv`
- `backups/2026-04-26/audit_log.csv`
- ... (todas as tabelas)

Retenção: 12 backups (3 meses).

Adicionalmente, Supabase Pro fornece **PITR** (point-in-time recovery) de até 7 dias.

---

## 29. DISASTER RECOVERY — VAZAMENTO DE CREDENCIAL

### 29.1. Cenário

Anon key vaza em screenshot, repositório público, ou Service Role Key acidentalmente commitada.

### 29.2. Resposta IMEDIATA (RTO < 30 min)

#### Anon key vazada
1. Dashboard Supabase > Settings > API > **Reset anon key**.
2. Atualizar Excel (`_CONFIG`!B2) e Web (`.env` + redeploy).
3. Avisar Operador para reabrir clientes.

#### Service Role Key vazada (CRÍTICO)
1. **PARAR TUDO**.
2. Reset Service Role Key.
3. Auditar `audit_log` por atividade suspeita nos últimos N dias.
4. Re-deploy de edge functions com nova key.
5. Re-deploy de pg_cron jobs.
6. Comunicar gestão.
7. Considerar acionar segurança da informação.

#### Senha do banco vazada
1. Reset senha no painel.
2. Atualizar todas as conexões diretas (raras; só DBA usa).

### 29.3. Prevenção

- `.gitignore` com `.env`, `*.key`, `secrets.*`.
- Pre-commit hook (`gitleaks`).
- Vault corporativo único; nunca compartilhar via email/chat.

---

## 30. SEGURANÇA OPERACIONAL CONTÍNUA

### 30.1. Princípios

1. **Mínimo privilégio**: cada usuário só vê e altera o que precisa.
2. **Defesa em profundidade**: RLS + Auth + HTTPS + CSP + assinatura VBA.
3. **Auditabilidade total**: nenhuma ação importante fica sem log.
4. **Segredos fora do código**: vault, secrets do Supabase.

### 30.2. Política de senhas

- Google OAuth restrito a `@vdboti.com.br` é a porta de entrada; herda política do Workspace (mínimo 12 chars, 2FA, gerência centralizada de offboarding).
- Não há senhas locais no Excel ou Web.
- Senhas de proteção de planilha (abas técnicas) ficam no vault.

### 30.3. Acessos físicos

- PC do Operador deve ter timeout de tela 5 min.
- Bloqueio Win+L sempre que sair.
- Disco criptografado (BitLocker).

### 30.4. Plano de revogação

Quando alguém deixa a função:
1. Remover do IDP corporativo (ou grupo de acesso).
2. Confirmar `usuario_papel` removido no Supabase.
3. Auditar últimos 30 dias da pessoa.
4. Trocar Service Role Key se a pessoa tinha acesso.

### 30.5. Auditoria periódica

- Mensal: revisar `audit_log` por padrões anômalos.
- Trimestral: revisar lista de usuários e papéis.
- Semestral: rotacionar segredos.
- Anual: pen-test contratado externo (opcional).

---

## 31. MONITORAMENTO E ALERTAS TÉCNICOS

### 31.1. Métricas a monitorar

| Métrica | Limite | Ação se ultrapassar |
|---|---|---|
| Latência média de RPC | > 800 ms | Investigar índices, plano de query |
| Erros 5xx por hora | > 5 | Verificar logs, abrir incidente |
| Conexões DB ativas | > 80% do limite | Investigar leaks, rever pool |
| Storage usado | > 80% | Limpar comprovantes antigos arquivados |
| Edge function falhas | > 1% das invocações | Logs + correção |
| Sync_log com erros | > 10 por dia | Investigar |
| Pendências > 3 dias úteis | > 10 simultâneas | Alertar Operador e gestão |

### 31.2. Onde monitorar

- **Supabase Dashboard** > Reports + Logs.
- **Cloudflare Analytics** para tráfego web.
- **Tabela `sync_log`** consultada diariamente pela edge `dashboard-agg`.
- **Email para gestão** se métrica crítica ultrapassada.

### 31.3. Alertas push

Edge function `alertar-anomalia` (cron 30 min):
```sql
-- Erros recentes
SELECT count(*) FROM sync_log
WHERE qtd_erros > 0 AND fim > now() - interval '30 minutes';

-- Pendências críticas
SELECT count(*) FROM pendencia
WHERE resolvido_em IS NULL AND criado_em < now() - interval '3 days';
```

Se acima do limite, envia email + push notification.

---

## 32. LOGS, AUDITORIA E RETENÇÃO

### 32.1. Camadas de log

| Camada | O quê | Onde | Retenção |
|---|---|---|---|
| Excel `_AUDIT` | Ações VBA | Aba oculta | Indefinida (planilha) |
| Web console | Erros JS | Browser | Sessão |
| Supabase logs | Queries lentas, erros API | Dashboard Logs | 7 dias (Pro) |
| `audit_log` | Ações de negócio | Tabela | Indefinida |
| `sync_log` | Sincronizações | Tabela | 90 dias (limpeza por cron) |
| Edge function logs | Stdout/stderr | Dashboard | 7 dias |

### 32.2. Estrutura de `audit_log`

Já definida em `01` seção 7 e `03` seção 5. Cada linha tem:
- `id` (PK)
- `evento` (string normalizada)
- `usuario_id`
- `entidade` (tabela afetada)
- `entidade_id`
- `dados_antes` (jsonb)
- `dados_depois` (jsonb)
- `origem` (excel|web|system)
- `ip` (quando disponível)
- `user_agent` (quando disponível)
- `criado_em`

### 32.3. Eventos rastreados

Lista mínima:
- `lancamento.criado`
- `lancamento.atualizado`
- `lancamento.excluido`
- `pendencia.aberta`
- `pendencia.resolvida`
- `caixa.fechado`
- `caixa.reaberto` (operação manual sensível)
- `mes.fechado`
- `mes.reaberto` (operação muito sensível, exige 2FA)
- `ano.arquivado`
- `usuario.login`
- `usuario.logout`
- `config.alterada`
- `conflito.resolvido`
- `feriado.adicionado`
- `vendedora.adicionada`
- `vendedora.desativada`

### 32.4. Limpeza periódica

```sql
-- pg_cron: domingo 03:00
DELETE FROM sync_log WHERE created_at < now() - interval '90 days';
DELETE FROM notificacao WHERE lida_em IS NOT NULL AND lida_em < now() - interval '60 days';
-- audit_log NUNCA é apagado.
```

### 32.5. Exportação para compliance

Edge function `exportar-auditoria` recebe range de datas e gera CSV em Storage privado. Acesso restrito a gestão.

---

## 33. PERFORMANCE — DIAGNÓSTICO E TUNING

### 33.1. Diagnóstico Excel

Sintoma: planilha lenta.

**Checks:**
1. Tamanho do arquivo. Se > 30 MB: limpar abas antigas (arquivar ano se ainda não foi).
2. Número de regras de formatação condicional. Limite saudável: 50 por aba.
3. Macros rodando em background. `Ctrl+Pause` cancela.
4. PC: RAM e CPU. Se PC < 8 GB RAM, considerar Google Sheets.

**Tuning:**
- Desligar `Application.ScreenUpdating` durante operações em massa.
- Desligar `Application.Calculation = xlCalculationManual` durante sincronia.
- Limitar pull a 30 dias de retorno.

### 33.2. Diagnóstico Supabase

Sintoma: queries lentas.

**Checks:**
- `pg_stat_statements` ativo: identificar top 10 queries.
- `EXPLAIN ANALYZE` na consulta lenta.
- Índices em `data_caixa`, `categoria`, `id_lancamento` confirmados.

**Tuning:**
- Adicionar índice composto se filtragem combinada é frequente.
- Materialized view para dashboard caso `dashboard-agg` fique lento.
- VACUUM ANALYZE periódico (Supabase faz auto, mas conferir).

### 33.3. Diagnóstico Web

Sintoma: TTI > 3 s.

**Checks:**
- DevTools Performance: o que demora?
- Network: payload muito grande?
- Render: lista de 500 lançamentos sem virtualização?

**Tuning:**
- Virtual scroll em listas longas.
- Debounce em search inputs.
- Lazy load de páginas (módulos JS).
- Compressão Brotli no host.

---

## 34. TESTES END-TO-END (E2E)

### 34.1. Filosofia

Testes E2E provam que o sistema funciona da ponta do Operador até a base. Rodam em ambiente **sandbox** clonado do real.

### 34.2. Ferramenta

**Playwright** para Web. **Bash + curl** para APIs. **VBA test runners** para Excel (módulo `mod_Tests`).

### 34.3. Cenário 1 — Lançamento Cartão completo

```
1. Login Web como operador.
2. Abrir caixa de hoje.
3. Clicar "Novo lançamento".
4. Categoria: Cartão.
5. Preencher numero_nf, codigo_pedido (espera autocomplete cliente), valor.
6. Preencher detalhes: autorização, bandeira Visa, modalidade Crédito, parcelas 3, ultimos4 1234.
7. Submeter.
8. Esperar linha aparecer no caixa em até 2 segundos.
9. Linha deve estar pintada azul.
10. Verificar via API REST: GET /lancamento?numero_nf=eq.<NF> retorna o registro.
11. Verificar audit_log: lancamento.criado existe.
```

### 34.4. Cenário 2 — Pendência aberta e resolvida

```
1. Abrir caixa de 5 dias úteis atrás.
2. Marcar lançamento como "Pendência: cartão aglutinado".
3. Verificar aparece em _PENDENCIAS.
4. Verificar contador de pendências no DASHBOARD aumentou.
5. Aguardar (ou avançar relógio do servidor): pendência > 3 dias úteis.
6. Verificar bordas vermelhas pulsantes.
7. Resolver via Web.
8. Verificar lançamento PERMANECE no caixa antigo (RN da seção 5.1).
9. Verificar `resolvido_em` e `resolvido_por` populados.
10. Verificar faixa verde 4px na lateral.
```

### 34.5. Cenário 3 — Conflito Excel × Web

```
1. Excel offline propositalmente (desligar wifi).
2. Excel: editar lançamento existente, valor 100 → 150.
3. Web: editar mesmo lançamento, valor 100 → 200.
4. Web sincroniza imediato (Supabase = 200).
5. Excel volta online; sincroniza.
6. Esperado: conflito detectado, hachura âmbar, _CONFLITOS preenchida.
7. Operador escolhe "Aceitar servidor".
8. Verificar Excel agora mostra 200.
9. Verificar audit_log.evento = 'conflito_resolvido'.
```

### 34.6. Cenário 4 — Geração automática de caixa

```
1. Sandbox: avançar relógio para segunda-feira 06:00.
2. Verificar pg_cron disparou criar-caixa-diario.
3. Verificar Supabase: caixa de sábado anterior + segunda existe.
4. Excel: abrir.
5. Verificar duas abas novas.
6. Verificar Web: tabs novas presentes.
```

### 34.7. Cenário 5 — Fim de mês

```
1. Sandbox com lançamentos do mês todo.
2. Última sexta 17:30: clicar Fechar mês.
3. Sistema lista pendências.
4. Resolver todas ou justificar.
5. Confirmar fechamento.
6. Verificar mês marcado fechado.
7. Tentar editar lançamento do mês fechado.
8. Esperado: bloqueado com mensagem "Mês fechado. Reabertura exige autorização."
```

### 34.8. Cenário 6 — Disaster recovery

```
1. Sandbox: simular corrupção de tabela (DROP CONSTRAINT, INSERT lixo).
2. Executar restore do backup de ontem.
3. Verificar dados consistentes pós-restore.
4. Push de planilha local: lançamentos do gap re-aplicados.
5. Auditoria: tudo rastreado.
```

### 34.9. Frequência

- Cenários 1, 2, 3 → toda release.
- Cenário 4 → mensal.
- Cenário 5 → mensal.
- Cenário 6 → trimestral (desktop em ambiente isolado).

---

## 35. CENÁRIOS DE ACEITE (UAT)

UAT = User Acceptance Test. O Operador valida com casos reais antes do go-live.

### 35.1. Sessão UAT-1 — Lançamento básico (1h)

**Objetivo:** Operador consegue lançar 30 NFs reais (anonimizadas) na planilha.

**Passos:**
1. Operador recebe lista de 30 NFs do dia anterior real.
2. Lança em ambiente sandbox.
3. Cronometrar: alvo < 90 segundos por lançamento médio.
4. Avaliar dor: campos ruins, atalhos faltando, mensagens confusas.
5. Anotar 5 melhorias.

**Critério de aceite:**
- 100% dos lançamentos pintaram a cor certa.
- 0 erros de validação injustos.
- Operador conseguiu sem auxílio.

### 35.2. Sessão UAT-2 — Pendências e ciclos (1h)

**Passos:**
1. Operador trabalha com pendências reais herdadas (5 caixas em aberto desde 20/04).
2. Resolve 3 pendências, deixa 2 em aberto.
3. Avalia comportamento da faixa verde.
4. Avança relógio sandbox para 5 dias depois.
5. Confere mudança para urgente.

**Critério:**
- Pendência resolvida volta para caixa de origem.
- Metadados resolvido_em/por corretos.
- Mudança de urgência visível.

### 35.3. Sessão UAT-3 — Web no celular (30 min)

**Passos:**
1. Login Google OAuth no celular (conta `@vdboti.com.br`).
2. Lançar 5 NFs em movimento.
3. Receber notificação de pendência.
4. Resolver pelo celular.

**Critério:**
- UX confortável em telas 5".
- Modal preenche corretamente.
- Sincronia imediata visível no Excel quando abrir.

### 35.4. Sessão UAT-4 — Falhas e recuperação (1h)

**Passos:**
1. Desligar Wi-Fi por 30 min e digitar.
2. Voltar Wi-Fi: tudo deve subir.
3. Forçar conflito.
4. Resolver pelos dois caminhos (manter local / aceitar servidor).
5. Tentar abrir lançamento de mês fechado.

**Critério:**
- Modo offline verdadeiramente funcional.
- Conflitos detectados e resolúveis.
- Read-only de mês fechado respeitado.

### 35.5. Sessão UAT-5 — Fechamento de mês (1h)

Já descrita na seção 20. Operador realiza um fechamento simulado completo.

### 35.6. Documento de aceite

Após cada sessão, planilha de aceite preenchida (apêndice L). Go-live só ocorre com **todas** as sessões aprovadas.

---

## 36. TREINAMENTO E ONBOARDING DO OPERADOR SUBSTITUTO

### 36.1. Objetivo

Quando o Operador atual sair, o sucessor deve estar produtivo em 5 dias úteis.

### 36.2. Cronograma sugerido

**Dia 1 — Visão geral**
- Manhã: ler `01_VISAO_GERAL_E_REGRAS_DE_NEGOCIO.md`.
- Tarde: assistir Operador atual em ação 4h. Anotar.

**Dia 2 — Excel**
- Manhã: ler `02_PLANILHA_EXCEL_ESPECIFICACAO_COMPLETA.md` (foco nos workflows e formação dinâmica).
- Tarde: praticar 30 lançamentos em sandbox sob supervisão.

**Dia 3 — Web**
- Manhã: ler `04_FRONTEND_WEB_MICROSITE.md`.
- Tarde: praticar Web no celular e desktop. Modal, pendências, conflito simulado.

**Dia 4 — Pendências e exceções**
- Manhã: ler seções 18-22 deste arquivo (manuais).
- Tarde: resolver 5 pendências reais herdadas.

**Dia 5 — Solo supervisionado**
- Operador novo opera o dia inteiro. Antigo observa e intervém só se necessário.

**Dia 10 — Solo absoluto**
- Antigo já não está mais. Suporte por chat se precisar.

### 36.3. Material de apoio

- Vídeo curto (15 min) gravado pelo Operador atual mostrando "um dia comum".
- Cartão plastificado com atalhos do Excel.
- Cartão plastificado com mensagens de erro comuns e o que fazer.
- Acesso à pasta `Documentação/` no OneDrive contendo os 5 prompts impressos.

### 36.4. Avaliação de prontidão

Checklist:
- [ ] Lança qualquer das 6 categorias sem consultar manual.
- [ ] Sabe abrir e fechar mês.
- [ ] Sabe interpretar uma pendência atrasada.
- [ ] Sabe resolver conflito.
- [ ] Sabe explicar o que fazer se Excel travar.
- [ ] Sabe quem chamar em caso de incidente.

---

## 37. DOCUMENTAÇÃO A SER MANTIDA PELA EMPRESA

### 37.1. Repositório de documentação

Estrutura recomendada (Confluence / Notion / Drive):

```
Financeiro/Controle de Caixa/
├── 1_Especificacao/
│   ├── 01_Visao_Geral.md
│   ├── 02_Planilha_Excel.md
│   ├── 03_Backend_Supabase.md
│   ├── 04_Frontend_Web.md
│   └── 05_Integracao_Operacao.md
├── 2_Operacao/
│   ├── Manual_Diario.pdf
│   ├── Manual_Mensal.pdf
│   ├── Atalhos_Excel.pdf
│   └── Troubleshooting_Quick_Reference.pdf
├── 3_Tecnico/
│   ├── Diagrama_Arquitetura.png
│   ├── ERD_Postgres.png
│   ├── Fluxo_Auth_Google.png
│   └── README_Repositorio.md
├── 4_Acessos/
│   ├── Lista_de_Pessoas.xlsx (vault)
│   ├── Politica_de_Senhas.pdf
│   └── Plano_Revogacao.pdf
└── 5_Auditoria/
    ├── Politica_Backup.pdf
    ├── Plano_Disaster_Recovery.pdf
    ├── Calendario_Rotacoes.xlsx
    └── Relatorios_Mensais/
```

### 37.2. Atualizações

- Mudou regra de negócio? Atualizar `01_Visao_Geral.md` PRIMEIRO. Depois implementar.
- Mudou schema? Atualizar `03` e gerar nova migration.
- Mudou tela? Atualizar `04`.

### 37.3. Versionamento

Cada arquivo na cabeça:
```
Versão: 1.3.0
Última revisão: 2026-04-29
Próxima revisão: 2026-10-29 (semestral)
Autor: Operador Financeiro
Aprovado por: Gestão Financeira
```

---

## 38. MANUTENÇÃO EVOLUTIVA — COMO ADICIONAR UMA NOVA CATEGORIA

Cenário hipotético: empresa passa a aceitar pagamento via "Vale Refeição" e quer rastrear.

### 38.1. Lugares a tocar

1. **`01` seção 6** — adicionar a categoria ao glossário, definir cor canônica.
2. **`02` apêndice F** — adicionar RGB/HEX exatos.
3. **`02` seção MODELO** — adicionar o conjunto de campos dinâmicos.
4. **`02` regras de FC-COND-XX** — adicionar regra de pintura.
5. **`02` validações** — adicionar regra de obrigatoriedade.
6. **`03` schema** — atualizar enum `categoria_t`:
   ```sql
   ALTER TYPE public.categoria_t ADD VALUE 'Vale Refeição';
   ```
7. **`03` RPC** — atualizar validação JSON em `upsert_lancamento`.
8. **`04` tela "Novo lançamento"** — adicionar bloco de campos dinâmicos.
9. **`04` filtros** — adicionar checkbox.
10. **`05` testes** — adicionar cenário E2E.

### 38.2. Migrações de dados

Se a categoria é nova, não há migração. Se está renomeando uma existente, escrever migration:
```sql
UPDATE lancamento SET categoria = 'Cartão Refeição' WHERE categoria = 'Vale Refeição Antigo';
```

### 38.3. Comunicação

Operador deve ser avisado com semana de antecedência.

---

## 39. MANUTENÇÃO EVOLUTIVA — COMO ADICIONAR UM NOVO CAMPO

Cenário: passar a registrar "centro de custo" em todo lançamento.

### 39.1. Decisões

- Obrigatório? Para todos ou só para algumas categorias?
- Domínio fixo (lista) ou texto livre?

### 39.2. Implementação

1. Adicionar coluna em `lancamento`:
   ```sql
   ALTER TABLE lancamento ADD COLUMN centro_custo text;
   CREATE INDEX ON lancamento(centro_custo);
   ```
2. Se domínio fixo: criar tabela `centro_custo` + FK.
3. Atualizar RPC `upsert_lancamento`.
4. Adicionar coluna no Excel (próxima coluna livre, T se R foi a última).
5. Atualizar named range `Lancamento_Linha`.
6. Atualizar VBA para preencher.
7. Adicionar input na Web.
8. Atualizar dashboard se relevante.

---

## 40. MANUTENÇÃO EVOLUTIVA — COMO ADICIONAR UM SEGUNDO OPERADOR

Cenário: empresa cresce; um Operador para SP, outro para RJ. Cada um vê seu próprio caixa.

### 40.1. Modelagem

Adicionar campo `unidade_id` em `lancamento`, `caixa`, `pendencia`.

```sql
CREATE TABLE unidade (id uuid PRIMARY KEY, nome text, ...);
ALTER TABLE lancamento ADD COLUMN unidade_id uuid REFERENCES unidade(id);
```

### 40.2. RLS

```sql
DROP POLICY ... ON lancamento;
CREATE POLICY user_unidade ON lancamento
  FOR SELECT USING (
    unidade_id IN (
      SELECT unidade_id FROM usuario_unidade WHERE usuario_id = auth.uid()
    )
  );
```

### 40.3. UI

- Dropdown de unidade no topo da Web.
- Coluna unidade no Excel (oculta normalmente; visível em modo gestão).
- Filtros do dashboard por unidade.

### 40.4. Reusar tudo

A arquitetura já foi pensada multi-tenant. RLS, auth, schema — já estão prontos para receber `unidade_id`. Custo de mudança: baixo.

---

## 41. QUANDO NÃO MUDAR O SISTEMA

Algumas mudanças parecem boas mas pioram. Lista negra:

### 41.1. NÃO mudar:

- **Cores das categorias** sem aprovação. Operador depende delas para velocidade visual.
- **Nome das colunas** sem migration de dados antigos.
- **Política LWW de conflito** sem entender plenamente o impacto.
- **Estrutura de UUIDs** — chave global do sistema.
- **Regra "não move pendência para hoje"** — quebra a auditoria de origem.
- **Soft-delete para hard-delete** — perde rastreabilidade.

### 41.2. NÃO adicionar:

- **Inteligência artificial automática** que altera dados sem o Operador. Pode sugerir, nunca decidir.
- **Gamificação** (medalhas, ranking) — reduz seriedade da auditoria.
- **Compartilhamento público** — dados financeiros nunca em link público.

### 41.3. NÃO substituir:

- **Excel** sem o Operador pedir. É a interface preferida em PC corporativo.
- **Supabase** sem migração testada e plano paralelo.
- **Google OAuth restrito a `@vdboti.com.br`** por logins próprios. Aumenta superfície de ataque e atrito.

---

## 42. GLOSSÁRIO OPERACIONAL

| Termo | Significado |
|---|---|
| **Caixa** | Aba ou tela de um dia útil específico. |
| **Lançamento** | Linha em um caixa, representando uma NF auditada. |
| **Categoria** | Classificação do lançamento (Cartão, Pix, Dinheiro, Cancelado, Cartão Link, Obs). |
| **Pendência** | Lançamento que precisa de ação adicional para fechar. |
| **Resolução** | Ato de marcar pendência como tratada. |
| **Aglutinado** | Lançamento do mybucks que une várias modalidades em uma; precisa "caçar". |
| **Faturamento forçado** | Quando mybucks marca pedidos como entregues no fim de ciclo. |
| **Caçar** | Buscar manualmente o detalhe que faltou para fechar a pendência. |
| **mybucks** | Sistema financeiro proprietário da empresa. |
| **Sincronia** | Troca bidirecional Excel ↔ Supabase ↔ Web. |
| **Conflito** | Duas edições simultâneas que divergem. |
| **LWW** | Last-writer-wins. Política de resolução de conflitos. |
| **Pull / Push** | Receber / Enviar mudanças do servidor. |
| **Realtime** | Atualização viva via WebSocket. |
| **Edge function** | Função serverless do Supabase. |
| **pg_cron** | Agendador nativo Postgres. |
| **RLS** | Row-Level Security. |
| **Google OAuth** | Provider de autenticação do Supabase (OAuth 2.0 / OIDC) usando contas Google Workspace `@vdboti.com.br`. Restrição de domínio aplicada via trigger Postgres (segurança real) + parâmetro `hd` (UI/UX). |
| **2FA** | Autenticação em dois fatores. |
| **Vault** | Armazenamento seguro de credenciais. |
| **Sandbox** | Ambiente de teste isolado. |
| **UAT** | User Acceptance Test. |
| **PWA** | Progressive Web App. |
| **TTI** | Time to Interactive. |

---

## 43. APÊNDICE J — TABELA DE HORÁRIOS (CRON CONSOLIDADO)

| Quando | Onde | Tarefa |
|---|---|---|
| Diário 06:00 | pg_cron | criar-caixa-diario |
| Diário 06:05 | pg_cron | reaplicar-pendencias |
| Diário 03:00 | pg_cron | limpar-sync_log e notificacoes lidas |
| Seg-Sex 08:00 | edge fn | gerar-notificacoes "bom dia" |
| Seg-Sex 12:00 | edge fn | gerar-notificacoes "resumo manhã" |
| Seg-Sex 16:00 | edge fn | gerar-notificacoes "fim de tarde" |
| Sábado 08:00 | edge fn | gerar-notificacoes (fim de semana reduzido) |
| Domingo 04:00 | edge fn | backup-semanal |
| Mensal último dia útil 17:30 | edge fn | preparar-fechamento-mes |
| 31/12 17:30 | edge fn | arquivar-ano (manual) |
| Excel a cada 5 min (08-18) | VBA | sincronia push+pull |
| Web a cada 60 s | JS | polling fallback |
| Web realtime | supabase-js | WebSocket vivo |

---

## 44. APÊNDICE K — TABELA DE TELEFONES / CANAIS DE SUPORTE (MODELO)

A empresa preenche e mantém atualizado.

| Função | Nome | Email | Telefone | Disponibilidade |
|---|---|---|---|---|
| Operador Financeiro Principal | (preencher) | | | Seg-Sáb 08-18 |
| Operador Substituto | (preencher) | | | sob demanda |
| TI — Suporte L1 | (preencher) | | | Seg-Sex 08-18 |
| TI — Plantão fora do horário | (preencher) | | | 24x7 |
| Gestão Financeira | (preencher) | | | Seg-Sex |
| Responsável Supabase | (preencher) | | | Seg-Sex |
| Admin Google Workspace `vdboti.com.br` | (preencher) | | | Seg-Sex |
| Suporte Cloudflare | empresa@cloudflare | — | — | conta enterprise |
| Suporte Supabase | suporte | — | — | Pro tier inclui email |

---

## 45. APÊNDICE L — PLANO DE TESTES UAT (FORMATO PLANILHA)

Modelo de planilha que o Operador preenche durante UAT.

| ID | Cenário | Passos | Resultado esperado | Resultado obtido | Status (✅/❌) | Observações |
|---|---|---|---|---|---|---|
| UAT-001 | Login Web Google OAuth | abrir caixaboti.plexalabs.com, clicar "Entrar com Google", autenticar com conta `@vdboti.com.br` | redireciona ao Google, autentica, volta logado; conta de outro domínio é bloqueada com `Acesso restrito ao domínio vdboti.com.br` | | | |
| UAT-002 | Lançamento Cartão completo | Web > Novo lançamento > preencher tudo | linha pinta azul, linha aparece no Excel em até 5 min | | | |
| UAT-003 | Lançamento Pix com comprovante | preencher e anexar PDF | comprovante salvo em Storage, link na linha | | | |
| UAT-004 | Lançamento Dinheiro | preencher com vendedora da lista | linha pinta verde claro | | | |
| UAT-005 | Cancelamento | preencher motivo, autorizador, data | linha pinta vermelha, vai para aba _PENDENCIAS por 24h se >=R$500 | | | |
| UAT-006 | Cartão Link | preencher URL, status Enviado | linha pinta roxa | | | |
| UAT-007 | Obs livre | preencher tipo Outro com 50 chars | linha pinta âmbar | | | |
| UAT-008 | Ocultação dinâmica | trocar categoria de Cartão para Pix mid-edit | campos antigos somem, novos aparecem, valores não confirmados são limpos com aviso | | | |
| UAT-009 | Pendência aberta | abrir | aparece em DASHBOARD e _PENDENCIAS | | | |
| UAT-010 | Pendência atrasada >3d | avançar relógio sandbox | borda vermelha pulsante | | | |
| UAT-011 | Pendência resolvida | resolver | volta para caixa de origem com faixa verde 4px, metadados corretos | | | |
| UAT-012 | Caçar cartão aglutinado | mybucks tem 5 cartões em uma linha | criar 5 lançamentos individuais, vincular ao "pai" | | | |
| UAT-013 | Notificação 08:00 | esperar disparo | popup no Excel + notif Web | | | |
| UAT-014 | Sincronia 5 min Excel→Sup | digitar e esperar | Web reflete em até 5 min | | | |
| UAT-015 | Sincronia Sup→Excel | mudar pela Web | Excel reflete em até 5 min | | | |
| UAT-016 | Realtime Web | duas Webs abertas | uma muda, outra reflete <2s | | | |
| UAT-017 | Modo offline Excel | desligar Wi-Fi, digitar, religar | tudo sobe ao reconectar | | | |
| UAT-018 | Modo offline Web | desligar Wi-Fi, lançar | salvo em IndexedDB, sobe ao reconectar | | | |
| UAT-019 | Conflito Excel × Web | descrito seção 34.5 | hachura âmbar + tela de resolução | | | |
| UAT-020 | Geração caixa segunda 06h | sandbox com relógio | sábado e segunda criados | | | |
| UAT-021 | Feriado | configurar feriado, esperar 06h | NÃO cria caixa | | | |
| UAT-022 | Operador trabalha em feriado | botão Abrir caixa hoje | cria com badge | | | |
| UAT-023 | Fim de mês | descrito seção 20 | mês fechado, lançamentos read-only | | | |
| UAT-024 | Reabertura de mês | tentar editar | bloqueado, mensagem clara | | | |
| UAT-025 | Virada de ano | descrito seção 21 | planilha 2026 arquivada, 2027 criada |  | | |
| UAT-026 | Backup semanal | esperar domingo 04h | arquivo em Storage | | | |
| UAT-027 | Restore de backup | sandbox: dropar tabela, restaurar | dados voltam intactos | | | |
| UAT-028 | Reset de anon key | resetar, atualizar clientes | tudo volta a funcionar | | | |
| UAT-029 | Adicionar nova vendedora | inserir em _VENDEDORAS | aparece no dropdown Excel e Web | | | |
| UAT-030 | Adicionar feriado | inserir em _FERIADOS | considerado nas regras | | | |

---

## 46. APÊNDICE M — MODELO DE RELATÓRIO DE INCIDENTE

Quando algo dá errado, preencher e arquivar em `5_Auditoria/Incidentes/AAAA-MM/`.

```
RELATÓRIO DE INCIDENTE — Sistema de Controle de Caixa

ID:                      INC-2026-001
Data e hora detectado:   2026-04-29 14:32
Detector:                Operador Financeiro
Severidade:              Alta / Média / Baixa

DESCRIÇÃO:
[2-3 parágrafos descrevendo o que aconteceu, do ponto de vista do detector.]

TIMELINE:
14:32 — Operador percebe que botão Sincronizar retorna erro 500.
14:35 — Operador chama TI L1.
14:40 — TI verifica status.supabase.com — incidente externo.
14:55 — Comunicado da Supabase: indisponibilidade resolvida.
15:00 — Operador retoma sincronia, validado tudo.

IMPACTO:
- Tempo de indisponibilidade: 23 minutos.
- Lançamentos perdidos: 0 (digitação continuou local).
- Sincronizações atrasadas: 4.

CAUSA RAIZ:
Indisponibilidade externa do provedor.

CORREÇÕES IMEDIATAS:
- Confirmação manual da consistência.
- Sincronia forçada após o incidente.

AÇÕES PREVENTIVAS:
- Adicionar monitor automático que alerta o Operador antes dele perceber.
- Página de status interna mostrando última sincronia bem-sucedida em destaque.

LIÇÕES APRENDIDAS:
- Modo offline do Excel funcionou bem.
- Operador respondeu rápido.
- Falta documentação clara para "o que fazer enquanto Supabase está fora".

RESPONSÁVEL PELO RELATÓRIO:    [nome]
DATA DO RELATÓRIO:              2026-04-29 16:00
APROVADO POR:                   [gestão]
```

---

## 47. APÊNDICE N — CHECKLIST MENSAL DE SAÚDE DO SISTEMA

Executar todo dia 1º útil do mês (após fechamento do mês anterior).

### Bloco técnico
- [ ] Supabase: dashboard sem alertas vermelhos.
- [ ] Supabase: uso de DB < 80%.
- [ ] Supabase: uso de Storage < 80%.
- [ ] pg_cron: 100% das execuções do mês passado bem-sucedidas.
- [ ] Edge functions: taxa de erro < 1%.
- [ ] Backup mais recente: data correta, tamanho razoável (não vazio).
- [ ] Restore drill (a cada 3 meses): testado em sandbox.

### Bloco de dados
- [ ] Audit_log: 0 eventos suspeitos não justificados.
- [ ] Sync_log: < 10 erros no mês.
- [ ] Pendências em aberto > 30 dias: 0.
- [ ] Conflitos não resolvidos: 0.

### Bloco operacional
- [ ] Operador deu OK no fechamento de mês.
- [ ] Relatório PDF do mês gerado e arquivado.
- [ ] Vendedoras desligadas no mês: desativadas em `vendedora`.
- [ ] Feriados do mês seguinte: cadastrados.

### Bloco segurança
- [ ] Lista de usuários e papéis revisada.
- [ ] Senhas próximas a vencer: rotacionadas se < 30 dias.
- [ ] Logs de tentativas de login: 0 padrões suspeitos.

### Bloco documentação
- [ ] Documentação refletindo qualquer mudança feita no mês.
- [ ] README atualizado.
- [ ] Próxima revisão semestral: agendada.

Assinado: __________________  Data: __________

---

## 48. APÊNDICE O — ROTEIRO DE VIRADA DE CICLO (FIM DE MÊS)

Procedimento detalhado para o fim de mês "perigoso" descrito pelo Operador.

### D-5 (5 dias úteis antes)

- [ ] Email/mensagem para vendedoras: "lembrem-se de devolver canhotos com nome anotado".
- [ ] Email para responsável do mybucks: "envio do extrato consolidado até D-1 17h".
- [ ] Listar pendências em aberto > 5 dias e atribuir prazo de resolução.
- [ ] Verificar saldo do dashboard: bate com mybucks?

### D-3

- [ ] Reduzir volume de pendências para <= 10.
- [ ] Atender com prioridade qualquer cartão aglutinado pendente.
- [ ] Alinhar com gestão sobre lançamentos cancelados de alto valor.

### D-1

- [ ] Ouvir o cron de notificações 16:00 — atender tudo.
- [ ] Sincronizar Excel.
- [ ] Sincronizar Web.
- [ ] Validar dashboard: total do mês até agora.
- [ ] Backup ad-hoc: clicar **Backup agora** no DASHBOARD.

### D (último dia útil) — manhã

- [ ] Lançar tudo conforme rotina.
- [ ] Investigar qualquer "faturamento forçado" assim que aparecer no mybucks.
- [ ] Manter todas as pendências do dia visíveis.

### D — 16:00

- [ ] Notificação especial "fechamento de mês em 1h30".
- [ ] Operador reserva 90 minutos no calendário (sem reuniões).

### D — 17:30

- [ ] Botão **Fechar mês** habilita.
- [ ] Sistema executa wizard de fechamento:
  1. Lista pendências em aberto. Para cada:
     - "Resolver agora" → modal de resolução.
     - "Migrar para mês seguinte" → exige motivo (mín. 30 chars).
     - "Cancelar pendência" → exige aprovação 2FA do gestor.
  2. Lista lançamentos sem categoria. Bloqueia se houver.
  3. Lista conflitos não resolvidos. Bloqueia se houver.
  4. Mostra total do mês: cartão / pix / dinheiro / cancelado / link / obs.
  5. Operador confirma número.
- [ ] Sistema gera PDF do relatório do mês.
- [ ] Sistema marca o mês como fechado.
- [ ] `audit_log.evento = 'mes.fechado'` registrado.

### D — 18:00

- [ ] Email automático para gestão com PDF anexo.
- [ ] Operador encerra o dia.

### D+1 (primeiro dia do mês seguinte)

- [ ] Caixa do dia abre normalmente.
- [ ] Pendências migradas aparecem no DASHBOARD com tag "vinda do mês X".
- [ ] Mês fechado fica visível como histórico, read-only.

### Reabertura excepcional

Se gestão pedir reabertura (ex.: lançamento descoberto a destempo):
1. Acessar Configurações > Reabrir mês.
2. Login 2FA do gestor.
3. Justificativa textual obrigatória (mín. 100 chars).
4. Mês reabre por 24h ou até novo fechamento manual.
5. Auditoria registra.
6. Após segundo fechamento, comparativo entre as duas versões fica disponível.

---

## CONSIDERAÇÕES FINAIS

Este conjunto de cinco prompts é um sistema completo. Funciona em três condições:

1. **Coerência total entre os arquivos.** Mudou regra em `01`? Atualizar nos outros quatro.
2. **Disciplina operacional do Operador.** Sincronizar, fechar, resolver. O sistema não substitui hábito.
3. **Vigilância da empresa.** Backups, monitoramento, rotação de segredos.

O sistema foi desenhado para uma única pessoa operar 100-150 NFs por dia em um PC modesto, com auditoria suficiente para sobreviver a auditorias externas e troca de Operador. Pode escalar para múltiplos Operadores, múltiplas unidades e múltiplos anos sem rearquitetar.

A arquitetura — Excel para conforto local + Supabase para verdade central + Web para mobilidade — distribui carga e oferece três caminhos para a mesma operação. Se um falhar, os outros dois sustentam.

Boa execução.

---

## FIM DO DOCUMENTO 05

> Esta é a última peça do conjunto.
> Em ordem de leitura para o agente executor: 01 → 02 → 03 → 04 → 05.
> Em ordem de execução: 03 (backend primeiro) → 04 (frontend) → 02 (Excel) → 05 (deploy/operação).
