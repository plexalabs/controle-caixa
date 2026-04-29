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

## Decisões consolidadas pelo Operador (2026-04-29)

- **Supabase**: plano Pro aprovado. Criar projeto NOVO `controle-caixa-prod`, região `sa-east-1`. NÃO mexer em projetos existentes da conta.
- **Hospedagem web**: Cloudflare Pages → alias `caixaboti.plexalabs.com` (CNAME). Domínio `.pages.dev` durante dev; alias apontado só quando UAT aprovado.
- **Auth**: Google OAuth (provider nativo Supabase, NÃO SAML). Restringir a hosted domain `vdboti.com.br` via parâmetro `hd` na URL OAuth E validação server-side em trigger Postgres ou edge function.
- **Operação via MCP**: agente usa MCP do Supabase (criação de projeto, migrations, edge functions, secrets) e MCP do Cloudflare (Pages, DNS do alias) para executar tudo sem intervenção manual.
- **Vault de credenciais**: SUPABASE_SERVICE_ROLE_KEY, DB_PASSWORD e tokens de MCP NUNCA commitados. Operador armazena em vault próprio. Agente recebe via MCP, não via .env do repositório.

---

## 1. ESTADO ATUAL

**Fase 0 finalizada — aguardando validação do usuário antes de iniciar Fase 1.**

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

- [ ] Criar projeto Supabase `controle-caixa-prod` em `sa-east-1` (plano Pro). _Pergunta ao usuário: já existe? credenciais?_
- [ ] Habilitar extensões: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pgjwt`, `http`, `pg_net`.
- [ ] Definir timezone `America/Sao_Paulo`.
- [ ] Cadastrar variáveis de ambiente em Project Settings + Edge Functions Secrets.

### 4.2. Schema (DDL)

- [ ] Migration `001_schemas_e_extensoes.sql` — schemas `app`, extensões.
- [ ] Migration `002_enums.sql` — `categoria_lancamento`, `estado_lancamento`, `estado_caixa`, `status_link`, `severidade_notificacao`, `tipo_notificacao`, `acao_audit`.
- [ ] Migration `003_tabelas_dominio.sql` — `caixa`, `lancamento`, `vendedora`, `cliente_cache`, `feriado`, `config`.
- [ ] Migration `004_tabelas_operacionais.sql` — `audit_log` (imutável), `notificacao`, `usuario_papel`, `sync_log`.
- [ ] Migration `005_views.sql` — view `pendencia` derivada de `lancamento`.
- [ ] Migration `006_indices.sql` — índices de performance.
- [ ] Migration `007_funcoes_utilitarias.sql` — `dias_uteis_entre`, `audit_log_imutavel`.

### 4.3. Triggers

- [ ] Migration `010_trg_atualizar_timestamp.sql` — `fn_atualizar_timestamp` em `lancamento`.
- [ ] Migration `011_trg_recalcular_caixa.sql` — caches em `caixa`.
- [ ] Migration `012_trg_audit_log.sql` — `fn_auditar_mutacao` para `lancamento`, `caixa`, `vendedora`.
- [ ] Migration `013_trg_validar_dados_categoria.sql` — validação JSONB por categoria.
- [ ] Migration `014_trg_notificar_pendencia.sql` — notificação automática ao criar pendência.
- [ ] Migration `015_trg_atualizar_cliente_cache.sql` — atualiza `cliente_cache` em insert/update.

### 4.4. RLS

- [ ] Migration `020_rls_habilitar.sql` — `ENABLE RLS` em todas as tabelas.
- [ ] Migration `021_rls_helper.sql` — `fn_tem_papel`.
- [ ] Migration `022_rls_caixa.sql`, `023_rls_lancamento.sql`, `024_rls_demais.sql`.
- [ ] Migration `025_trg_papel_inicial.sql` — atribui `operador`+`admin` ao primeiro usuário SSO.

### 4.5. RPCs

- [ ] **BACK-04** — Migration `030_rpc_upsert_lancamento.sql` — chamada pelo Excel e Web.
- [ ] **BACK-04b** — Migration `031_rpc_upsert_lancamento_lote.sql` — RPC `upsert_lancamento_lote(payload jsonb[])` em lote chamada pelo VBA do Excel. Aceita até 50 lançamentos por chamada. Retorna array com `id_lancamento` + `updated_at` + `conflito` por item. Referenciada em `02 §4.4`. **Crítico para Fase 3 — sem isso o Excel não sincroniza.**
- [ ] Migration `032_rpc_resolver_pendencia.sql`.
- [ ] Migration `033_rpc_cancelar_lancamento.sql`.
- [ ] Migration `034_rpc_criar_caixa_se_nao_existe.sql`.
- [ ] Migration `035_rpc_fechar_caixa.sql`.
- [ ] Migration `036_rpc_dashboard_resumo.sql`.
- [ ] Migration `037_rpc_revelar_pii.sql`.

### 4.6. Storage

- [ ] Migration `040_storage_buckets.sql` — bucket `comprovantes` (privado, 5 MB, MIME PDF/JPEG/PNG/WebP).
- [ ] Migration `041_storage_policies.sql` — upload/select para autenticados com papel; delete proibido.
- [ ] Bucket adicional `backups` (privado).

### 4.7. Edge Functions (Deno)

- [ ] `supabase/functions/cria_caixa_diario/index.ts`.
- [ ] `supabase/functions/disparar_notificacoes/index.ts`.
- [ ] `supabase/functions/enviar_email_notificacao/index.ts`.
- [ ] `supabase/functions/arquivar_ano/index.ts`.
- [ ] `supabase/functions/backup_semanal/index.ts`.
- [ ] `supabase/functions/alertar_anomalia/index.ts` (cron 30 min).
- [ ] `supabase/functions/sso_callback/index.ts` (se necessário para hook de domínio).

### 4.8. pg_cron

- [ ] Migration `050_pgcron_jobs.sql` — `cria_caixa_diario` (06:00 BRT diário), `notif_4h` (08/12/16 BRT seg-sáb), `arquivar_ano` (01/01 00:30), `backup_semanal` (domingo 04:00), `limpeza_logs` (domingo 03:00).

### 4.9. Realtime

- [ ] `ALTER PUBLICATION supabase_realtime ADD TABLE` para `lancamento`, `caixa`, `notificacao`.

### 4.10. BACK-AUTH — Google OAuth com restrição de domínio

- [ ] **Google Cloud Console** → Credentials → OAuth 2.0 Client ID → tipo "Web application" → callback `https://<projeto>.supabase.co/auth/v1/callback`. Anotar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
- [ ] No Supabase: **Authentication → Providers → Google** habilitado, com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` cadastrados.
- [ ] Web envia parâmetro `hd=vdboti.com.br` no fluxo OAuth (camada UI/UX — apenas dica visual ao Google, **não é segurança**).
- [ ] Migration `026_trg_validar_dominio_email.sql` — trigger `BEFORE INSERT` em `auth.users` que rejeita emails fora de `@vdboti.com.br` com `RAISE EXCEPTION 'Acesso restrito ao domínio vdboti.com.br'` (camada de segurança real).
- [ ] Documentar explicitamente: o parâmetro `hd` sozinho **não é segurança**. A validação obrigatória acontece no banco.
- [ ] Login de teste validado: usuário com email `@vdboti.com.br` entra; usuário com outro domínio é bloqueado.

### 4.11. BACK-FINAL — Smoke test integral (arquivo 03 §11.9)

> Só marcar Fase 1 concluída após esse teste passar.

- [ ] Login via Google OAuth cria registro em `auth.users` (apenas `@vdboti.com.br`).
- [ ] Trigger atribuiu papel `operador`+`admin` ao primeiro usuário automaticamente.
- [ ] Trigger de validação de domínio rejeita inserção com email fora de `@vdboti.com.br`.
- [ ] `INSERT` em `lancamento` via RPC `upsert_lancamento` funciona.
- [ ] `upsert_lancamento_lote` aceita batch de 50 e retorna array com status por item.
- [ ] Trigger preencheu `hash_conteudo` no lançamento.
- [ ] `audit_log` recebeu linha com `dados_antes`/`dados_depois`/`usuario_id`/`usuario_email`/`fonte`.
- [ ] Soft-delete via mudança de estado (`excluido`); `DELETE` físico via API é bloqueado pela RLS.
- [ ] RLS bloqueia leitura/escrita por usuário sem papel.
- [ ] Pendência atrasada > 3 dias úteis gera notificação `urgente`.
- [ ] `dashboard_resumo` retorna agregados consistentes.
- [ ] Trigger imutável de `audit_log` rejeita UPDATE/DELETE mesmo com `service_role`.

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

> O alias `caixaboti.plexalabs.com` é apontado **apenas** depois do UAT aprovado (item OPS-DEPLOY-WEB na Fase 4). Aqui o site responde em `controle-caixa.pages.dev`.

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
- [ ] Adicionar custom domain `caixaboti.plexalabs.com` via MCP (cria CNAME automaticamente na zona `plexalabs.com`).
- [ ] HTTPS automático (Cloudflare emite certificado).
- [ ] Validar headers de segurança em produção (`curl -I https://caixaboti.plexalabs.com`).
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
- [ ] **CA-11** — Google OAuth autentica corretamente, restringe ao domínio `@vdboti.com.br` e nega acesso a outros domínios.
- [ ] **CA-12** — Comprovante de Pix anexado é recuperável e renderizável em < 2s.
- [ ] **CA-13** — Cancelar lançamento exige todos os campos de cancelamento e move o lançamento para a cor vermelha.
- [ ] **CA-14** — Sistema sobrevive a perda de internet por 30 minutos sem perda de dados (modo offline + retry).
- [ ] **CA-15** — Backup semanal exportado para Excel pode ser aberto e contém todos os caixas do período.

---

## 9. PLANO DE TESTES UAT (arquivo 05 §45 — Apêndice L)

30 cenários a serem validados pelo Operador antes do go-live. Cada item: passos, resultado esperado, status (✅/❌), observações.

- [ ] **UAT-001** Login Web Google OAuth — abrir `caixaboti.plexalabs.com`, clicar "Entrar com Google", autenticar com conta `@vdboti.com.br`, voltar logado. Conta de outro domínio é rejeitada.
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
- [ ] Google OAuth provider conectado, restrição `@vdboti.com.br` ativa (UI `hd` + trigger Postgres).
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
- Decisões consolidadas pelo Operador (ver seção "Decisões consolidadas pelo Operador" no topo): projeto Supabase NOVO `controle-caixa-prod`, Cloudflare Pages com alias `caixaboti.plexalabs.com`, Google OAuth restrito a `@vdboti.com.br`, operação via MCPs. Aplicado neste commit `[F0] ajustes pos-validacao`.

### Fase 1 — pendente
### Fase 2 — pendente
### Fase 3 — pendente
### Fase 4 — pendente
