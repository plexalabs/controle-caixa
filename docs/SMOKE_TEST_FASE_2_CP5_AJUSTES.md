# Smoke Test — Fase 2 / CP5 Ajustes

> **Branch:** `fase-2-cp5-ajustes`
> **Data:** 2026-05-01
> **Build:** `vite build` OK (367 kB / gz 94 kB · 79 módulos)
> **Dev server:** `http://localhost:5183`

## Resumo

| # | Teste | Status |
|---|-------|--------|
| 1 | Update vendedora funciona — sem erro de trigger | ✅ |
| 2 | Sidebar expandida em desktop | 🟡 visual |
| 3 | Sidebar colapsada — toggle + tooltip + persiste em IndexedDB | 🟡 visual |
| 4 | Sidebar mobile — off-canvas + hamburguer | 🟡 visual |
| 5 | User-menu — avatar abre popover + admin vê "Painel admin" | 🟡 visual |
| 6 | Etiqueta "EM ANÁLISE" legível | 🟡 visual |
| 7 | Favicon adapta light/dark do sistema | 🟡 visual |

## Backend — diagnóstico do bug 1

```sql
-- Antes do fix
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='vendedora' AND column_name LIKE 'atualiz%';
-- → atualizada_em (feminino, outlier)

SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='fn_atualizar_timestamp';
-- → NEW.atualizado_em = now();  (masculino, padrão)
```

**Causa raiz:** vendedora foi a única tabela criada com a coluna no feminino (`atualizada_em`). A trigger universal `fn_atualizar_timestamp()` tenta `NEW.atualizado_em = now()` em todas as tabelas, e em vendedora batia em coluna inexistente. INSERT funcionava porque o trigger BEFORE UPDATE só dispara em UPDATE.

**Fix aplicado** — migration `20260501120000_vendedora_atualizado_em_padroniza_cp5_fix.sql` (idempotente via DO block):
```sql
ALTER TABLE public.vendedora RENAME COLUMN atualizada_em TO atualizado_em;
```

**Validação SQL pós-fix:**
```sql
UPDATE public.vendedora SET nome = nome WHERE nome = 'Vendedora Teste'
RETURNING id, nome, atualizado_em;
-- ✅ atualizado_em: 2026-05-01 16:18:52.115664-03
```

## Frontend — testes visuais (Operador valida)

### T2 · Sidebar expandida

- [ ] `/dashboard` carrega: à esquerda, coluna 240px com logo (símbolo + "Caixa Boti" Fraunces) + 3 itens (Caixas, Pendências, Notificações com badge se >0) + rodapé com avatar
- [ ] Item Caixas com `aria-current="page"` em `/caixas` (background musgo translúcido, borda esquerda 3px musgo)
- [ ] Hover em outros itens: papel-2 sutil
- [ ] Toda a área de conteúdo respira normalmente (mesmo padding interno das páginas anteriores)
- [ ] Drawer lateral (modal-adicionar-nf, modal-editar-lancamento) ainda abre da direita por cima sem ser cortado pela sidebar

### T3 · Sidebar colapsada

- [ ] Click no toggle (chevron no canto superior direito do topo da sidebar) reduz para 68px
- [ ] Texto dos itens fade-out + max-width animados; só ícones visíveis
- [ ] Hover em item colapsado mostra tooltip pt-BR à direita ("Caixas", "Pendências", "Notificações")
- [ ] Badge de notificação em colapsado vira pequena bolinha no canto superior direito do ícone (com borda papel)
- [ ] F5 mantém o estado: chave `ui_sidebar_estado` em IndexedDB DB `caixa-boti-ui` store `preferencias`
- [ ] Toggle reverte para expandida com mesma animação

### T4 · Sidebar mobile (<768px)

- [ ] Em viewport <768px (DevTools): sidebar some, hamburguer aparece no canto superior esquerdo
- [ ] Click no hamburguer desliza sidebar de off-canvas com curva spring + overlay escuro
- [ ] ESC fecha. Click no overlay fecha. Click em link de nav fecha. Click no toggle fecha
- [ ] Resize de mobile→desktop volta sidebar à preferência persistida (expandida/colapsada)
- [ ] Resize de desktop→mobile fecha automaticamente

### T5 · User-menu

- [ ] Click no avatar+nome do rodapé abre popover (~280px) saindo "para fora" da sidebar (à direita, alinhado pelo canto inferior do trigger)
- [ ] Header papel-2 com nome + email do usuário
- [ ] 3 grupos separados por borda papel-3:
  1. **Painel admin** (admin) ou **Configurações** (operador puro) → `/configuracoes`
     **Seu perfil** → `/perfil`
  2. **Receber ajuda** com pílula `Em breve` (não-clicável)
  3. **Sair** com hover alerta vermelho
- [ ] ESC fecha · click fora fecha · click em item fecha + navega
- [ ] Como operador puro (sem papel admin), aparece "Configurações" em vez de "Painel admin"
- [ ] z-index 60 — popover por cima de qualquer drawer

### T6 · Etiqueta "EM ANÁLISE" legível

- [ ] Em `/caixa/2026-04-30`, item NF-CP4-T8 (sem categoria, em análise): a tira lateral tracejada agora tem opacidade 0.65 nas listras
- [ ] Texto vertical "EM ANÁLISE" em weight 800, espaçamento 0.18em, com text-shadow halo papel-claro
- [ ] Hover na tira: texto continua legível sem competir com o tracejado

### T7 · Favicon

- [ ] Em modo light do navegador: favicon "Caixa Boti" em musgo (#0F4C3A) — visível
- [ ] Em modo dark do navegador (Chrome → Settings → Appearance → Dark): favicon vira papel cru (#F5EFE6) — visível em ambos os fundos
- [ ] `/favicon.svg` retorna 200 com `<style>` block contendo `prefers-color-scheme: dark`

## Decisões de UX tomadas

1. **Breakpoint mobile = 768px** — alinhado com Tailwind `md:` que o resto do app já usa.
2. **Default mobile = colapsado off-canvas; default desktop = expandido** — mas pref persistida no IndexedDB sobrescreve em viewport desktop.
3. **Toggle só age em desktop** — em mobile o toggle (no topo da sidebar aberta) **fecha** o off-canvas em vez de colapsar; isso evita um terceiro estado confuso.
4. **Tooltip em colapsado** = pseudo-element `::after` no `.sidebar-link`, não um div extra. Aparece no hover/focus, animação spring de 220ms. `data-tooltip` carrega o label.
5. **Bell drawer descontinuado** — antes o sino abria um drawer com últimas 20 notificações. Agora "Notificações" é um link comum da sidebar com badge realtime; click vai direto para `/notificacoes`. Decisão: a tela paginada já cobre o caso, e drawer + sidebar dois cliques duplicava função.
6. **Sino exporta `montarSino({ slotBadge })`** — recebe seletor do elemento que vai ser o badge. A sidebar passa `#sidebar-bell-badge`. Realtime atualiza só esse slot.
7. **z-index canônico em `:root`** — `--z-sidebar:20`, `--z-drawer:40`, `--z-modal:50`, `--z-user-menu:60`. Documentado no CSS.
8. **`ligarShell()` chama `ligarSidebar()`** — cada página continua chamando uma função única, sem precisar saber da estrutura interna do shell.
9. **Atributo `data-shell="1"` em `#app`** controla o grid; o router limpa esse atributo entre rotas, e `ligarShell()` reaplica. Páginas auth (login etc.) não chamam `ligarShell` e ficam em layout cheio.
10. **Logo na sidebar** — usa o mesmo `mask-image` do header antigo (musgo controlado por `background`); símbolo 32px + "Caixa Boti" Fraunces 1.18rem ao lado. Em colapsada o texto desaparece via `opacity 0; max-width 0`. Sem "lombada" decorativa — a "lombada verde escuro" da imagem 6 era o conjunto logo+gap+texto do header antigo, naturalmente desaparece com o refactor.
11. **Favicon = mesmo path do logo + style adaptativo** — não inventei mark novo; mantive a identidade exata, só permiti que `prefers-color-scheme: dark` troque o fill de musgo para papel.
12. **Header.js neutralizado, não deletado** — exporta funções vazias para não quebrar imports legados que possam ter sido perdidos. Limpeza definitiva fica para rodada futura quando todo grep confirmar 0 referências.

## Pendências conhecidas

- **`web/components/header.js` continua no repo** mas só com stubs — pode sair em rodada de polimento.
- **Bell drawer antigo** (`abrirDrawer`/`carregarLista` etc. do `notification-bell.js` original) foi removido junto. Atalho `Alt+N` que apontava para o drawer também sumiu — se quiser de volta, fazer um drawer de "preview" da sidebar (complexidade vs benefício discutível).
- **Animação do hamburguer**: hoje é só fade-in da sidebar. Sem ícone que vira "X" — fica como nice-to-have.
- **Modal-confirmação** que usa `abrirModal` herda z-index do `.overlay-fundo` (não está nas variáveis novas). Se aparecer empilhamento errado entre modal e user-menu (improvável já que user-menu fecha em qualquer click fora), revisitar.
- **Preferência IndexedDB do sidebar** não sincroniza entre abas em tempo real — se você colapsar numa aba e voltar pra outra que está expandida, só na próxima carga reflete. Aceitável.
- **Tooltip da sidebar colapsada usa `::after`** com `attr(data-tooltip)`. Funciona em todos os browsers modernos; em mobile não dispara (sem hover) — mas mobile abre off-canvas full então não é problema.

## Arquivos novos

```
supabase/migrations/
  20260501120000_vendedora_atualizado_em_padroniza_cp5_fix.sql

web/app/
  shell.js
  ui-prefs.js                                # IndexedDB helper

web/components/
  sidebar.js
  user-menu.js

web/public/
  favicon.svg                                # adaptativo
```

## Arquivos modificados

```
web/app/router.js                            # limpa data-shell entre rotas
web/app/pages/dashboard.js
web/app/pages/caixa.js
web/app/pages/caixas.js
web/app/pages/configuracoes.js
web/app/pages/configuracoes-vendedoras.js
web/app/pages/perfil.js
web/app/pages/pendencias.js
web/app/pages/notificacoes.js
web/components/header.js                     # stub deprecado
web/components/notification-bell.js          # virou só badge updater
web/styles/components.css                    # +560 linhas: shell, sidebar, user-menu, em-analise
web/index.html                               # favicon adaptativo
```

## Lista de commits

```
2534d88 [F2-CP5-FIX] header.js neutralizado (export vazio, deprecado)
feb34fa [F2-CP5-FIX] favicon que respeita prefers-color-scheme
ca9c495 [F2-CP5-FIX] paginas migradas de header para sidebar
c0108c2 [F2-CP5-FIX] estilos sidebar + user-menu + em-analise legivel
4d52a52 [F2-CP5-FIX] componente user-menu popover
a36dd89 [F2-CP5-FIX] componente sidebar colapsavel + ui-prefs IndexedDB
d87c58f [F2-CP5-FIX] migration: vendedora atualizado_em (renomeia atualizada_em)
```
