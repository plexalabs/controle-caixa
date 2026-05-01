# Inventário Fase 2 — spec versus implementado

> Auditoria comparando `docs/04_FRONTEND_WEB_MICROSITE.md` (spec original, ~1780 linhas) com o estado real de `web/` na main após o merge CP4 (commit `c9aa7f6`).
> Sem código de feature nesta rodada. Documento serve como roadmap.
> Data: 2026-05-01.

## Bloco 1 — Inventário comparativo

### Auth (§5, linhas 218–479)

| Tela / Feature        | Status | O que tem                                                         | O que falta                            |
|-----------------------|--------|--------------------------------------------------------------------|-----------------------------------------|
| `/login`              | ✅      | tela split editorial Fraunces+Manrope, validação inline, redirect com `?proximo=` | —                                       |
| `/cadastro`           | ✅      | nome+sobrenome+email+senha com indicador de força + match           | —                                       |
| `/confirmar` (OTP)    | ✅      | 8 inputs auto-focados, paste preenche todos, auto-submit            | —                                       |
| `/recuperar`          | ✅      | mensagem genérica anti-enumeração                                   | —                                       |
| `/redefinir`          | ✅      | tela criada na CP2.4 (não estava na spec original — adição posterior) | —                                       |
| Validação senha       | ✅      | `utils.js validarSenha`                                             | —                                       |

> **Divergência relevante**: §5 introdutório (linha 220) menciona "Decisão revisada (2026-04-29 fim do dia): Auth via Supabase Auth nativo com email + senha + confirmação OTP de 6 dígitos por email (Resend SMTP)". Operador depois decidiu **OTP de 8 dígitos** (CP2.2 ajustes pós-validação). Spec não foi atualizada.

### Dashboard (§6, linhas 484–625)

| Tela / Feature                       | Status | O que tem                                                | O que falta                                                 |
|--------------------------------------|--------|-----------------------------------------------------------|-------------------------------------------------------------|
| `/dashboard`                         | 🟡     | saudação editorial, 4 stat-cards via `dashboard_resumo` RPC, top pendências, notificações realtime | charts (donut por categoria + bar série 30d) |
| `<stat-card>` Web Component (§11.2)  | 🟡     | classe CSS `.stat-card` implementada (não é Web Component) | spec pede Custom Element; decidimos por classe CSS — funciona equivalente |
| Donut chart por categoria            | 🔴     | —                                                          | spec pede Chart.js doughnut; **decidimos não trazer Chart.js** (~150KB) — substituível por barras horizontais CSS |
| Bar chart série diária 30d           | 🔴     | —                                                          | idem                                                        |

### Caixa do dia (§7, linhas 629–818)

| Tela / Feature              | Status | O que tem                                              | O que falta                                                   |
|-----------------------------|--------|---------------------------------------------------------|----------------------------------------------------------------|
| `/caixa/:data`              | ✅      | etiqueta vertical, badge status, lista de lançamentos, realtime, resumo do dia | —                                                              |
| `<tab-bar>` (§11.1)         | ⚪      | —                                                       | substituído pela tela `/caixas` dedicada (decisão CP3.4)       |
| `<filter-bar>` (§7.2)       | 🔴     | —                                                       | barra de filtros (categoria/cliente/estado) ainda não implementada |
| Linha colorida por categoria| ✅      | tira lateral + etiqueta vertical no hover                | —                                                              |
| Botão "Fechar caixa"        | 🔴     | spec mostra esse botão no header (§7.1 linha 673)        | tela de fechamento + RPC `fechar_caixa` já existe, falta UI    |
| Realtime da lista           | ✅      | channel `lancamento_changes`                             | —                                                              |

### Modal "Novo lançamento" (§8, linhas 821–1019)

| Tela / Feature                               | Status | O que tem                                                       | O que falta                                                        |
|----------------------------------------------|--------|------------------------------------------------------------------|---------------------------------------------------------------------|
| `<entry-form>` Web Component (§8.2)          | ⚪      | spec pedia Custom Element                                         | substituído por **2 componentes JS**: `modal-adicionar-nf.js` (NF+valor minimal) e `modal-editar-lancamento.js` (categorizar/gerenciar/finalizado) — decisão CP3.6, melhor UX para o fluxo "em análise" |
| Drawer lateral em vez de modal centralizado  | ✅      | `modal.js` aceita `lateral: true` para drawer                     | —                                                                    |
| Comportamento dinâmico por categoria         | ✅      | `renderCamposCategoria(cat)` em modal-editar-lancamento           | —                                                                    |
| Campos comuns (NF/pedido/cliente/valor)      | ✅      | preservados ao trocar categoria, com confirmação de descarte se sujo | —                                                                    |
| Carregar vendedoras no select Dinheiro       | ✅      | query a `vendedora` ativa                                         | —                                                                    |

### Tela Pendências (§9, linhas 1024–1117)

| Tela / Feature           | Status | O que tem                            | O que falta                                                           |
|--------------------------|--------|---------------------------------------|------------------------------------------------------------------------|
| `/pendencias`            | 🔴     | —                                     | tela inteira; **view `pendencia` existe** no banco e foi atualizada no CP4 (inclui `completo` agora) |
| Filtro severidade        | 🔴     | —                                     | select com `urgente/aviso/normal`                                      |
| Busca NF/cliente         | 🔴     | —                                     | input + debounce                                                       |
| Resolver inline          | 🔴     | —                                     | abre drawer de categorizar/finalizar do CP4                            |

### Tela Configurações (§10, linhas 1121–1131)

| Tela / Feature                  | Status | O que tem                              | O que falta                                                     |
|---------------------------------|--------|-----------------------------------------|------------------------------------------------------------------|
| `/config` (cfg de chaves admin) | 🔴     | —                                       | tabela `config` existe; UI para editar `pendencia.dias_alerta_atraso` etc. |
| Vendedoras CRUD                 | 🔴     | —                                       | tabela `vendedora` existe; CRUD direto via REST                  |
| Feriados CRUD                   | 🔴     | —                                       | tabela `feriado` existe; afeta `dias_uteis_entre`                |
| Usuários e papéis               | 🔴     | —                                       | tabela `usuario_papel` existe; admin precisa gerenciar           |

> **Divergência**: spec dedica apenas 8 linhas pra `/config` ("implementação direta, sem novidades"). Operador detalhou 4 sub-seções na confirmação. Spec subestima trabalho.

### Componentes reutilizáveis (§11, linhas 1134–1199)

| Componente                       | Status | O que tem                                             | O que falta                                                                |
|----------------------------------|--------|-------------------------------------------------------|----------------------------------------------------------------------------|
| `<tab-bar>` (§11.1)              | ⚪      | —                                                     | substituído pela tela `/caixas`                                            |
| `<stat-card>` (§11.2)            | 🟡     | classe CSS `.stat-card` (não Custom Element)           | desvio aceitável — comportamento equivalente                              |
| `<notification-bell>` (§11.3)    | 🔴     | —                                                     | tabela `notificacao` ✅ + realtime publication ✅; falta UI no header        |
| `<modal>` (§11.4)                | ✅      | `modal.js` (genérico) + `modal.lateral` (drawer)       | —                                                                          |
| `header.js`                      | ✅      | barra superior com nav, avatar, sair (não estava na spec original mas necessário) | —                                                                          |
| `logo.js`                        | ✅      | mask-image colorível (CP3.9)                           | —                                                                          |
| `pop-select.js` / `pop-data.js`  | ✅      | substituem dropdowns/datepickers nativos               | —                                                                          |

### Sistema de cores e CSS (§12, linhas 1203–1373)

| Item                          | Status | O que tem                                       | O que falta                              |
|-------------------------------|--------|--------------------------------------------------|-------------------------------------------|
| `styles/tokens.css`            | ✅      | paleta editorial papel/musgo/âmbar + categorias canônicas | —                                         |
| `styles/components.css`        | ✅      | `.lanc-row`, `.caixa-row`, `.resumo-dia`, `.painel-lateral`, `.pop-*` | —                                         |
| `styles/print.css`             | 🔴     | —                                                | spec pede CSS de impressão (linha 116 estrutura) |
| Dark mode (`prefers-color-scheme: dark`) | ⚪ | — | spec menciona em §12.1 e index.html base; **decisão**: paleta papel é light-first, dark fora do MVP |
| `styles/tailwind.css`           | ✅      | entrypoint @tailwind via PostCSS (CP3.15)        | —                                         |

### Camada de dados (§13, linhas 1374–1411)

| Item                                | Status | O que tem                                       | O que falta                            |
|-------------------------------------|--------|--------------------------------------------------|-----------------------------------------|
| `app/supabase.js`                   | ✅      | client npm via Vite, env via `import.meta.env.VITE_*` | —                                       |
| `esm.sh CDN`                        | ⚪      | —                                                | substituído por npm na CP3.15          |
| storage adapter em memória (regra)  | ✅      | `memoriaStorage` Map (CP1)                       | —                                       |
| RPCs no banco                       | ✅      | upsert_lancamento, dashboard_resumo, criar_caixa_se_nao_existe, fechar_caixa, cancelar_lancamento, resolver_pendencia, revelar_pii, upsert_lancamento_lote, **+ adicionar_observacao, categorizar_lancamento, marcar_finalizado, marcar_cancelado_pos** (CP4) | —                                       |

### State management (§14, linhas 1414–1451)

| Item             | Status | O que tem                                                  | O que falta              |
|------------------|--------|-------------------------------------------------------------|---------------------------|
| `app/store.js`   | ✅      | `obter / definir / assinar` minimalista, equivalente à spec | —                         |
| Uso real do store| 🟡     | esqueleto exportado mas pouco usado nos componentes — estado vive no DOM e em variáveis de módulo (ok pro MVP) | maior uso quando bell + pendências chegarem |

### Realtime (§15, linhas 1455–1473)

| Subscribe                            | Status | O que tem                                     |
|--------------------------------------|--------|------------------------------------------------|
| `/caixa` → `lancamento` filtered     | ✅      | channel `caixa-${id}`                          |
| `/dashboard` → tudo com debounce 2s  | 🟡     | só `notificacao` é subscrito; outras tabelas não — debounce não implementado (cf. §15.1) |
| `/pendencias` → `lancamento` pendentes| 🔴    | tela não existe                                |
| `lancamento_observacao` (CP4)        | ✅      | channel `lanc-obs-${id}` para drawer           |

### Notificações em browser (§16, linhas 1477–1527)

| Item                          | Status | O que tem                                          | O que falta                                  |
|-------------------------------|--------|-----------------------------------------------------|------------------------------------------------|
| Toast (`mostrarToast`)        | ✅      | `notifications.js` com 3 tipos (`ok/erro/info`)     | spec usa nomes diferentes (`info/aviso/urgente`) — divergência cosmética |
| Listener `nova-notificacao`   | 🔴     | —                                                   | depende do bell                                |
| Web Push (futuro)             | 🔴     | —                                                   | spec marca como Fase 3                         |
| Som de alerta                 | 🔴     | —                                                   | spec menciona MP3 em `/assets/sounds/alert.mp3` |

### Modo offline (§17, linhas 1530–1601)

| Item                              | Status | O que tem                                       | O que falta                                                      |
|-----------------------------------|--------|--------------------------------------------------|-------------------------------------------------------------------|
| `sw.js`                           | 🟡     | placeholder install/activate/skipWaiting        | sem cache-first do shell, sem fila offline — pendente CP5         |
| Fila offline (Dexie + IndexedDB)  | 🔴     | —                                                | regra inviolável diz **NÃO usar** localStorage/sessionStorage; IndexedDB é o caminho |

### A11y, performance, i18n, testes (§§ 18–21)

| Item                          | Status | Nota                                                            |
|-------------------------------|--------|------------------------------------------------------------------|
| Skip link `#main`             | ✅      | em `index.html`                                                  |
| ARIA / `aria-live` toast      | ✅      | container já tem `aria-live="polite"`                            |
| Foco visível                  | ✅      | `:focus-visible { outline: 2px solid var(--c-musgo) }`           |
| `<300 KB` precache            | ✅      | bundle real ~92 KB gzip                                          |
| Lazy loading de páginas       | 🔴     | tudo importado top-of-file no router.js — funciona mas perde TTI possível |
| `app/i18n.js`                 | 🟡     | esqueleto sem strings; `t()` retorna a chave se não achar — ok pro MVP pt-BR puro |
| Playwright tests              | 🔴     | sem testes E2E automatizados                                     |

### `index.html` base (§23, linhas 1743–1773)

| Item                        | Status | Nota                                                                                  |
|-----------------------------|--------|----------------------------------------------------------------------------------------|
| `index.html` shell           | ✅      | atualizado pós-Vite (Tailwind via build, supabase via npm)                             |
| `<meta theme-color>`         | ✅      | `#0F4C3A` (musgo)                                                                      |
| `<link manifest>`            | ✅      | aponta `/manifest.webmanifest`                                                         |
| Favicon                      | 🟡     | aponta `/assets/logo.svg` (substituiu favicon.svg deletado, pendência sinalizada na auditoria pós-Vite) |

---

## Bloco 2 — Telas que o Operador confirmou precisar

| # | Tela                          | Spec em `docs/04`?                          | RPC/view existente                                                                                      | Reutilizável               | Tamanho          |
|---|-------------------------------|----------------------------------------------|----------------------------------------------------------------------------------------------------------|-----------------------------|-------------------|
| 1 | **Pendências centralizadas** (`/pendencias`) | sim — §9 (linhas 1024–1117)                  | view `pendencia` ✅ (atualizada CP4 — inclui `completo`)                                                  | header, drawer, badge-status, modal-editar-lancamento, pop-select | **médio** ~2-3h |
| 2 | **Config Vendedoras**         | menção de 1 linha em §10 (1127)              | tabela `vendedora` ✅; CRUD via REST direto (sem RPC dedicada — RLS controla)                              | header, drawer, modal | **médio** ~2h   |
| 3 | **Config Usuários e papéis**  | não na spec                                  | tabela `usuario_papel` ✅; admin precisa de RPC `editar_papel(usuario_id, papel)` ou UPDATE direto com RLS | header, drawer | **médio** ~2-3h |
| 4 | **Config Feriados**           | menção de 1 linha em §10 (1128)              | tabela `feriado` ✅; CRUD direto                                                                          | header, drawer, pop-data | **pequeno** ~1h |
| 5 | **Notification bell**         | sim — §11.3 (1193–1195) + §16.1              | tabela `notificacao` ✅ (já populada por triggers); realtime publication ✅                                | header (slot esperando), drawer | **médio** ~2-3h |
| 6 | **Relatórios para contação**  | não — só donut/bar em §6                     | falta RPC nova (`relatorio_mensal`, `relatorio_categoria`); precisa de **`fn_recalcular_caixa` correto** primeiro (pendência registrada) | drawer, pop-data | **grande** >3h  |
| 7 | **Fechamento formal de caixa** (`/caixa/:data/fechar`) | botão mencionado em §7.1 linha 673; sem checklist detalhado | RPC `fechar_caixa(p_caixa_id, p_forcar, p_justificativa)` ✅                                           | header, drawer, modal-editar | **médio** ~2-3h |
| 8 | **Histórico individual NF** (`/lancamento/:id`) | não na spec                                  | tabelas `lancamento`, `lancamento_observacao`, `audit_log` ✅; talvez RPC nova `linha_do_tempo_lancamento(id)` | header, drawer, badge-status, pop-data | **médio** ~2-3h |
| 9 | **Página de perfil** (`/perfil`) | não na spec                                  | `supabase.auth.updateUser({ password })` cobre trocar senha; metadata via `auth.users` | header, drawer | **pequeno** ~1h |

---

## Bloco 3 — Na spec, não pediu o Operador

| Item                                 | Resumo                                                                | Avaliação                                                                                  |
|--------------------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `<tab-bar>` Web Component (§11.1)    | barra de últimas 15 datas como tabs no topo de `/caixa`                | **descartar** — substituído pela tela dedicada `/caixas`                                     |
| `<filter-bar>` (§7.2)                | filtros (categoria, cliente, estado) na lista do caixa                 | **relevante** se o operador começar a ter >50 lançamentos/dia. Por ora pode ficar fora do MVP. |
| Charts no Dashboard (§6)             | doughnut + bar via Chart.js                                            | **avaliar com operador** — Chart.js custa ~150KB. Alternativa: barras CSS horizontais grátis. |
| `<stat-card>` Custom Element         | spec pede Web Component                                                | **descartar como mudança** — classe CSS já cobre, sem perda funcional                         |
| Dark mode (§12.1, §index.html)       | `@media (prefers-color-scheme: dark)`                                   | **descartar** — paleta papel é light-first; design não pede modo escuro                       |
| `styles/print.css`                   | CSS de impressão                                                        | **avaliar pós-MVP** — útil se contação imprimir relatórios. Hoje só preview tela.            |
| Web Push (§16.2)                     | notificações fora do tab                                                | **futuro** — spec já marca Fase 3                                                             |
| Som de alerta urgente                | toast urgente toca MP3                                                  | **descartar** — operador no escritório, ambiente silencioso                                   |
| Service worker funcional (§17.1)     | cache-first do shell                                                    | **CP-PWA dedicado**                                                                            |
| Fila offline IndexedDB (§17.2)       | mutações armazenadas localmente quando offline                          | **CP-PWA dedicado**                                                                            |
| i18n completo (§20)                  | strings em pt-BR.json + função `t()`                                    | **descartar como prioridade** — esqueleto pronto, MVP é pt-BR puro                            |
| Playwright E2E (§21)                 | testes automatizados                                                    | **avaliar pós-MVP** — smoke tests via SQL+browser cobrem por enquanto                         |
| Lazy loading via `import()` (§19.2)  | páginas carregadas sob demanda                                          | **descartar como prioridade** — bundle inteiro 92KB gzip, ganho marginal                      |
| 404 dedicado                         | tela própria                                                            | **já existe inline** no router.js                                                             |
| Atalhos de teclado                   | não estão na spec, mas valem mencionar                                  | **avaliar pós-MVP**                                                                           |

---

## Bloco 4 — Sumário executivo

1. **Status agregado**: do que a spec do `docs/04` cobre, conto **~28 itens implementados (✅)**, **8 parciais (🟡)**, **17 não implementados (🔴)** e **6 despriorizados/substituídos (⚪)**. Os 9 pedidos do Operador no Bloco 2 incluem 4 "novos" que a spec não cobre (usuários, relatórios, histórico NF, perfil).

2. **Os 3 maiores gaps no dia a dia**:
   - **Pendências centralizadas** — operador hoje precisa abrir cada caixa para ver atrasos. Sem essa tela, o sistema parece reativo demais.
   - **Config Vendedoras** — sem CRUD, lançar Dinheiro depende de seed manual no banco. Bloqueia onboarding de novas vendedoras na operação real.
   - **Notification bell** — triggers já populam `notificacao`, mas operador não vê em tempo real. Realtime publication ativa, faltando só a UI no header.

3. **Dependências técnicas críticas**:
   - **Relatórios → `fn_recalcular_caixa` corrigida** (decisão Escola 1 + coluna auxiliar para `cancelado_pos`). Não tem como confiar em "valor líquido mensal" sem o ajuste pós-CP4.
   - **Histórico individual NF → consolidação de 3 fontes** (`lancamento`, `lancamento_observacao`, `audit_log`). Pode exigir RPC nova `linha_do_tempo_lancamento(id)` ou FE faz 3 queries paralelas.
   - **Notification bell → tabela `notificacao` precisa estar populada** corretamente pelos triggers existentes (`fn_notificar_pendencia_criada` etc.). Vale validar que o trigger ainda dispara para `completo` (que agora também é pendência).

4. **Sugestão de agrupamento para próximos checkpoints**:
   - **CP5 — "Painel de pendências e configuração"** (pequeno+médio): `/pendencias`, `/perfil`, `/config/vendedoras`, `/config/feriados`. Reusa quase tudo de CP3/CP4. Estimativa: 1 sessão grande.
   - **CP6 — "Bell + histórico"** (médio): notification bell ativo + `/lancamento/:id` com timeline. Realtime já está pronto. Estimativa: 1 sessão.
   - **CP7 — "Fechamento + recalcular_caixa"** (médio): `fn_recalcular_caixa` corrigido (sub-rodada que ficou pendente do CP4) + tela `/caixa/:data/fechar` com checklist. Estimativa: 1 sessão.
   - **CP8 — "Relatórios + Config admin"** (grande): RPCs novas para relatórios mensais, tela `/config/usuarios`, `/config/sistema`. Depende do CP7.
   - **CP9 — "PWA"** (médio): service worker funcional + fila offline IndexedDB.
   - **Fase 4** — deploy Cloudflare Pages, UAT, alias prod.

   **Ordem técnica importa**: CP7 antes do CP8 (relatórios consomem `fn_recalcular_caixa`). CP5 e CP6 podem ser paralelos / em qualquer ordem.

---

## Anotações da auditoria (não-bug, não-corrigir agora)

- **Spec menciona "OTP de 6 dígitos" (§5 introdutório) — implementação usa 8** (CP2.2 ajustes do operador). Atualizar spec se for fonte de verdade.
- **Spec menciona Google OAuth como opção descartada** — bloco fora; não há referência atual a OAuth no código (só email+senha+OTP).
- **Spec não tem `redefinir.js`** — adicionado no CP2.4 quando o link de email caía em `/redefinir#access_token=...` e precisava de tratamento próprio.
- **Spec usa `<entry-form>` Web Component** — substituído por 2 modais separados (`modal-adicionar-nf.js` + `modal-editar-lancamento.js`). Decisão CP3.6 para suportar fluxo "em análise" minimal vs. categorização completa.
- **Spec usa `<tab-bar>` no header de `/caixa`** — substituído pela tela `/caixas` dedicada (decisão CP3.4).
- **Spec recomenda Chart.js na Dashboard** — não trazido por custo de bundle (~150KB). Distribuição visual via barras CSS é uma alternativa.
- **`pop-select.js` e `pop-data.js`** não constam na spec — adicionados na CP3.11 para escapar dos popups nativos de `<select>` e `<input type="date">`.
- **`store.js` existe mas é sub-utilizado** — frontend atual prefere "estado vive no DOM". Vai ganhar uso quando bell + pendências precisarem compartilhar contadores.
- **`i18n.js` é esqueleto vazio** — strings em pt-BR ficam inline nos componentes. Aceitável para MVP.
