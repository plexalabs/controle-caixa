# PROGRESSO — Sistema de Controle de Caixa

> Estado do projeto após o merge do CP4 backend na `main` (2026-05-01).
> Stack canônica documentada em `docs/STACK.md`.

## Status — fim do CP4 backend (2026-05-01)

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

### Em andamento

- [ ] **Fase 2 — CP5**: PWA + offline-first (service worker funcional, IndexedDB)
- [ ] **Fase 3** — Excel/VBA + Apps Script (sincronia bidirecional)
- [ ] **Fase 4** — Integração e operação (deploy Cloudflare Pages, UAT, alias prod)

### Pendências conhecidas (registradas, sem prioridade definida)

1. **`fn_recalcular_caixa`**: decisão alinhada (Escola 1 + coluna auxiliar) — `cancelado_pos` sai do `total_valor` e ganha coluna nova `total_cancelado_pos`. Sub-rodada futura.
2. **Triggers de auditoria/notificação**: `trg_lancamento_audit` e `trg_lancamento_notif_pendencia` tratam novos estados genericamente. Notificações específicas para `finalizado`/`cancelado_pos` ficam para evolução.
3. **Self-host de fontes**: Fraunces + Manrope ainda via Google Fonts CDN (decisão de produto — ver D5 da auditoria pós-Vite).
4. **`web/public/sw.js` é placeholder**: cache-first do shell e fila offline entram no CP5.
5. **Redirect URLs no Supabase Dashboard**: confirmar manualmente que `:8080` (porta antiga) foi removida e `:5173` (Vite) está na lista. MCP não expõe Auth config — manual no Dashboard.
6. **Ruído em `dados_categoria`**: itens migrados do CP3 ainda têm chaves `estado_final` etc. no JSON. Frontend ignora — limpar exigiria desabilitar trigger anti-mudança (privilégio indisponível em Supabase Cloud).

## Como rodar

Comandos canônicos em `docs/STACK.md`. Resumo:

```bash
npm install
cp .env.example .env.local   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173/
npm run build                # /dist (~92 KB gzip)
npm run preview              # http://localhost:4173 (com CSP)
```

## Histórico de merges na main

```
c9aa7f6  [F2BACK] merge: fluxo em analise + observacoes imutaveis + estados finais
         (engloba toda Fase 2: CP1, CP2, CP3.x, saneamento Vite e CP4 backend)
e69abca  Merge: fase-1b refactor auth (email + senha + OTP via Resend)
146cb31  Merge: hotfix Vault (migration 187 cloud-compatible)
87eb3e4  Merge: Fase 1 (backend Supabase) concluida
```

Branches `fase-2-frontend`, `fase-2-backend-fluxo-analise`, `fase-1-backend`, `fase-1-hotfix-vault`, `fase-1b-refactor-auth` foram criadas como working branches sequenciais e absorvidas pela linha principal. O conteúdo da Fase 2 inteira chegou na main em um único merge no-ff (a branch CP4 foi cortada de `fase-2-frontend`, herdando seus commits).
