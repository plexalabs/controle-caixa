# PROGRESSO — Sistema de Controle de Caixa

> Estado do projeto após o CP-DEPLOY-LOCAL na `main` (2026-05-03).
> Stack canônica documentada em `docs/STACK.md`.

## Status — fim do CP-DEPLOY-LOCAL (2026-05-03)

### Decisão arquitetural

Cloudflare Pages descartado em favor de execução local + Cloudflare Tunnel.
Razão registrada: Operador preferiu controle total do servidor sobre conveniência
de SaaS estático. Trade-offs aceitos: dependência de PC do trabalho ligado,
manutenção mais frequente, internet do trabalho como SLA.

### Concluído (adições)

- [x] **Sessão 1: Configuração para deploy local**
  - `_headers` ajustada com CSP para Sentry e Cloudflare Insights
  - Script `npm run start:local` com `vite preview --host 127.0.0.1 --port 4173`
  - `infra/tunnel/config.yml` template para tunnel `caixa-boti`
  - `docs/DEPLOY_LOCAL.md` com passo-a-passo manual completo
  - `docs/INFRA.md` documenta arquitetura local

- [x] **Sessão 2: Instalador empacotado**
  - `infra/instalador/instalar-caixa-boti.bat` orquestrador
  - 9 etapas `.bat` granulares (verificar, Node, Git, cloudflared, clone, env, build, tunnel, PM2)
  - Download dinâmico via PowerShell (sem MSIs no repo)
  - Substituição automática de TUNNEL_ID no config.yml via PowerShell
  - PM2 + pm2-windows-startup para autostart do app
  - Idempotência verificada por inspeção em todas as etapas
  - README com troubleshooting (antivírus, repo privado, reinstalação)

### Pendências CP-DEPLOY-LOCAL

- **Validação real**: instalador não testado em ambiente Windows.
  Primeira execução no PC do trabalho é o teste de fato.
- **Repo privado**: se virar privado, clone via HTTPS no `.bat` precisa
  de Personal Access Token. README documenta procedimento.
- **Versão do Node hardcoded**: v20.18.0 em `02-instalar-nodejs.bat`.
  Atualizar URL ao longo do tempo.
- **Antivírus**: Windows Defender pode quarentinar cloudflared.exe.
  README orienta adicionar exceção.
- **Modo offline**: instalador requer internet (downloads PowerShell).
  Se trabalho tiver internet ruim, considerar empacotar MSIs em `recursos/`.
- **Sentry DSN**: configurado no `.env.local` mas Allowed Domains do Sentry
  precisa ser atualizado pra `caixa-boti.plexalabs.com` no Dashboard Sentry.
- **Supabase Site URL**: ainda apontando pra URL provisória de teste anterior.
  Atualizar pra `https://caixa-boti.plexalabs.com` quando tunnel estiver ativo.
- **PITR Supabase**: ainda não ativado. Recomendado antes de uso real.

## Status — fim do CP-PRE-DEPLOY-2 (2026-05-02)

### Concluído (adições)

- [x] **Pré-Deploy 2: Emails customizados pt-BR com identidade editorial**
  - 3 templates HTML editoriais em `supabase/email-templates/`:
    - `confirmation.html` (Confirm signup) — usa `{{ .Token }}`,
      mostra código OTP de 8 dígitos em destaque Courier 38px
    - `recovery.html` (Reset Password) — usa `{{ .ConfirmationURL }}`,
      botão pra `/redefinir`, validade 1 hora
    - `magic_link.html` (Magic Link) — pronto pra futuro `signInWithOtp()`,
      **não usado pelo app hoje** (pular no Dashboard)
  - Subjects editoriais pt-BR (aplicados manualmente no Dashboard):
    - "Caixa Boti · Bem-vindo ao caderno"
    - "Caixa Boti · Vamos refazer sua senha"
    - "Caixa Boti · Sua chave de confirmação"
  - Identidade editorial preservada com fallbacks email-safe:
    - `font-family: 'Fraunces', Georgia, 'Times New Roman', serif` (títulos)
    - `font-family: 'Manrope', -apple-system, 'Segoe UI', sans-serif` (corpo)
    - `font-family: 'Courier New', 'Roboto Mono', monospace` (código OTP)
    - Paleta papel/musgo/âmbar inline (sem CSS variables — Gmail strippa)
  - Logo SVG real (`web/public/assets/logo.svg`) inline com `fill="#2A3D2C"`
    42×42 px no topo esquerdo + wordmark Fraunces italic 24px ao lado.
    Outlook desktop strippa SVG (fallback: wordmark sozinho mantém marca).
  - Filete âmbar 4px à esquerda na caixa do código OTP (acento focal)
  - `border-radius: 18px` total no card (não flat-left/round-right):
    decisão contextual — emails são objetos isolados, não componentes do app
  - README.md em `supabase/email-templates/` com instruções de aplicação
    manual no Dashboard + pré-requisitos (Email OTP Length=8)

### Decisões arquiteturais documentadas

- **OTP via SMTP nativo, não edge function**: descobriu-se durante a
  implementação que não existe edge function `enviar_otp_resend` — o
  Supabase Auth dispara emails direto pelo SMTP do Resend (configurado
  no Dashboard). Os 3 templates são todos aplicados via Auth → Email
  Templates.
- **Versionamento dos templates**: HTMLs ficam em git como fonte da
  verdade. Aplicação no Dashboard é manual (documentada no README).
  Trade-off aceito porque MCP/Management API do Supabase não expõe
  Email Templates programaticamente.

### Pendências CP-PRE-DEPLOY-2

- Validação cross-cliente pendente: validado no cliente do operador,
  mas Outlook desktop e Apple Mail não foram exercitados em escala.
  Possíveis ajustes futuros: SVG inline pode não renderizar em Outlook
  desktop (wordmark Fraunces ao lado mantém legibilidade); fonte
  Fraunces vai pro fallback Georgia em Gmail web.
- Pré-requisito do Dashboard: Auth → Providers → Email → "Email OTP
  Length" deve ser `8` e "Confirm email" habilitado, senão `{{ .Token }}`
  vem vazio no template Confirm signup.

## Status — fim do CP-PRE-DEPLOY-1 (2026-05-02)

### Concluído (adições)

- [x] **Pré-Deploy 1: Bugs críticos e infraestrutura de produção**
  - Bug do F5 corrigido: sessão persiste em IndexedDB + boot aguarda
    `getSession()` antes de redirecionar; restore de rota via query `?next=`
  - Tela 404 editorial com etiqueta lateral âmbar e shell respirado
  - Tela "Lançamento não encontrado" contextual (etiqueta "NF", mesmo shell)
  - Catch-all no router para qualquer rota inexistente
  - `supabase-wrapper.js` com `comRetry` (backoff 1s/2s/4s, 3 tentativas)
    distinguindo erros de rede (retry) de validação (falha imediata)
  - `saude-supabase.js`: detector global + banner instabilidade + ping de
    recuperação a cada 5s
  - `log.js`: console.error sempre em dev, Sentry só em prod com DSN setado
  - Migrations: `dias_retencao_arquivamento` (1 ano padrão) + tabela
    `lancamento_arquivado` com RLS read-only
  - RPC `arquivar_antigos` move lançamentos finalizados/cancelados antigos
    preservando observações vivas (auditoria intacta)
  - Edge function `arquivar-mensal` (cron `0 3 1 * *` pendente de configuração)
  - `notificacao-router.js`: mapeamento tipo → destino correto
    - `pendencia_aberta` → `/caixa/:data?nf=NUMERO` com destaque visual
    - `caixa_nao_fechado` → `/caixa/:data`
    - `bom_dia_resumo` → `/dashboard` (TODO: `/caderno-do-dia`)
  - Enriquecedor batch: 2 queries paralelas resolvem `caixa_id → data`
    e `lancamento_id → numero_nf` antes de renderizar lista
  - Destaque visual de NF com animação `pulso-destaque` 4s + scrollIntoView
    (respeita `prefers-reduced-motion`)
  - Hotfix de seeds: migration `restore_seeds_pos_limpeza.sql` repopula
    `config` (9 chaves) e mantém os 15 feriados após limpeza acidental
  - `docs/INFRA.md` documenta setup Sentry + cron Supabase + backup PITR

### Pendências CP-PRE-DEPLOY-1 (registradas)

- Sentry: DSN configurado localmente em `.env.production` (gitignored).
  Pendente apenas setar `VITE_SENTRY_DSN` no painel Cloudflare Pages
  antes do deploy de produção. Detalhes em `docs/INFRA.md`.
- Cron mensal do arquivamento pendente: `0 3 1 * *` precisa ser configurado
  manualmente no Dashboard Supabase → Edge Functions → Schedules.
- Tela `/caderno-do-dia` (sub-rodada futura): substituirá o destino temporário
  `/dashboard` para notificação `bom_dia_resumo`.
- Backup Supabase Pro: confirmar manualmente no Dashboard que Daily Backups
  está ativo e considerar habilitar PITR antes do deploy.
- Lição aprendida sobre limpeza de banco: distinguir dados operacionais
  (truncáveis) de dados de seed (config, feriado — NÃO truncar).

## Status — Fase 2 concluída (2026-05-02)

A Fase 2 (frontend) está completa após CP1 a CP7 + saneamentos.

CP8 (PWA + offline-first) foi avaliado e descartado. Decisão de produto:
o sistema é um site web responsivo padrão. Operador acessa via navegador
em PC e celular sem necessidade de instalação como app. `manifest.webmanifest`
e `sw.js` (placeholder) foram removidos do repo; `index.html` perdeu as tags
`<link rel="manifest">` e `<meta name="theme-color">`; CSP perdeu a diretiva
`manifest-src`.

### Próximos passos

- Fase 3 — Excel/VBA + Apps Script (sincronia bidirecional, backup local,
  importação em massa, exportação para contação)
- Fase 4 — Integração e operação (deploy Cloudflare Pages, alias prod,
  UAT, manuais)

## Status — fim do CP7 (2026-05-02)

### Concluído (adições)

- [x] **Fase 2 — CP7: Admin e relatórios**
  - Migration: `usuario_papel.ativo` + `config.tipo`
  - `/configuracoes/usuarios` (admin) — listagem com último acesso,
    modal de promoção com confirmação por digitação ("promover"),
    auto-proteção contra remoção do próprio papel admin
  - `/configuracoes/feriados` (admin) — CRUD com filtro por ano,
    soft-delete preserva histórico para cálculos retroativos
  - `/configuracoes/sistema` (admin) — nomes amigáveis por chave,
    toggle inline para boolean, modal interativo (stepper + sugestões
    + slider) para number/time/date/text, validação client + backend
  - `/relatorios` (admin + operador) — filtros por período, categoria
    e estado, preview paginado, sumário no topo
  - Export CSV com BOM UTF-8 (Excel pt-BR sem caracteres bagunçados)
  - Export PDF lazy-loaded (jspdf + jspdf-autotable carregam só ao baixar)
  - Hub `/configuracoes` ativa cards admin reais (CP5 deixou placeholder)
  - Sidebar ganha link para `/relatorios`
  - 5 RPCs novas: `listar_usuarios_papeis`, `definir_papeis_usuario`,
    `atualizar_config`, `gerar_relatorio_periodo`, `exportar_relatorio_csv`

### Pendências CP7 (registradas)

- Trigger `trg_config_audit` removido (era pré-quebrado, assumia `id` UUID
  mas `config` usa `chave` varchar como PK). Auditoria via `atualizado_em`
  e `atualizado_por_email` é suficiente por ora.
- Papéis `supervisor` e `auditor` aceitos pelo CHECK do banco mas UI/RPC
  só expõem `admin` e `operador`. Reservados para futura expansão.
- PDF em mobile pode demorar 5-10s para >1000 linhas. Spinner cobre.
- Cache de papéis no client invalida em login/logout/user_updated mas
  não em mudança de papel feita por outro admin com sessão ativa.
  F5 corrige.

## Status — fim do CP6 (2026-05-02)

### Concluído (adições)

- [x] **Fase 2 — CP6: Fechamento e métricas**
  - `fn_recalcular_caixa` atualizado para Escola 1 + coluna auxiliar
    (cancelado_pos sai do total_valor e ganha registro próprio)
  - Migration: `caixa.total_cancelado_pos`, `valor_cancelado_pos`,
    `total_finalizado`, `valor_finalizado`, `observacao_fechamento`
  - Recálculo idempotente de todos os caixas históricos
  - `dashboard_resumo` com novos campos de auditoria
  - Tela `/caixa/:data/fechar` editorial com checklist 4 itens
  - Aviso musgo de fechamento retroativo + aviso âmbar de pendências
  - Justificativa obrigatória em retroativo (≥10 chars) e pendências (≥20 chars)
  - Banner read-only de caixa fechado com SVG cadeado outline
  - Tela `/lancamento/:id` com timeline editorial cronológica reversa
  - RPC `linha_do_tempo_lancamento` consolidando criação + observações
  - Charts CSS no Dashboard: barras horizontais por categoria + movimento 30d
  - RPCs `serie_diaria_caixa` e `distribuicao_categoria_mes`
  - Link "Ver histórico completo" no drawer (modos gerenciar/finalizado)
  - Auditoria de emojis: ✓ ✕ ○ mantidos (Unicode tipográfico),
    🔒 substituído por SVG outline

## Status — fim do CP5 (2026-05-01)

### Concluído

- [x] **Fase 0** — Estrutura do projeto, 5 docs canônicos, `.gitignore`, repo inicial
- [x] **Fase 1** — Backend Supabase
  - 23 migrations base (schema, RLS, triggers, RPCs, storage, pg_cron, seeds)
  - 4 edge functions Deno (cria_caixa_diario, disparar_notificacoes, etc.)
  - Smoke test integral 9/9 aprovado
- [x] **Fase 1B** — Refactor auth: email/senha + OTP via Resend SMTP, vault corrigido
- [x] **Fase 2 — CP1**: Login / Cadastro / Confirmar OTP / Recuperar / Redefinir
- [x] **Fase 2 — CP2**: validações inline, ajustes de UX nas telas de auth, router fechado
- [x] **Fase 2 — CP3.1–3.6**:
  - Dashboard editorial com cards de resumo + notificações realtime
  - Tela `/caixa/:data` (caixa do dia) com lista de lançamentos
  - Tela `/caixas` (arquivo cronológico de todos os caixas)
  - Modal "Adicionar NF" minimal (NF + valor + cliente opcional)
  - Drawer multi-modo (categorizar / gerenciar / finalizado)
  - Modal de novo lançamento dinâmico por categoria
- [x] **Fase 2 — CP3.7–3.13**: polimento editorial
  - Etiquetas verticais nas categorias com hover spring
  - Cabeçalho `/caixas` vira card com etiqueta lateral "ARQUIVO"
  - Logo unificado via mask-image (assets/logo.svg)
  - Pop-select e pop-data customizados (substituem popups nativos)
  - Resumo do dia refatorado com 3 blocos editoriais
- [x] **Fase 2 — CP3.14–3.15**: migração para Vite
  - Dev server com SPA fallback + cache desativado + HMR
  - Tailwind via PostCSS (não mais CDN)
  - supabase-js via npm (não mais esm.sh)
  - Statics em `web/public/` (manifest, sw, _headers, _redirects)
  - Credenciais em `.env.local` (gitignored), prefixo `VITE_*`
- [x] **Fase 2 — Saneamento pós-Vite**: porta `:5173` em docs/env, CSP estrita sem CDNs antigos, `docs/STACK.md` canônico
- [x] **Fase 2 — CP4 backend**: fluxo "em análise" no banco
  - Estados novos: `finalizado` e `cancelado_pos` (enum estado_lancamento)
  - Tabela `lancamento_observacao` imutável (triggers bloqueiam UPDATE/DELETE mesmo para `service_role`)
  - Trigger anti-mudança pós-categorização em `lancamento` (categoria/dados/numero_nf/valor_nf/cliente_nome travam)
  - 4 RPCs novas: `adicionar_observacao`, `categorizar_lancamento`, `marcar_finalizado`, `marcar_cancelado_pos`
  - `upsert_lancamento` aceita criação minimal e rejeita atualização em estado travado com mensagem útil
  - View `pendencia` inclui `completo` (sem desfecho); `dashboard_resumo` ganha 3 contagens novas
  - Realtime publication para `lancamento_observacao`
  - Frontend integrado com RPCs reais (sem mais placeholder JSON)
  - Visual `finalizado` (banner verde) e `cancelado_pos` (strikethrough) na lista
  - Script `tools/migrar_temporarios.sql` idempotente para dados ad-hoc do CP3
  - Smoke tests: backend 10/10, frontend 5/8 via SQL + 3/8 validados visualmente pelo Operador
- [x] **Fase 2 — CP5: Operação mínima viável**
  - Hub `/configuracoes` editorial com cards condicionais por papel
  - `/configuracoes/vendedoras` CRUD completo (insert/update/soft-delete)
  - `/pendencias` centralizadas com filter-bar reutilizável
  - `/perfil` (editar nome, trocar senha re-autenticada)
  - `/notificacoes` paginada
  - Componente `<filter-bar>` reusável (também aplicado em `/caixa/:data`)
  - View `pendencia` ganha `categoria` + `dados_categoria` para filtros do cliente
  - Migration: `vendedora` ganha email/telefone/observacoes
- [x] **Fase 2 — CP5-AJUSTES: Refactor sidebar + identidade visual**
  - Header horizontal substituído por sidebar lateral colapsável
  - Estado da sidebar persiste em IndexedDB (regra inviolável: zero localStorage)
  - User-menu popover editorial (substitui nav antigo) com posicionamento contextual: acima na expandida / lateral na colapsada
  - Logo: símbolo + wordmark no expandido, só símbolo no colapsado
  - Avatar: nome + email no rodapé expandido, só avatar 32px no colapsado
  - Tooltips no estado colapsado com 400ms delay e seta apontando ao ícone
  - Badge de notificações visível em ambos os estados (top-right do bell)
  - Largura expandida `--sidebar-w-expandida: 260px`
  - Hierarquia em 3 zonas (logo / nav / rodapé) com separadores `1px var(--c-papel-3)`
  - Identidade visual `border-radius: 0 X X 0` (esquerda reta, direita redonda) padronizada em:
    `.config-cabec`, `.caixas-cabec`, `.caixa-row`, `.lanc-row`, `.rd-chip`,
    `.vd-card`, `.notif-item`, `.alert`, `.toast`, `.lanc-obs-item`
  - Bug texto vertical "AJUSTES" corrigido (`writing-mode: vertical-rl` em vez de `transform translate+rotate`)
  - Bug `atualizado_em` na vendedora corrigido (renomeação da coluna `atualizada_em` → `atualizado_em` para alinhar com convenção)
  - Etiqueta vertical "EM ANÁLISE" legível (tracejado opacity 0.65 + halo papel-claro)
  - Favicon adaptativo via `prefers-color-scheme` (musgo no light, papel no dark)
  - `header.js` neutralizado (export vazio, deprecado)

### Em andamento

- [ ] **Fase 3** — Excel/VBA + Apps Script (sincronia bidirecional)
- [ ] **Fase 4** — Integração e operação (deploy Cloudflare Pages, UAT, alias prod)

### Pendências conhecidas (registradas, sem prioridade definida)

1. **`fn_recalcular_caixa`**: decisão alinhada (Escola 1 + coluna auxiliar) — `cancelado_pos` sai do `total_valor` e ganha coluna nova `total_cancelado_pos`. Sub-rodada do CP6.
2. **Triggers de auditoria/notificação**: `trg_lancamento_audit` e `trg_lancamento_notif_pendencia` tratam novos estados genericamente. Notificações específicas para `finalizado`/`cancelado_pos` ficam para evolução.
3. **Self-host de fontes**: Fraunces + Manrope ainda via Google Fonts CDN (decisão de produto — ver D5 da auditoria pós-Vite).
4. **Redirect URLs no Supabase Dashboard**: confirmar manualmente que `:8080` (porta antiga) foi removida e `:5173` (Vite) está na lista. MCP não expõe Auth config — manual no Dashboard.
5. **Ruído em `dados_categoria`**: itens migrados do CP3 ainda têm chaves `estado_final` etc. no JSON. Frontend ignora — limpar exigiria desabilitar trigger anti-mudança (privilégio indisponível em Supabase Cloud).
6. **`web/components/header.js`**: stub vazio para não quebrar imports legados. Deletar em rodada de polimento futura quando grep confirmar 0 referências.
7. **Bell drawer descontinuado**: o popover antigo do sino (com últimas 20 notificações) saiu junto com o refactor da sidebar. Click no item "Notificações" da sidebar leva direto a `/notificacoes` (tela paginada). Atalho `Alt+N` foi removido junto.
8. **Tela `/caderno-do-dia` (sub-rodada futura)**: tela editorial agrupando caixas em aberto + suas pendências, acessível via sidebar e via click em notificação `bom_dia_resumo`. Hoje a notificação roteia pra `/dashboard` como solução temporária (TODO no `web/app/notificacao-router.js`).
9. **DSN do Sentry pendente** (CP-PRE-DEPLOY-1): `VITE_SENTRY_DSN` precisa ser setado em `.env.production` antes do deploy. Sem isso, `Sentry.init()` é pulado e erros viram só `console.error`. Setup completo em `docs/INFRA.md`.
10. **Cron mensal do arquivamento pendente** (CP-PRE-DEPLOY-1): edge function `arquivar-mensal` precisa de cron `0 3 1 * *` configurado manualmente no Dashboard Supabase → Edge Functions → Schedules. Sem isso, RPC `arquivar_antigos` não roda automaticamente.
11. **Lição aprendida sobre limpeza de banco** (CP-PRE-DEPLOY-1, 2026-05-02): durante teste de "sistema limpo", o TRUNCATE pegou também a tabela `config` (que é seed, não dado operacional) e o app quebrou — `/configuracoes/sistema` ficou vazio, RPCs que leem chaves passaram a falhar. Restaurado via migration `20260502150000_restore_seeds_pos_limpeza.sql` (idempotente, ON CONFLICT DO NOTHING). **Para resets futuros, distinguir três categorias:**
    - **Dados operacionais** (`lancamento`, `caixa`, `lancamento_observacao`, `notificacao`, `audit_log`) → OK truncar pra começar do zero.
    - **Dados de seed** (`config`, `feriado`) → NÃO truncar; são parte do "esqueleto" do sistema. Sem eles, partes da UI quebram silenciosamente.
    - **Dados de identidade** (`usuario_papel`, `auth.users`, `vendedora`) → só truncar se explicitamente parte do reset de acesso.

## Como rodar

Comandos canônicos em `docs/STACK.md`. Resumo:

```bash
npm install
cp .env.example .env.local   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173/
npm run build                # /dist (~94 KB gzip)
npm run preview              # http://localhost:4173 (com CSP)
```

## Histórico de merges na main

```
67a8917  [F3-DL-2] merge: instalador empacotado para PC Windows
         (orquestrador + 9 etapas .bat + README, PM2 + cloudflared,
          download dinamico via PowerShell, idempotencia total)
30e1033  [F3-DL] merge: configuracao para deploy local com Cloudflare Tunnel
         (CSP+Sentry, npm start:local, infra/tunnel/config.yml,
          docs/DEPLOY_LOCAL.md, INFRA documentado)
d3fdc95  [F3-PRE-2] merge: emails customizados pt-BR com identidade editorial
         (3 templates HTML em supabase/email-templates/,
          subjects editoriais aplicados no Dashboard)
c33edb5  [F3-PRE-1] merge: bugs criticos e infra de producao
         (engloba CP-PRE-DEPLOY-1 + hotfix seeds: F5, 404,
          retry, Sentry, retencao, notificacao-router)
4665a3a  [F2-CP7] merge: admin e relatorios
         (engloba CP7 + CP7-FIX: telas admin /usuarios /feriados
          /sistema, relatorios com export CSV/PDF, RPCs novas)
8a2cd99  [F2-CP6] merge: fechamento e metricas
         (engloba CP6 + CP6-FIX: fn_recalcular_caixa Escola 1, tela de
          fechamento, justificativas, /lancamento/:id, charts CSS)
6a11814  [F2-CP5] merge: operacao minima viavel + ajustes pos-CP5
         (engloba CP5 + CP5-AJUSTES + CP5-FIX: telas de operação,
          refactor sidebar, identidade flat-left/round-right)
c9aa7f6  [F2BACK] merge: fluxo em analise + observacoes imutaveis + estados finais
         (engloba toda Fase 2: CP1, CP2, CP3.x, saneamento Vite e CP4 backend)
e69abca  Merge: fase-1b refactor auth (email + senha + OTP via Resend)
146cb31  Merge: hotfix Vault (migration 187 cloud-compatible)
87eb3e4  Merge: Fase 1 (backend Supabase) concluida
```

Branches `fase-2-cp5-operacao-minima` e `fase-2-cp5-ajustes` foram criadas como working branches sequenciais (a segunda cortada da primeira) e absorvidas pela linha principal — `fase-2-cp5-ajustes` carregou os 25 commits granulares do CP5 + CP5-AJUSTES + CP5-FIX e foi consumida no merge `6a11814`.
