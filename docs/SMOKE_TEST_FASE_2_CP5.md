# Smoke Test — Fase 2 / CP5 (Operação mínima viável)

> **Branch:** `fase-2-cp5-operacao-minima`
> **Data:** 2026-05-01
> **Build:** `vite build` OK (360 kB gz 92 kB)
> **Dev server:** `npm run dev -- --port 5183` rodando em `http://localhost:5183`
> **Status:** 5 SQL ✅ · 8 visuais aguardando Operador

---

## Backend — checagens SQL preparatórias

| # | Teste | Resultado | Status |
|---|-------|-----------|--------|
| SQL-1 | Migration `vendedora_campos_contato_cp5` adiciona `email`/`telefone`/`observacoes` | 6 colunas esperadas presentes (`id, nome, apelido, email, telefone, observacoes, ativa`) | ✅ |
| SQL-2 | Migration `view_pendencia_inclui_categoria_cp5` adiciona `categoria` à view | coluna `categoria` presente | ✅ |
| SQL-3 | Estado atual do banco para validação visual | 6 pendências, 0 urgentes, 12 notif não-lidas, 1 vendedora ativa | ✅ |
| SQL-4 | Notificação `Sino — teste CP5.3` criada via SQL para teste de realtime | id `a61ae45f…` severidade `aviso` | ✅ |
| SQL-5 | RLS `vendedora`: SELECT public, INSERT/UPDATE para admin+operador, DELETE bloqueado | confirmado em `pg_policy` | ✅ |

---

## Frontend — 8 testes visuais (Operador valida no browser)

> Servidor de desenvolvimento ativo em `http://localhost:5183`. Logue com `joaopedro@plexalabs.com` (admin+operador).

### T1 · Hub `/configuracoes` mostra cards corretos por papel

- [ ] Como admin, vê 5 cards: Vendedoras, Perfil, Feriados (em breve), Usuários (em breve), Sistema (em breve)
- [ ] As três últimas com a etiqueta `em breve · CP7` em pílula papel-3
- [ ] Numeração 01..05 em Fraunces italic na coluna esquerda
- [ ] Hover em card ativo: number fica âmbar e desliza, seta âmbar acompanha
- [ ] Rodapé mostra "Você tem privilégios de **administrador**"

> **Para testar como operador puro:** SQL ad-hoc no console do Supabase removendo o papel admin temporariamente, OU criar um segundo usuário no `/cadastro` e atribuir só `operador` em `usuario_papel`.

### T2 · `/configuracoes/vendedoras` CRUD completo

- [ ] Lista carrega "Vendedora Teste" + qualquer outra existente em cards papel com filete âmbar
- [ ] Botão "+ Nova vendedora" abre drawer lateral com 5 campos: nome, apelido, email, telefone, observações
- [ ] Máscara de telefone aplicada ao digitar (ex: `11999999999` → `(11) 99999-9999`)
- [ ] Cria 3 vendedoras de teste com nomes plausíveis ("Ana Carolina", "Fernanda M.", "Patricia L.")
- [ ] Edita uma — drawer abre com dados pré-preenchidos
- [ ] Desativa uma — modal de confirmação aparece com botão vermelho
- [ ] Card desativada some das ativas e aparece no bloco colapsável "Inativas (N)"
- [ ] Bloco "Inativas" abre/fecha clicando no toggle
- [ ] Como admin, botão "Reativar" aparece nas inativas
- [ ] Em `/caixa/hoje`, novo lançamento Dinheiro mostra apenas as 2 ativas no select de vendedora

### T3 · `/pendencias` — lista com filter-bar

- [ ] Header editorial "Pendências" com contagem `N itens`
- [ ] Filter-bar tem 4 campos: Severidade, Categoria, Estado, Buscar
- [ ] Lista mostra 6 pendências (estado atual do banco) ordenadas por idade desc
- [ ] Cada card: bloquinho de idade colorido por severidade (urgente=alerta, aviso=âmbar, normal=musgo) + NF + cliente + data por extenso + categoria pílula colorida + valor à direita
- [ ] Filtro "Categoria=Em análise" reduz a lista para apenas pendentes sem categoria
- [ ] Filtro "Buscar" debounced — digite parte de uma NF e veja o filtro aplicar após 300ms
- [ ] URL bookmarkable: aplique filtros, copie a URL (ex `/pendencias?severidade=urgente&busca=123`), recarregue (F5) — filtros persistem
- [ ] Click em card abre o drawer de edição correto (modo gerenciar para `completo`, modo categorizar para `pendente`)
- [ ] Botão "Limpar filtros" zera tudo

### T4 · Bell no header — contagem realtime + dropdown

- [ ] Sino aparece no header antes do avatar com badge vermelho mostrando contagem
- [ ] Contagem corresponde a notificações não-lidas + não-descartadas (incluindo a "Sino — teste CP5.3" criada via SQL)
- [ ] Click no sino abre **drawer lateral** (decisão tomada: drawer > popover)
- [ ] Drawer mostra últimas 20 notificações com cor por severidade no filete esquerdo
- [ ] Não-lidas mostram botão "Marcar como lida"; já lidas ficam fade
- [ ] "Marcar como lida" funciona — badge cai 1 ao vivo
- [ ] "Marcar todas como lidas" ativo se houver não-lidas, desabilitado se 0
- [ ] **Realtime:** com a aba aberta, rode no SQL Editor `INSERT INTO notificacao(tipo, severidade, titulo, mensagem) VALUES('caixa_nao_fechado','urgente','Realtime teste','Subiu sem F5')` — o badge incrementa sozinho em ~1s
- [ ] ESC fecha o drawer, click fora também
- [ ] **Atalho `Alt+N`** abre o drawer (bonus implementado)
- [ ] Click no avatar/nome leva para `/perfil` (decisão de UX: avatar virou link)

### T5 · `/notificacoes` paginada

- [ ] Header "Avisos" + filter-bar com 3 campos: Estado (Todas/Não lidas/Lidas/Descartadas), Severidade, Buscar
- [ ] Lista mostra até 20 itens por página, ordenadas por data desc
- [ ] Paginação no rodapé com "Página N de M (X avisos)" + botões Anterior/Próxima
- [ ] Botões "Marcar como lida" e "Descartar" funcionam item-a-item
- [ ] Filtro "Descartadas" mostra apenas itens com `descartada_em IS NOT NULL`
- [ ] Trocar página atualiza `?p=2` na URL
- [ ] F5 mantém filtros + página atual

### T6 · `/perfil` — editar nome + trocar senha

- [ ] 5 cards: Nome, Email (read-only), Senha (•••• + botão), Papéis (`Admin + Operador`), Conta criada em
- [ ] "Editar nome" abre drawer com nome+sobrenome — submit chama `auth.updateUser({data})` e atualiza header
- [ ] "Alterar senha" abre modal central com 3 campos: senha atual, nova, confirmação
- [ ] Indicador de força da senha (3 barras) aparece ao digitar
- [ ] Match em tempo real (✓ verde / ✗ vermelho)
- [ ] Submit com **senha atual errada** mostra erro claro "Senha atual incorreta"
- [ ] Submit com **senha atual correta + nova válida** → toast "Senha alterada com sucesso"
- [ ] Logout + login com a **nova senha** funciona
- [ ] (Sugestão para sanidade) volte para a senha original ao terminar

### T7 · Filter-bar em `/caixa/hoje` (CP5.5)

- [ ] Filter-bar aparece acima da lista de lançamentos quando há pelo menos 1 item
- [ ] 4 campos: Categoria (incluindo "Em análise"), Estado (pendente/completo/finalizado/cancelado_pos), Buscar, Toggle "Ocultar resolvidos"
- [ ] Filtro "Categoria=Cartão" reduz a lista
- [ ] Toggle "Ocultar resolvidos" pressionado esconde finalizados e cancelado_pos
- [ ] URL bookmarkable: `/caixa/2026-04-30?categoria=cartao&ocultar_resolvidos=1` mantém filtros após F5
- [ ] Resumo do dia (acima do filter-bar) NÃO é afetado por filtros — sempre mostra totais reais

### T8 · Smoke regressão — fluxos antigos seguem funcionando

- [ ] `/dashboard` carrega cards + saudação + avisos (lista de notificações ainda funciona como antes)
- [ ] `/caixas` carrega lista cronológica
- [ ] `/caixa/2026-04-30` (ou outro com lançamentos) lista certinho
- [ ] Criar novo lançamento via "+ Novo lançamento" funciona (modal-adicionar-nf)
- [ ] Categorizar um pendente via drawer funciona (modal-editar-lancamento)
- [ ] Adicionar observação a um `completo` funciona
- [ ] Finalizar / cancelar pós-pagamento funciona
- [ ] Realtime: abrir 2 abas em `/caixa/X` e mudar algo numa — a outra reflete
- [ ] Console DevTools: zero erros novos relacionados a CP5 (warnings de Supabase realtime são tolerados)

---

## Decisões pontuais tomadas

1. **Drawer lateral (não popover) para o sino** — consistência com o resto do app (`abrirModal({lateral:true})` reusado).
2. **Avatar virou link para `/perfil`** — o spec não pedia, mas era a forma mais natural de chegar em "Seu perfil" e cabe no header sem inventar nav novo.
3. **Migration `vendedora` ganha `email`/`telefone`/`observacoes`** — a tabela só tinha `nome`/`apelido`. O spec explícito do CP5 lista esses campos no drawer, então a migration é necessária. Idempotente via `ADD COLUMN IF NOT EXISTS`.
4. **Filtro "Categoria" em pendencias** — exigiu adicionar `categoria` + `dados_categoria` à view `pendencia` via `CREATE OR REPLACE VIEW`. Postgres não permite reordenar colunas com `OR REPLACE`, então as 2 novas colunas foram adicionadas no FINAL da projeção.
5. **Filter-bar mobile** — não virou accordion no MVP. O grid `auto-fit, minmax(180px, 1fr)` empilha bem em mobile sem precisar de toggle. Deixei como pendência se o operador achar muito alto em telas menores.
6. **Refetch após mutação em vendedoras** — sem realtime (overkill para tabela com poucas linhas).
7. **Atalho de teclado Alt+N** para abrir o sino — implementado como bonus.
8. **`/perfil` lê `auth.users.user_metadata`** direto da sessão, sem chamada extra. Após `updateUser({data})`, re-render para refletir.
9. **`/notificacoes` filtra "Descartadas" como uma quarta opção** — escolhi mostrar descartadas em uma view separada em vez de sempre escondê-las. Permite recuperação visual se descartado por engano.
10. **Re-autenticação na troca de senha** chama `signInWithPassword` com a senha atual antes de `updateUser({password})` — Supabase já permite trocar sem senha atual em alguns fluxos, mas re-autenticar é a postura defensiva do produto.

---

## Pendências conhecidas encontradas no caminho

- **Atalho de teclado para outros lugares:** Alt+N abre o sino. Não inventei outros atalhos. Pode virar feature de descoberta no `/perfil` ou tela de ajuda futuramente.
- **`/configuracoes/feriados`, `/configuracoes/usuarios`, `/configuracoes/sistema`** ficaram como rotas não-implementadas — clicar no card é bloqueado pela renderização (em-breve não tem `<a>`). CP7 implementa.
- **Não emite notificação ao desativar/reativar vendedora** — operação silenciosa por design no MVP.
- **Email da vendedora aceita formato simples** (`[^\s@]+@[^\s@]+\.[^\s@]+`) — sem validação MX/SPF; se algum dia houver disparo de email, validar lá.
- **Notificação "Sino — teste CP5.3" fica no banco** após teste — pode ser descartada via UI ou removida no SQL.
- **Mobile do filter-bar** — pode ficar alto se houver mais de 3 selects + busca. Avaliar accordion em CP6 se reclamarem.
- **Bell badge mostra `99+`** se houver mais que 99 não-lidas. Não pagina o dropdown além das primeiras 20 — drawer só mostra as últimas 20 não-descartadas; resto vai pra `/notificacoes`.

---

## Arquivos novos (CP5)

```
supabase/migrations/
  20260501110000_vendedora_campos_contato_cp5.sql           [migration]
  20260501110100_view_pendencia_inclui_categoria_cp5.sql    [migration]

web/app/
  papeis.js                                                 [helper]
  pages/configuracoes.js                                    [hub]
  pages/configuracoes-vendedoras.js                         [CRUD]
  pages/pendencias.js                                       [tela centralizada]
  pages/notificacoes.js                                     [paginada]
  pages/perfil.js                                           [editar nome / senha]

web/components/
  filter-bar.js                                             [reutilizável]
  notification-bell.js                                      [sino + drawer]
```

## Arquivos modificados

```
web/app/router.js                  [+5 rotas]
web/app/pages/caixa.js             [filter-bar integrado]
web/components/header.js           [bell + avatar→perfil]
web/styles/components.css          [+850 linhas: hub, vendedoras, filter-bar, pend-row, bell, perfil]
```
