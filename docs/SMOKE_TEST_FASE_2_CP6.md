# Smoke Test — Fase 2 / CP6 (Fechamento e métricas)

> **Branch:** `fase-2-cp6-fechamento-metricas`
> **Data:** 2026-05-01
> **Build:** `vite build` OK · 81 módulos · 389 kB / gz 99.5 kB JS · 104 kB / gz 18 kB CSS
> **Dev server:** `http://localhost:5173`

## Resumo

| # | Teste | Status |
|---|-------|--------|
| 1 | `fn_recalcular_caixa` popula novas colunas em /caixa 30/04 | ✅ SQL |
| 2 | Idempotência — 3 chamadas seguidas dão números idênticos | ✅ SQL |
| 3 | Tela `/caixa/:data/fechar` carrega + checklist + divergência | 🟡 visual |
| 4 | Fechar caixa de hoje funcional + banner read-only + botão novo lançamento desabilita | 🟡 visual |
| 5 | RPC bloqueia fechamento com pendências (sem forcar) com mensagem pt-BR | ✅ SQL |
| 6 | `/lancamento/:id` mostra info + timeline editorial com >= 2 eventos | ✅ SQL + 🟡 visual |
| 7 | Charts no dashboard — distribuição + movimento 30d | 🟡 visual |
| 8 | Smoke regressão (sidebar/configurações/perfil/criar lançamento) | 🟡 visual |

## Backend — checagens SQL

### T1 · `fn_recalcular_caixa` popula novas colunas

```sql
SELECT data, total_lancamentos, total_pendentes, total_resolvidas,
       total_valor, total_cancelado_pos, valor_cancelado_pos,
       total_finalizado, valor_finalizado
FROM public.caixa WHERE data='2026-04-30';
```

Resultado:
```
data       lancamentos pendentes resolvidas valor   cancelado_pos valor_cp finalizado valor_fin
2026-04-30 11          3         4          763.40  3             1379.00  1          100.00
```

✅ As 5 colunas novas (`total_resolvidas`, `total_cancelado_pos`, `valor_cancelado_pos`, `total_finalizado`, `valor_finalizado`) populadas com dados reais. **Escola 1 confirmada**: `total_valor` (763.40) **exclui** os 3 lançamentos `cancelado_pos` (R$ 1379) — eles ficam visíveis na coluna auxiliar.

### T2 · Idempotência

```sql
SELECT public.fn_recalcular_caixa((SELECT id FROM public.caixa WHERE data='2026-04-30'));
SELECT public.fn_recalcular_caixa((SELECT id FROM public.caixa WHERE data='2026-04-30'));
SELECT public.fn_recalcular_caixa((SELECT id FROM public.caixa WHERE data='2026-04-30'));
SELECT total_lancamentos, total_valor, total_cancelado_pos, valor_cancelado_pos,
       total_finalizado, valor_finalizado FROM public.caixa WHERE data='2026-04-30';
```

3 invocações sequenciais → resultado idêntico (11, 763.40, 3, 1379.00, 1, 100.00). ✅

### T5 · `fechar_caixa` bloqueia pendências

```sql
SELECT public.fechar_caixa(
  (SELECT id FROM public.caixa WHERE data='2026-04-30'),
  false, NULL
);
```
→ **ERROR 22023:** `Existem 3 pendencias no caixa. Para fechar mesmo assim, marque a opcao de forcar fechamento.` (HINT: Use p_forcar=true junto de uma justificativa.) ✅ pt-BR.

```sql
SELECT public.fechar_caixa(
  (SELECT id FROM public.caixa WHERE data='2026-04-30'),
  true, 'curto'
);
```
→ **ERROR 22023:** `Justificativa obrigatoria (>= 20 caracteres) ao forcar fechamento com pendencias.` ✅ pt-BR.

### T6 · `linha_do_tempo_lancamento` retorna eventos consolidados

```sql
SELECT * FROM public.linha_do_tempo_lancamento('fd0a0937-bfd1-4221-b5c9-6ebe1da11b4f');
```

Para NF-CP4-T1 retornou 4 eventos em ordem cronológica DESC:
1. observacao (manual) "aaaaa" · 2026-05-01 15:06
2. **finalizacao** "Lançamento marcado como finalizado." · 2026-05-01 15:00
3. observacao (manual) "Observação inicial pra testar imutabilidade." · 2026-05-01 14:59
4. **criacao** NF-CP4-T1 · R$ 100 · Cliente Teste T1 · 2026-05-01 14:59

✅ Consolidação correta — `criacao` da `lancamento.criado_em` + 3 `observacao/finalizacao` da `lancamento_observacao`. Mapeamento por `fonte`: `finalizar`→`finalizacao`, `cancelar_pos`→`cancelamento_pos`.

### `dashboard_resumo` ganha valor_finalizado_hoje + valor_cancelado_pos_hoje

```sql
SELECT total_finalizadas_hoje, valor_finalizado_hoje,
       total_canceladas_pos_hoje, valor_cancelado_pos_hoje
FROM public.dashboard_resumo();
```
Hoje (01/05) sem caixa → 4 campos retornam **0** (não NULL). ✅

## Frontend — testes visuais

> Logue em `http://localhost:5173` com `joaopedro@plexalabs.com` (admin+operador). Use o caixa **30/04/2026** (dataset de teste com 11 lançamentos cobrindo todos os estados).

### T3 · `/caixa/2026-04-30/fechar` checklist editorial

- [ ] Header com etiqueta lateral "FECHAR" verde + título "Fechar caixa de Quinta-feira, 30 de abril de 2026."
- [ ] Sumário: 5 cards horizontais respirados — Lançamentos (11), Valor líquido (R$ 763,40 destacado), Pendências (3 com link "Resolver pendências" em âmbar), Finalizados (R$ 100 verde), Cancelados pós-pagamento (R$ 1.379 em vermelho discreto)
- [ ] Aviso âmbar destacado: "3 lançamentos ainda em aberto. Se prosseguir sem resolver, será preciso justificar com pelo menos 20 caracteres."
- [ ] Checklist 4 itens numerados (01..04) com checkboxes grandes papel-3 que viram musgo+✓ ao marcar. Item 02 "Resolvi todas as pendências possíveis" com aviso âmbar em itálico abaixo
- [ ] Textarea de justificativa com label diferente ("obrigatória mín. 20 caracteres" ou "opcional"), placeholder contextual
- [ ] Rodapé sticky com backdrop blur — "Voltar sem fechar" + "Fechar caixa do dia" (botão só ativa quando todos os 4 checks marcados)
- [ ] Submit com justificativa < 20 chars → erro pt-BR claro inline

### T4 · Fechar caixa de hoje (sem pendências)

- [ ] Em /caixa/hoje (caixa aberto), botão "Fechar caixa do dia →" aparece ao lado do "+ Novo lançamento"
- [ ] Click leva pra `/caixa/HOJE/fechar`. Sumário sem aviso âmbar. Justificativa = opcional
- [ ] Marcar 4 checks + clicar "Fechar caixa do dia" → toast "Caixa de DD/MM fechado com sucesso." → redireciona para `/caixa/HOJE`
- [ ] /caixa/HOJE agora exibe banner musgo "🔒 Este caixa está fechado. Apenas leitura — não aceita novos lançamentos."
- [ ] Botão "+ Novo lançamento" desabilitado, botão "Fechar caixa do dia" some

### T6 · Histórico individual `/lancamento/fd0a0937-bfd1-4221-b5c9-6ebe1da11b4f`

- [ ] Header com etiqueta lateral colorida (musgo se finalizado), eyebrow "Nota fiscal · finalizada", "NF NF-CP4-T1" em Fraunces italic gigante, cliente "Cliente Teste T1" Manrope 500
- [ ] À direita: valor R$ 100,00 grande Fraunces tabular-nums + pílula de categoria "Pix"
- [ ] 4 cards de info: Cliente / Código do pedido / Categoria (Pix · detalhe) / Caixa de origem (link clicável)
- [ ] Timeline com 4 eventos cronologicamente reversos:
  - **OBSERVAÇÃO** (manual) "aaaaa" — `joaonora.nb` — agora há pouco
  - **FINALIZAÇÃO** (verde) "Lançamento marcado como finalizado." — `joaopedro` — 1h atrás
  - **OBSERVAÇÃO** (manual) "Observação inicial pra testar imutabilidade." — `joaopedro`
  - **CRIAÇÃO** (âmbar) "NF NF-CP4-T1 registrada com valor R$ 100,00 para Cliente Teste T1 · pedido PED-T1" — `joaopedro` — 1h atrás
- [ ] Linha vertical musgo translúcida conectando os bolinhas no eixo esquerdo
- [ ] Cada item com filete colorido por tipo (verde=finalizacao, âmbar=criacao, papel=observacao)
- [ ] Rodapé com botão "Adicionar observação" (porque estado=finalizado) que abre o drawer existente

### T7 · Charts no dashboard

- [ ] Bloco "Distribuição · Por categoria" com rótulo do mês ("abril de 2026 (fallback)" porque maio sem dados)
- [ ] Lista de barras horizontais ordenadas por valor desc, cada uma com:
  - Rótulo da categoria à esquerda (Cartão / Pix / Dinheiro / Cartão Link / Obs)
  - Trilha papel-2 com barra animada que cresce com `cubic-bezier(0.32,0.72,0,1)` 700ms até o pct alvo
  - Cor da barra = `--cat-X-border` canônica
  - Pct + valor em Manrope tabular-nums à direita
- [ ] Bloco "Movimento · Últimos 30 dias" com resumo de R$ + quantidade no header
- [ ] 30 colunas verticais alinhadas pelo bottom, cada uma com altura proporcional ao max do período
- [ ] Cor: musgo nos dias úteis, musgo translúcido nos finais de semana, papel-3 nos dias sem caixa, âmbar com sombra no dia de hoje
- [ ] Rótulo da semana abaixo de cada coluna (D/S/T/Q/Q/S/S)
- [ ] Linha base 1px musgo translúcido + eixo X com 3 marcadores (início / meio / fim do período)
- [ ] Hover na coluna = title nativo com data por extenso, valor, contagem, estado
- [ ] Click na coluna = navegação para `/caixa/:data` (ou cria caixa se não existir, via fluxo padrão)

### T8 · Smoke regressão

- [ ] Sidebar continua expandindo/colapsando + IndexedDB persiste
- [ ] /configuracoes/vendedoras edita vendedora sem erro de trigger
- [ ] /perfil mostra dados, troca de senha funciona
- [ ] Criar lançamento + categorizar + observação + finalizar
- [ ] /pendencias aparece atualizada via realtime
- [ ] Console DevTools sem erros novos

## Decisões de UX

1. **Checklist com `:has()` selector** — o item ativa visualmente (border musgo, background `rgba(15,76,58,0.05)`) quando `:has(.fechar-item-check:checked)`. Sem JS extra, CSS-only.
2. **Numeração da checklist** em Fraunces italic 1.3rem que vira musgo quando marcado — reforça o sentido editorial de "capítulos de auditoria".
3. **Aviso âmbar SOMENTE se há pendências** — quando 0 pendências, o item da checklist 02 aparece sem aviso (UX limpa).
4. **Cliente-side guarda** o submit antes de chamar a RPC (evita ida-volta gratuita) mas a mensagem real de erro vem da função (única fonte da verdade).
5. **Banner read-only sutil** — papel-2 musgo translúcido com 🔒 e título Fraunces italic. Não atrapalha leitura, mas é evidente.
6. **Botão "Fechar caixa do dia"** só aparece quando `estado=aberto` E `data === hoje`. Caixas anteriores em `aberto` (esquecimento) ainda podem ser fechados via URL direta `/caixa/:data/fechar` — admin force.
7. **Timeline ordem DESC** (mais recente em cima) — convenção do operador. Se preferirem ASC, é trocar ORDER BY na RPC.
8. **Bolinha do timeline com ring papel** — `box-shadow: 0 0 0 3px var(--c-papel)` cria espaço visual entre bolinha e linha conectora vertical.
9. **Charts: animação trigger via `requestAnimationFrame`** — `is-animado` aplicada após o frame de mount. Isso faz o `transition: width 700ms` partir de 0 e animar até `--alvo`. Sem JS de easing manual.
10. **Mobile dos charts**: dist mantém grid 5/1/auto (rótulo um pouco mais curto). Movimento ganha scroll horizontal com `min-width: 14px` por coluna — leitura preservada.
11. **Movimento — coluna de hoje em âmbar com sombra** sublinha o "hoje vs passado". Final de semana fica translúcido (50% musgo) — distingue dia útil de fim de semana sem ruído.
12. **Distribuição mês — fallback automático para mês anterior** se mês atual vazio. Permite que o operador veja o chart desde o primeiro acesso, sem ter que fazer 30 lançamentos antes.
13. **`linha_do_tempo_lancamento` reusa observações como timeline** — os desfechos finalizar/cancelar_pos já viram observações automáticas no CP4 (com `fonte='finalizar'` etc). A RPC só re-classifica essas em tipos próprios. Sem duplicação de fontes.

## Pendências conhecidas

- **Card "caixa anterior não fechado" no dashboard** — descrito no spec mas não implementado nesta rodada. Pode entrar no CP7 (Admin) junto do botão de fechamento retroativo.
- **Acesso a `/lancamento/:id` é via URL direta** ou via reload do drawer — não há link "Ver histórico" no drawer ou nas listas. Considerei adicionar mas o drawer já abre o detalhe completo; o histórico individual é página standalone para casos de auditoria. Adicionar link rápido pode entrar no polimento futuro.
- **Distribuição mensal sem seletor de mês** — só mostra mês corrente (com fallback ao anterior). Seletor de mês fica para CP7 (Relatórios).
- **Movimento 30d com hover** usa `title` nativo do navegador (tooltip do OS). Tooltip custom estilizado pode entrar no polimento — funcional como está.
- **Caixas de teste**: usar `2026-04-30` (caixa aberto, 11 lançamentos, dataset completo). Para testar fechamento sem pendências, criar caixa de hoje com `criar_caixa_se_nao_existe` ou abrir manualmente em `/caixa/hoje`.

## Lançamentos / caixas de teste úteis

| Dado | Onde |
|------|------|
| Caixa com dataset completo | `/caixa/2026-04-30` (11 NFs cobrindo todos estados) |
| NF com timeline rica | `/lancamento/fd0a0937-bfd1-4221-b5c9-6ebe1da11b4f` (NF-CP4-T1, 4 eventos) |
| NF sem observação | `/lancamento/<id>` da NF-CP3-002 (só evento de criação) |
| Caixa fechado pra ver banner | criar via `/caixa/hoje/fechar` no fluxo |

## Arquivos novos

```
supabase/migrations/
  20260501130000_caixa_colunas_auditoria_cp6.sql
  20260501130100_fn_recalcular_caixa_escola_1_cp6.sql
  20260501130200_dashboard_resumo_cp6_novos_valores.sql
  20260501130300_fechar_caixa_observacao_fechamento_cp6.sql
  20260501130400_linha_do_tempo_lancamento_cp6.sql
  20260501130500_rpcs_charts_cp6.sql

web/app/pages/
  caixa-fechar.js
  lancamento.js
```

## Arquivos modificados

```
web/app/router.js                  # +2 rotas (/caixa/:data/fechar, /lancamento/:id)
web/app/pages/caixa.js             # banner fechado + botão fechar caixa do dia
web/app/pages/dashboard.js         # 2 charts CSS + carregar* funções
web/styles/components.css          # +800 linhas: fechar-tela, lanc-tela, timeline, charts, banner
```

## Lista de commits

```
423f508 [F2-CP6] dashboard charts CSS: barras horizontais por categoria + barrinhas verticais 30d + RPCs serie_diaria_caixa e distribuicao_categoria_mes
c9a3554 [F2-CP6] tela /lancamento/:id com timeline editorial + RPC linha_do_tempo_lancamento
6bbbc6f [F2-CP6] tela /caixa/:data/fechar com checklist editorial + RPC fechar_caixa atualizada
65d2939 [F2-CP6] dashboard_resumo: novos valores (finalizado_hoje, cancelado_pos_hoje)
766343d [F2-CP6] fn_recalcular_caixa: escola 1 + colunas auxiliares + backfill
5404cab [F2-CP6] migration: caixa novas colunas (cancelado_pos, finalizado, observacao_fechamento)
```
