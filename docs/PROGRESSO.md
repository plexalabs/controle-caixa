# PROGRESSO — Sistema de Controle de Caixa

> Estado do projeto após o merge do CP7 na `main` (2026-05-02).
> Stack canônica documentada em `docs/STACK.md`.

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

- [ ] **Fase 2 — CP8**: PWA + offline-first (service worker funcional, fila de mutações, IndexedDB cache)
- [ ] **Fase 3** — Excel/VBA + Apps Script (sincronia bidirecional)
- [ ] **Fase 4** — Integração e operação (deploy Cloudflare Pages, UAT, alias prod)

### Pendências conhecidas (registradas, sem prioridade definida)

1. **`fn_recalcular_caixa`**: decisão alinhada (Escola 1 + coluna auxiliar) — `cancelado_pos` sai do `total_valor` e ganha coluna nova `total_cancelado_pos`. Sub-rodada do CP6.
2. **Triggers de auditoria/notificação**: `trg_lancamento_audit` e `trg_lancamento_notif_pendencia` tratam novos estados genericamente. Notificações específicas para `finalizado`/`cancelado_pos` ficam para evolução.
3. **Self-host de fontes**: Fraunces + Manrope ainda via Google Fonts CDN (decisão de produto — ver D5 da auditoria pós-Vite).
4. **`web/public/sw.js` é placeholder**: cache-first do shell e fila offline entram no CP8.
5. **Redirect URLs no Supabase Dashboard**: confirmar manualmente que `:8080` (porta antiga) foi removida e `:5173` (Vite) está na lista. MCP não expõe Auth config — manual no Dashboard.
6. **Ruído em `dados_categoria`**: itens migrados do CP3 ainda têm chaves `estado_final` etc. no JSON. Frontend ignora — limpar exigiria desabilitar trigger anti-mudança (privilégio indisponível em Supabase Cloud).
7. **`web/components/header.js`**: stub vazio para não quebrar imports legados. Deletar em rodada de polimento futura quando grep confirmar 0 referências.
8. **Bell drawer descontinuado**: o popover antigo do sino (com últimas 20 notificações) saiu junto com o refactor da sidebar. Click no item "Notificações" da sidebar leva direto a `/notificacoes` (tela paginada). Atalho `Alt+N` foi removido junto.

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
