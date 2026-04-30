# PROGRESSO — Sistema de Controle de Caixa

> **Documento vivo.** Marcar com `[x]` itens concluídos e `[~]` itens em andamento.
> Sempre que terminar uma fase, escrever na seção **Resumo de fase** o que ficou pronto e o que ficou pendente.
> Última atualização: 2026-04-29.
> Stack: Supabase Pro · HTML+JS vanilla+Tailwind CDN · `.xlsm` VBA · Cloudflare Pages · SSO SAML.
> Idioma: pt-BR em UI, mensagens, validações, comentários, commits e nomes de variáveis de domínio.

---

## ÍNDICE

1. Estado atual (resumo de uma linha)
2. Regras invioláveis (lembretes permanentes)
3. Fase 0 — Preparação
4. Fase 1 — Backend Supabase
5. Fase 2 — Frontend Web
6. Fase 3 — Excel/VBA + Apps Script
7. Fase 4 — Integração e operação
8. Critérios de aceite globais (CA-01..CA-15)
9. Plano de testes UAT (UAT-001..UAT-030)
10. Checklist mestre de configuração (Blocos A-F)
11. Resumo por fase (preenchido ao concluir)

---

## Decisões revisadas pelo Operador (2026-04-29 fim do dia) — sobrescreve abaixo

- **Auth**: ~~Google OAuth + restrição `@vdboti.com.br`~~ → **email + senha + OTP de 6 dígitos via Resend SMTP**, cadastro aberto a qualquer email. Confirmação de email obrigatória antes do primeiro login.
- **Email transacional**: Resend (conta existente, domínio `plexalabs.com` verificado). Sender `Caixa Boti <noreply@plexalabs.com>`. Procedimento manual em `docs/SETUP_RESEND_SMTP.md` (MCP Supabase não cobre Auth/SMTP config).
- **Hospedagem web**: alias com hífen — **`caixa-boti.plexalabs.com`** (não `caixaboti`). DNS gerenciado pela GoDaddy via CNAME para `controle-caixa.pages.dev`. Cloudflare Pages atende mesmo com DNS externo (basta CNAME apontar para `*.pages.dev`).
- **Defesa de acesso pós-refactor**: (a) confirmação obrigatória de email via OTP; (b) RLS por papel — admin promove operadores manualmente; primeiro usuário do sistema é "anchor admin" automático.

## Decisões consolidadas pelo Operador (2026-04-29 — base, ainda válidas)

- **Supabase**: plano Pro aprovado. Criar projeto NOVO `controle-caixa-prod`, região `sa-east-1`. NÃO mexer em projetos existentes da conta.
- **Hospedagem web**: Cloudflare Pages → alias `caixa-boti.plexalabs.com` (CNAME). Domínio `.pages.dev` durante dev; alias apontado só quando UAT aprovado.
- ~~**Auth**: Google OAuth (provider nativo Supabase, NÃO SAML). Restringir a hosted domain `vdboti.com.br` via parâmetro `hd` na URL OAuth E validação server-side em trigger Postgres ou edge function.~~ — **substituída** pela decisão revisada acima.
- **Operação via MCP**: agente usa MCP do Supabase (criação de projeto, migrations, edge functions, secrets) e MCP do Cloudflare (Pages, DNS do alias) para executar tudo sem intervenção manual. **Exceção**: Auth/SMTP/Templates não cobertos pelo MCP — operação manual via Dashboard.
- **Vault de credenciais**: SUPABASE_SERVICE_ROLE_KEY, DB_PASSWORD, RESEND_API_KEY e tokens de MCP NUNCA commitados. Operador armazena em vault próprio. Agente recebe via MCP, não via .env do repositório.

---

## 1. ESTADO ATUAL

**Fase 1 (Backend Supabase) concluída em 2026-04-29 — aguardando autorização para Fase 2.**

---

## 2. REGRAS INVIOLÁVEIS (arquivo 05 §41)

Reler antes de qualquer decisão importante:

- [ ] **Não muda** as cores canônicas das categorias (arquivo 01 §6).
- [ ] **Não muda** UUIDs como chave global de toda entidade.
- [ ] **Não muda** a regra "pendência resolvida permanece no caixa de origem" (RN-031).
- [ ] **Não troca** soft-delete por hard-delete (RN-073).
- [ ] **Não substitui** Excel ou Supabase sem aprovação explícita.
- [ ] **Nunca** comita `SUPABASE_SERVICE_ROLE_KEY`, `.env` ou qualquer segredo.
- [ ] **Não adiciona** IA que altera dados sem confirmação humana.
- [ ] **Não adiciona** gamificação na auditoria.
- [ ] **Não compartilha** dados financeiros via link público.

> Estes itens **nunca** ficam marcados como concluídos — são lembretes permanentes.

---

## 3. FASE 0 — PREPARAÇÃO

- [x] Listar arquivos da pasta — confirmar 5 `.md` presentes.
- [x] Ler `01_VISAO_GERAL_E_REGRAS_DE_NEGOCIO.md` por inteiro.
- [x] Ler `02_PLANILHA_EXCEL_ESPECIFICACAO_COMPLETA.md` por inteiro.
- [x] Ler `03_BACKEND_SUPABASE_DATABASE.md` por inteiro.
- [x] Ler `04_FRONTEND_WEB_MICROSITE.md` por inteiro.
- [x] Ler `05_INTEGRACAO_SINCRONIZACAO_OPERACAO.md` por inteiro.
- [x] Ler `dados/respostas 1.txt` (briefing original do usuário).
- [x] Repositório git inicializado (commit `cb6983d`, remote `plexalabs/controle-caixa`).
- [x] `.gitignore` criado cobrindo `.env`, `*.key`, `node_modules`, `outputs/*.xlsm` e similares.
- [x] Estrutura de pastas criada: `/supabase/migrations/`, `/supabase/functions/`, `/web/`, `/excel/`, `/tools/`, `/docs/`.
- [x] Os 5 arquivos `.md` movidos para `/docs/` via `git mv`.
- [x] `PROGRESSO.md` criado na raiz com checklist mestre.
- [ ] **Validação do usuário** — apresentar este PROGRESSO.md e aguardar OK antes da Fase 1.

---

## 4. FASE 1 — BACKEND SUPABASE (arquivo 03)

Branch: `fase-1-backend`. Cada migration é arquivo separado em `supabase/migrations/` no formato `YYYYMMDDHHMMSS_descricao.sql`.

### 4.1. Setup do projeto

- [x] **BACK-01** — Projeto Supabase `controle-caixa-prod` criado via MCP em 2026-04-29 18:17 UTC. Org `flptgnpxtbzradqaijdl` (Plexa Lab's), região `sa-east-1`, plano Pro. **Project ref:** `shjtwrojdgotmxdbpbta`. **Postgres 17.6.1.111** (release channel `ga`). Custo: $10/mês recorrente.
- [x] **BACK-01b** — `.env.example` criado na raiz com placeholders documentados.
- [ ] Habilitar extensões: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pgjwt`, `http`, `pg_net`.
- [ ] Definir timezone `America/Sao_Paulo`.
- [ ] Cadastrar variáveis de ambiente em Project Settings + Edge Functions Secrets.

### 4.2. Schema (DDL)

- [x] Migration 001 schemas_e_extensoes — pg_net, pg_cron, http, pgjwt, schema app, timezone BRT.
- [x] Migration 002 enums — 7 tipos: categoria_lancamento, estado_lancamento, estado_caixa, status_link, severidade_notificacao, tipo_notificacao, acao_audit.
- [x] Migration 003 tabela_caixa — colunas geradas (lpad+extract porque to_char(date) não é IMMUTABLE).
- [x] Migration 004 tabela_lancamento — partial unique nf+caixa where estado<>excluido.
- [x] Migration 005 tabelas_dominio — vendedora, cliente_cache, feriado, config (8 seeds, auth.dominio_permitido editavel=false).
- [x] Migration 006 tabelas_operacionais — usuario_papel, audit_log, notificacao, sync_log.
- [x] Migration 007 funcoes_utilitarias — dias_uteis_entre, fn_nome_aba_excel/web.
- [x] Migration 008 view_pendencia — security_invoker, idade_dias_uteis, severidade.

### 4.3. Triggers

- [x] Migration 010 fn_atualizar_timestamp em lancamento, caixa, vendedora, config.
- [x] Migration 011 fn_recalcular_caixa — total_lancamentos/pendentes/valor; trata mudança de caixa_id.
- [x] Migration 012 fn_calcular_hash_conteudo — SHA-256 (corrigida em 012b com extensions.digest).
- [x] Migration 013 fn_audit_log_imutavel + fn_auditar_mutacao em lancamento/caixa/vendedora/config.
- [x] Migration 014 fn_validar_dados_categoria — JSONB por categoria (Apêndice A).
- [x] Migration 015 fn_notificar_pendencia_criada.
- [x] Migration 016 fn_atualizar_cliente_cache.

### 4.4. RLS

- [x] Migration 020 rls_habilitar_e_helpers — ENABLE RLS em 10 tabelas + fn_tem_papel.
- [x] Migration 021 rls_caixa_lancamento — SELECT para qualquer papel; INSERT/UPDATE só operador|admin; DELETE=false.
- [x] Migration 022 rls_demais_tabelas — vendedora, cliente_cache, feriado, config, audit_log, notificacao, sync_log, usuario_papel.

### 4.5. RPCs

- [x] **BACK-04** — Migration 030 rpc_upsert_lancamento — chamada pelo Excel e Web.
- [x] **BACK-04b** — Migration 031 rpc_upsert_lancamento_lote — versão batch (até 50). Validada com lote de 10 itens (8 inserts + 1 update + 1 erro proposital).
- [x] Migration 032 rpc_resolver_pendencia — preserva caixa de origem (RN-031).
- [x] Migration 033 rpc_cancelar_lancamento — soft-cancel preservando _archived.
- [x] Migration 034 rpc_criar_caixa_se_nao_existe — idempotente.
- [x] Migration 035 rpc_fechar_caixa — bloqueia se pendentes>0 sem p_forcar+justificativa.
- [x] Migration 036 rpc_dashboard_resumo — agregados últimos 30 dias.
- [x] Migration 037 rpc_revelar_pii — whitelist + audit_log REVEAL_PII.

### 4.6. Storage

- [x] Migration 040 storage_bucket_comprovantes — bucket privado 5MB MIME pdf/jpeg/png/webp + policies (upload/select por papel, delete=false, update=false).
- [x] Bucket adicional `backups` privado para edge function backup_semanal.

### 4.7. Edge Functions (Deno)

- [x] `supabase/functions/cria_caixa_diario/index.ts` — deployada, ACTIVE.
- [x] `supabase/functions/disparar_notificacoes/index.ts` — deployada, ACTIVE.
- [x] `supabase/functions/arquivar_ano/index.ts` — deployada, ACTIVE.
- [x] `supabase/functions/backup_semanal/index.ts` — deployada, ACTIVE.
- [ ] `supabase/functions/enviar_email_notificacao/index.ts` — opcional, fora do MVP.
- [ ] `supabase/functions/alertar_anomalia/index.ts` — opcional, fora do MVP.

### 4.8. pg_cron

- [x] Migration 041 app_helpers_cron — app.invocar_edge, limpar_logs_antigos, gerar_notificacoes_atrasadas/caixa_nao_fechado.
- [x] Migration 042 app_configurar_cron — função para admin invocar 1x com service_role do vault.
- [x] Migration 050 pg_cron_jobs — 7 jobs idempotentes:
  - cria_caixa_diario (06h BRT diário) [edge]
  - gerar_notificacoes_atrasadas (4h em horário comercial) [SQL]
  - gerar_notificacoes_caixa_nao_fechado (09h BRT seg-sex) [SQL]
  - disparar_notificacoes_4h (4h em horário comercial) [edge]
  - arquivar_ano (01/01 00:30 BRT) [edge]
  - backup_semanal (dom 04h BRT) [edge]
  - limpar_logs_antigos (dom 03h BRT) [SQL]

### 4.9. Realtime

- [ ] `ALTER PUBLICATION supabase_realtime ADD TABLE lancamento, caixa, notificacao` — adiar para Fase 2 quando a Web subscrever os channels (sem cliente assinando, ativar agora gera tráfego desnecessário).

### 4.10. BACK-AUTH ~~Google OAuth~~ → email + senha + OTP via Resend (revisada)

> ~~Versão antiga (Google OAuth + `@vdboti.com.br`) descartada. Migration 190 dropou trigger `fn_validar_dominio_email` e config `auth.dominio_permitido`.~~

- [x] Migration 190 — DROP trigger fn_validar_dominio_email + DELETE config auth.dominio_permitido.
- [x] Migration 191 — fn_auto_papel_inicial sem dependência de domínio (qualquer email; 1º vira admin+operador).
- [x] Migration 192 — app.invocar_edge robusta (valida JWT antes de pg_net; loga em app.edge_invocation_log). Resolve bug "libcurl bad argument" do hotfix Vault anterior.
- [ ] **Resend SMTP no Supabase Auth** — passos em `docs/SETUP_RESEND_SMTP.md`. Operador executa no Dashboard (MCP não cobre). Sender `Caixa Boti <noreply@plexalabs.com>`, host `smtp.resend.com:465`, user `resend`, pass `RESEND_API_KEY` do vault.
- [ ] **Confirm Email + OTP** — toggle ON em Auth Providers; templates "Confirm signup" e "Reset Password" reescritos em pt-BR usando `{{ .Token }}` (validado nas docs oficiais Supabase).
- [ ] Smoke test refactor (Bloco F) aprovado (`docs/SMOKE_TEST_FASE_1B.md`).

### 4.11. BACK-FINAL — Smoke test integral (arquivo 03 §11.9)

> ✅ Aprovado em 2026-04-29 ~20:38 BRT. Documento completo: `docs/SMOKE_TEST_FASE_1.md`.

- [x] Trigger fn_auto_papel_inicial atribuiu admin+operador ao primeiro usuário (admin.teste@vdboti.com.br).
- [x] Trigger fn_validar_dominio_email rejeita email `@gmail.com` com errcode 42501 + HINT.
- [x] `upsert_lancamento` insere as 6 categorias com sucesso; cada uma retorna UUID.
- [x] `upsert_lancamento_lote` com 10 itens: 8 inserts + 1 update (mesmo UUID — idempotência) + 1 erro proposital.
- [x] Trigger `fn_calcular_hash_conteudo` preencheu SHA-256 (64 chars hex) único por linha.
- [x] `audit_log` capturou inserts com `usuario_email` e `dados_depois`.
- [x] Soft-delete via `estado='excluido'` recalcula caches (6→5 lançamentos, 985.50→935.50).
- [x] RLS bloqueia INSERT/SELECT de usuário sem papel (errcode 42501).
- [x] `audit_log` imutável: UPDATE arbitrário rejeitado pelo trigger; FK SET NULL com exceção controlada (migration 062).
- [x] `criar_caixa_se_nao_existe` idempotente — chamadas repetidas retornam mesmo UUID.
- [x] Cron jobs SQL puros (`gerar_notif_*`, `limpar_logs`) executam sem erro.
- [ ] **Pendente:** invocar `app.configurar_cron(<service_role>, <url>)` uma vez para ativar 4 jobs cron de edge functions.

---

## 5. FASE 2 — FRONTEND WEB (arquivo 04)

Branch: `fase-2-frontend`. HTML + JS vanilla + Tailwind CDN. Sem build, sem bundler. Bundle precache < 300 KB.

### 5.1. Shell e infra

- [ ] `web/index.html` com Tailwind CDN, CSP, manifest, theme-color, ESM modules.
- [ ] `web/manifest.webmanifest` (PWA).
- [ ] `web/sw.js` Service Worker cache-first do shell.
- [ ] `web/styles/tokens.css` com variáveis CSS das cores canônicas (claro + escuro).
- [ ] `web/styles/components.css` com `.cat-*`, `.is-resolvida`, `.is-atrasada`, `.is-conflict`, `.input`, `.btn-*`, `.badge.*`.
- [ ] `web/styles/print.css`.

### 5.2. Camada de aplicação

- [ ] `web/app/main.js` — entry point.
- [ ] `web/app/router.js` — History API + handler.
- [ ] `web/app/supabase.js` — cliente supabase-js v2 + realtime channel global.
- [ ] `web/app/auth.js` — SSO helpers.
- [ ] `web/app/store.js` — store reativo simples (sem Redux).
- [ ] `web/app/i18n.js` + `web/i18n/pt-BR.json` (strings da seção 15 do arquivo 01).
- [ ] `web/app/utils.js` — formatBRL, formatDate, formatHora, maskChave, debounce, dias úteis.
- [ ] `web/app/notifications.js` — toast e listener `nova-notificacao`.
- [ ] `web/app/offline.js` — Dexie/IndexedDB, fila pendentes, eventos online/offline.

### 5.3. Páginas

- [ ] `web/app/pages/login.js` — botão SSO.
- [ ] `web/app/pages/dashboard.js` — stat-cards, donut por categoria (Chart.js), barras série diária, top 5 pendências.
- [ ] `web/app/pages/caixa.js` — tab-bar, tabela de lançamentos, realtime por `caixa_id`, botões novo/fechar.
- [ ] `web/app/pages/pendencias.js` — lista centralizada, filtros, severidade visual.
- [ ] `web/app/pages/config.js` — chaves editáveis, vendedoras, feriados.
- [ ] `web/app/pages/modais.js` — abrirModalNovoLancamento, abrirModalResolverPendencia, abrirModalEditarLancamento, abrirModalCancelar.

### 5.4. Componentes (Web Components)

- [ ] `web/components/tab-bar.js` — barra de abas dos caixas.
- [ ] `web/components/entry-form.js` — formulário dinâmico por categoria.
- [ ] `web/components/entry-row.js`.
- [ ] `web/components/filter-bar.js`.
- [ ] `web/components/notification-bell.js` — sino com badge + painel lateral.
- [ ] `web/components/modal.js`.
- [ ] `web/components/stat-card.js`.
- [ ] `web/components/icon.js` — Heroicons SVG inline.

### 5.5. Acessibilidade e performance

- [ ] Skip link "Pular para conteúdo".
- [ ] Foco visível em todos os interativos.
- [ ] `aria-live="polite"` no toast container.
- [ ] Contraste AA verificado em todas as cores canônicas (modo claro e escuro).
- [ ] Lazy load de páginas via `import()` dinâmico.
- [ ] Tabela virtualizada para listas > 200 linhas.
- [ ] FCP < 1.5s, TTI < 3s no PC lento.

### 5.6. PWA + Realtime

- [ ] Service Worker registra e cacheia o shell.
- [ ] Manifest instalável (ícones, theme color).
- [ ] Realtime subscrito para `lancamento`, `caixa`, `notificacao`.
- [ ] Polling de fallback a 60s quando WebSocket cair.
- [ ] Banner "modo offline" quando `navigator.onLine === false`.

### 5.7. Deploy Cloudflare Pages — ambiente de dev

> O alias `caixa-boti.plexalabs.com` é apontado **apenas** depois do UAT aprovado (item OPS-DEPLOY-WEB na Fase 4). Aqui o site responde em `controle-caixa.pages.dev`.

- [ ] Cloudflare Pages project `controle-caixa` criado **via MCP do Cloudflare**, production branch `main`.
- [ ] Repositório `plexalabs/controle-caixa` conectado.
- [ ] Headers de segurança via `_headers` (CSP, HSTS, X-Frame-Options, Permissions-Policy).
- [ ] Redirects via `_redirects` (`/* /index.html 200`).
- [ ] Variáveis `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__` injetadas em runtime (sem build).
- [ ] Domínio dev `controle-caixa.pages.dev` carrega corretamente.
- [ ] Lighthouse > 85 em Performance, Accessibility, Best Practices, SEO no PC do trabalho.

---

## 6. FASE 3 — EXCEL/VBA + APPS SCRIPT (arquivo 02)

Branch: `fase-3-excel`. Entregar `Controle_Caixa_2026.xlsm` em `outputs/` (ignorado pelo git) e fontes em `excel/`.

### 6.1. Estrutura de abas

- [ ] `DASHBOARD` — visão consolidada com gráficos.
- [ ] `_PENDENCIAS` — lista centralizada (formula dinâmica `LET`+`FILTRO`+`EMPILHARV`).
- [ ] `MODELO` — template canônico, fundo `#374151`, marca d'água, totalmente protegido.
- [ ] `Caixa DD-MM` — uma cópia do MODELO por dia útil.
- [ ] `_CONFIG` (oculta) — chave/valor com seed.
- [ ] `_VENDEDORAS` (oculta) — lista controlada.
- [ ] `_FERIADOS` (oculta) — calendário SP 2026.
- [ ] `_AUDIT` (oculta) — log local com SHA-256.
- [ ] `_CACHE_CLIENTES` (oculta) — espelho de `cliente_cache`.

### 6.2. Módulos VBA

- [ ] `excel/vba/mod_Workbook.bas` — eventos `Open`, `BeforeSave`, `BeforeClose`.
- [ ] `excel/vba/mod_Caixa.bas` — `CriarCaixaDoDia`, `ReordenarAbas`, `EhDiaUtil`, `Auto_GerarCaixaDoDia`.
- [ ] `excel/vba/mod_Validacao.bas` — `AjustarDetalhes`, `ValidarLancamento`, `MarcarCompleto`, `AplicarFormatacaoCondicional`, `AplicarValidacoes`.
- [ ] `excel/vba/mod_Pendencias.bas` — `AtualizarPendencias`, `ResolverPendencia`.
- [ ] `excel/vba/mod_Sync.bas` — `SyncCompleto`, `PushLancamentosModificados`, `PushLote`, `PullLancamentosRemotos`, `ConstruirPayloadLancamento`, `EscapeJson`.
- [ ] `excel/vba/mod_Notificacoes.bas` — `MostrarNotificacoesDoDia`, contadores.
- [ ] `excel/vba/mod_Dashboard.bas` — `AtualizarDashboard`, `ContarTotalLancamentos`, `SomarValores`.
- [ ] `excel/vba/mod_Init.bas` — `InicializarSistema`, `GarantirAba`, `PopularConfigSeed`, GUID, SHA-256.

### 6.3. Cores e formatação condicional (11 regras)

- [ ] Regras 1-6: Cartão / Pix / Dinheiro / Cancelado / Cartão Link / Obs com cores RGB exatas (Apêndice F).
- [ ] Regra 7: pendente cinza com borda tracejada.
- [ ] Regra 8: em_preenchimento (cor mais clara).
- [ ] Regra 9: resolvido — borda esquerda 4px verde `#10B981`.
- [ ] Regra 10: atrasado — borda direita 4px vermelha `#EF4444`.
- [ ] Regra 11: conflito — hachura âmbar `#F59E0B` (Stop if true).

### 6.4. Validações dinâmicas por categoria

- [ ] Cartão: autorização, bandeira, modalidade, parcelas, últimos 4.
- [ ] Pix: ID comprovante, chave, data/hora, remetente opcional, valor recebido opcional.
- [ ] Dinheiro: vendedora (lista), valor recebido, troco calculado.
- [ ] Cancelado: motivo (≥10), autorizador, data, estorno.
- [ ] Cartão Link: URL `https://`, status, datas, autorização condicional.
- [ ] Obs: tipo (lista), descrição (≥20), ação pendente, responsável.

### 6.5. Sincronia HTTP (5 min)

- [ ] Timer `Application.OnTime` cada 300 segundos.
- [ ] Cliente `MSXML2.XMLHTTP.6.0`.
- [ ] Lote máximo 50 linhas por chamada.
- [ ] Backoff exponencial em falhas (2 → 5 → 10 → 15 min).
- [ ] Modo offline graceful.
- [ ] `_AUDIT` gravando cada sync.
- [ ] Botão manual "🔄 Sincronizar agora" no DASHBOARD.

### 6.6. Proteção e segurança

- [ ] MODELO totalmente protegida com senha de `_CONFIG`.
- [ ] `Caixa DD-MM` com header bloqueado, A2:S1000 desbloqueado.
- [ ] Abas `_*` totalmente protegidas; edição apenas via macro.
- [ ] Macro digitalmente assinada (recomendado).

### 6.7. Apps Script paralelo

- [ ] `excel/apps_script/Code.gs` com onOpen, criarCaixaDoDia, formatação condicional, validações, onEdit, syncCompleto, pushLancamentos.
- [ ] Trigger time-based diário às 06:00.

### 6.8. Roteiro de teste manual (Apêndice G)

- [ ] G.1 Setup inicial.
- [ ] G.2 Cartão · G.3 Pix · G.4 Dinheiro · G.5 Cancelar · G.6 Pendência.
- [ ] G.7 Pendência atrasada.
- [ ] G.8 Geração automática.
- [ ] G.9 Sync com Supabase.
- [ ] G.10 Dashboard · G.11 Proteção · G.12 Imprimir.

---

## 7. FASE 4 — INTEGRAÇÃO E OPERAÇÃO (arquivo 05)

Branch: `fase-4-integracao`. Merge final em `main` após todos os critérios atendidos.

### 7.1. Cenários E2E (§34)

- [ ] Cenário 1 — Lançamento Cartão completo.
- [ ] Cenário 2 — Pendência aberta e resolvida (permanece no caixa de origem).
- [ ] Cenário 3 — Conflito Excel × Web (LWW + tela de resolução).
- [ ] Cenário 4 — Geração automática de caixa segunda 06:00.
- [ ] Cenário 5 — Fim de mês (wizard, PDF, read-only).
- [ ] Cenário 6 — Disaster recovery (restore + push do gap).

### 7.2. Runbooks de troubleshooting

- [ ] Excel (§23) — 7 sintomas catalogados.
- [ ] Supabase (§24) — 6 sintomas.
- [ ] Web (§25) — 6 sintomas.
- [ ] Sincronização (§26) — 5 sintomas.

### 7.3. Disaster recovery

- [ ] §27 Perda total da planilha (RTO < 1h).
- [ ] §28 Corrupção de banco (RTO < 4h).
- [ ] §29 Vazamento de credencial (RTO < 30 min).
- [ ] Drill de restore semestral agendado.

### 7.4. Migração de histórico

- [ ] `tools/importar_historico.js` (Node) lendo XLSX e chamando `upsert_lancamento`.
- [ ] Validação pós-import com diff vs. dados da colaboradora atual.

### 7.5. OPS-DEPLOY-WEB — alias de produção

> Executado **somente** após UAT aprovado (Apêndice L, todos os 30 itens ✅).

- [ ] **Deploy Cloudflare Pages via MCP**. Project name `controle-caixa`. Production branch `main`. Domínio dev: `controle-caixa.pages.dev`.
- [ ] Adicionar custom domain `caixa-boti.plexalabs.com` via MCP (cria CNAME automaticamente na zona `plexalabs.com`).
- [ ] HTTPS automático (Cloudflare emite certificado).
- [ ] Validar headers de segurança em produção (`curl -I https://caixa-boti.plexalabs.com`).
- [ ] Validar redirect `/* /index.html 200` em produção.
- [ ] Smoke test E2E pelo alias: login Google → dashboard → caixa → novo lançamento.

### 7.6. Documentação operacional

- [ ] Manual diário (impresso e plastificado).
- [ ] Manual de fim de mês (Apêndice O).
- [ ] Manual de virada de ano.
- [ ] Cartão de atalhos do Excel.
- [ ] Cartão de mensagens de erro comuns.

### 7.7. Onboarding do substituto

- [ ] Cronograma 5 dias úteis preparado (§36).
- [ ] Vídeo de 15 min "um dia comum" gravado.
- [ ] Checklist de prontidão.

---

## 8. CRITÉRIOS DE ACEITE GLOBAIS (arquivo 01 §14)

Para o MVP ser considerado entregue, **todos** devem passar.

- [ ] **CA-01** — Operador consegue, em uma única sessão, criar lançamento de cada uma das 6 categorias com todos os campos obrigatórios e ver a cor correspondente aplicada.
- [ ] **CA-02** — Mudar a categoria de um lançamento existente preserva dados antigos no `audit_log` e atualiza visualmente em < 500ms.
- [ ] **CA-03** — Pendência criada hoje aparece automaticamente na aba "Pendências" e na notificação do próximo ciclo de 4h.
- [ ] **CA-04** — Pendência aberta há 4 dias gera notificação `urgente` automática.
- [ ] **CA-05** — Resolver pendência move-a do estado `pendente` para `resolvido`, mantendo-a no caixa de origem (não no caixa de hoje).
- [ ] **CA-06** — Excel e Web mostram exatamente os mesmos lançamentos após sync (no máximo 5 min de defasagem).
- [ ] **CA-07** — Toda alteração gera linha em `audit_log` com usuário, timestamp, dados antes/depois.
- [ ] **CA-08** — Aba MODELO está protegida por senha e exibe marca d'água visível.
- [ ] **CA-09** — Geração automática de aba acontece todos os dias úteis às 06:00 sem intervenção manual.
- [ ] **CA-10** — Dashboard exibe corretamente: total por categoria, série diária, top vendedoras, % pendências.
- [ ] **CA-11** — Signup com email + senha gera OTP de 6 dígitos via Resend; confirmação popula `email_confirmed_at`; login pré-confirmação é bloqueado.
- [ ] **CA-12** — Comprovante de Pix anexado é recuperável e renderizável em < 2s.
- [ ] **CA-13** — Cancelar lançamento exige todos os campos de cancelamento e move o lançamento para a cor vermelha.
- [ ] **CA-14** — Sistema sobrevive a perda de internet por 30 minutos sem perda de dados (modo offline + retry).
- [ ] **CA-15** — Backup semanal exportado para Excel pode ser aberto e contém todos os caixas do período.

---

## 9. PLANO DE TESTES UAT (arquivo 05 §45 — Apêndice L)

30 cenários a serem validados pelo Operador antes do go-live. Cada item: passos, resultado esperado, status (✅/❌), observações.

- [ ] **UAT-001** Login Web email + senha + OTP — abrir `caixa-boti.plexalabs.com`, clicar "Criar conta", preencher nome/email/senha, receber OTP de 6 dígitos por email (Resend), confirmar conta, login com email/senha retorna JWT. Login antes da confirmação é bloqueado com mensagem clara.
- [ ] **UAT-002** Lançamento Cartão completo — linha pinta azul; reflete no Excel ≤ 5 min.
- [ ] **UAT-003** Lançamento Pix com comprovante — comprovante salvo em Storage, link na linha.
- [ ] **UAT-004** Lançamento Dinheiro — linha pinta verde claro; vendedora válida.
- [ ] **UAT-005** Cancelamento — linha pinta vermelha; aparece em pendências por 24h se ≥ R$500.
- [ ] **UAT-006** Cartão Link — linha pinta roxa, status Enviado.
- [ ] **UAT-007** Obs livre — linha pinta âmbar, descrição ≥ 20 chars.
- [ ] **UAT-008** Ocultação dinâmica — trocar Cartão→Pix mid-edit; campos antigos arquivados em `_archived_*`.
- [ ] **UAT-009** Pendência aberta — aparece em DASHBOARD e _PENDENCIAS.
- [ ] **UAT-010** Pendência atrasada > 3 dias úteis — borda vermelha pulsante.
- [ ] **UAT-011** Pendência resolvida — volta para caixa de origem com faixa verde 4px, metadados corretos.
- [ ] **UAT-012** Caçar cartão aglutinado — 5 cartões em uma linha do mybucks viram 5 lançamentos individuais.
- [ ] **UAT-013** Notificação 08:00 — popup no Excel + notif Web.
- [ ] **UAT-014** Sincronia 5 min Excel→Sup — Web reflete em até 5 min.
- [ ] **UAT-015** Sincronia Sup→Excel — Excel reflete em até 5 min.
- [ ] **UAT-016** Realtime Web — duas Webs abertas; mudança em uma reflete em <2s na outra.
- [ ] **UAT-017** Modo offline Excel — desligar Wi-Fi, digitar, religar; tudo sobe ao reconectar.
- [ ] **UAT-018** Modo offline Web — salvo em IndexedDB, sobe ao reconectar.
- [ ] **UAT-019** Conflito Excel × Web — hachura âmbar + tela de resolução.
- [ ] **UAT-020** Geração caixa segunda 06h — sábado e segunda criados.
- [ ] **UAT-021** Feriado — sistema NÃO cria caixa.
- [ ] **UAT-022** Operador trabalha em feriado — botão "Abrir caixa hoje" cria com badge.
- [ ] **UAT-023** Fim de mês — wizard fecha mês, PDF gerado, lançamentos read-only.
- [ ] **UAT-024** Reabertura de mês — bloqueado sem 2FA do gestor.
- [ ] **UAT-025** Virada de ano — planilha 2026 arquivada, 2027 criada.
- [ ] **UAT-026** Backup semanal — arquivo em Storage no domingo 04:00.
- [ ] **UAT-027** Restore de backup — sandbox: dropar tabela, restaurar; dados voltam intactos.
- [ ] **UAT-028** Reset de anon key — atualizar clientes; tudo volta a funcionar.
- [ ] **UAT-029** Adicionar nova vendedora — aparece no dropdown Excel e Web.
- [ ] **UAT-030** Adicionar feriado — considerado nas regras.

---

## 10. CHECKLIST MESTRE DE CONFIGURAÇÃO (arquivo 05 §15)

### Bloco A — Cloud
- [ ] Projeto Supabase criado e Pro ativo.
- [ ] Schema migrations aplicado.
- [ ] RLS ativo em todas as tabelas.
- [ ] Edge functions deployadas.
- [ ] pg_cron schedules ativos.
- [ ] Storage bucket `comprovantes` criado e privado.
- [ ] Resend SMTP configurado em Supabase Auth (sender `Caixa Boti <noreply@plexalabs.com>`).
- [ ] Templates de email pt-BR aplicados (`{{ .Token }}` em Confirm signup, Reset Password, Magic Link, Change Email).
- [ ] "Confirm email" toggle ON em Auth → Providers → Email.
- [ ] Backup diário automatizado.
- [ ] Service Role Key armazenado em vault.

### Bloco B — Web
- [ ] Repositório Git criado.
- [ ] Cloudflare Pages (ou alternativa) deployado.
- [ ] Domínio apontando.
- [ ] HTTPS funcional.
- [ ] CSP, HSTS e demais headers ativos.
- [ ] Service Worker registrado.
- [ ] PWA instalável.

### Bloco C — Excel
- [ ] Planilha `Controle_Caixa_2026.xlsm` salva em `OneDrive/.../Financeiro/`.
- [ ] VBA carregado, módulos visíveis.
- [ ] `_CONFIG` preenchida (URL, anon key, last_pull_excel).
- [ ] `_VENDEDORAS` preenchida (lista oficial).
- [ ] `_FERIADOS` preenchida (calendário SP 2026).
- [ ] Macro habilitada e digitalmente assinada.
- [ ] Marca d'água "MODELO" aplicada nas abas-modelo.
- [ ] Senha de proteção em `_CONFIG`, `_AUDIT`, `_CACHE_CLIENTES`.
- [ ] Botões do DASHBOARD funcionais.

### Bloco D — Operação
- [ ] Operador treinado.
- [ ] Operador substituto identificado.
- [ ] Manual operacional impresso e arquivado.
- [ ] Canal de suporte definido.
- [ ] Plantão de TI responsável definido.
- [ ] Email de notificações configurado.

### Bloco E — Segurança
- [ ] Senhas únicas em vault.
- [ ] Service Role Key NUNCA no Excel ou na Web.
- [ ] Logs de auditoria habilitados.
- [ ] Backup testado (restore em sandbox).
- [ ] Plano de resposta a incidente impresso.

### Bloco F — Documentação
- [ ] 5 prompts versionados em `/docs/`.
- [ ] README do repositório.
- [ ] Diagrama de arquitetura.
- [ ] Lista de variáveis de ambiente documentada.
- [ ] Lista de pessoas com acesso e seus papéis.

---

## 11. RESUMO POR FASE

### Fase 0 — concluída em 2026-04-29

**Pronto:**
- Os 5 documentos de especificação lidos integralmente e movidos para `/docs/`.
- Repositório git já existente (`plexalabs/controle-caixa`) confirmado limpo na branch `main`.
- `.gitignore` criado cobrindo segredos, `node_modules`, `outputs/*.xlsm`, caches e backups locais.
- Estrutura de pastas criada: `/supabase/migrations/`, `/supabase/functions/`, `/web/`, `/excel/`, `/tools/`, `/docs/` (com `.gitkeep` nas vazias).
- `PROGRESSO.md` (este arquivo) criado com o checklist mestre completo: Fases 0-4, CA-01..CA-15, UAT-001..UAT-030, Blocos A-F e regras invioláveis.

**Pendente:**
- Decisões consolidadas pelo Operador (ver seção "Decisões consolidadas pelo Operador" no topo): projeto Supabase NOVO `controle-caixa-prod`, Cloudflare Pages com alias `caixa-boti.plexalabs.com`, Google OAuth restrito a `@vdboti.com.br`, operação via MCPs. Aplicado neste commit `[F0] ajustes pos-validacao`.

### Fase 1 — concluída em 2026-04-29

**Pronto:**
- Projeto Supabase `controle-caixa-prod` (ref `shjtwrojdgotmxdbpbta`) ACTIVE_HEALTHY na região `sa-east-1`, Postgres 17.6.1.111.
- 23 migrations aplicadas e versionadas (001-016, 020-024, 030-037, 040-042, 050, 060-062, 012b).
- 10 tabelas em `public` com RLS habilitado e policies por papel.
- 7 funções de trigger + 8 RPCs públicas + 4 helpers em schema `app`.
- 7 cron jobs ativos (3 SQL puros + 4 edge function que precisam configurar_cron).
- 4 edge functions deployadas em status ACTIVE.
- 2 buckets de Storage (comprovantes 5MB com MIME restrito, backups privado).
- Smoke test integral 100% aprovado (10 validações documentadas em `docs/SMOKE_TEST_FASE_1.md`).
- Bug encontrado e corrigido: `digest()` em schema `extensions` (migration 012b).

**Pendente (aguarda input do Operador / fora de escopo da Fase 1):**
- Cadastrar Google OAuth no Supabase (espera `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` do Operador).
- Invocar `app.configurar_cron(<service_role_key>, 'https://shjtwrojdgotmxdbpbta.supabase.co')` no SQL Editor para ativar 4 jobs cron de edge functions.
- Edge functions opcionais `enviar_email_notificacao` e `alertar_anomalia` — não bloqueiam Fase 2/3.
- Realtime publication — adiar para Fase 2 quando a Web subscrever os channels.
- Popular `vendedora` e `feriado` antes do UAT.
### Fase 2 — pendente
### Fase 3 — pendente
### Fase 4 — pendente
