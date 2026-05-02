# Smoke test — Fase 2 · CP7 (Admin e relatórios)

> 10 testes manuais que validam a integração end-to-end: RPCs no banco,
> telas no frontend, exports CSV/PDF.
>
> **Pré-requisito:** logado como admin (`joaopedro@plexalabs.com`).
> Para os testes 3, 6: pode rodar via SQL direto no MCP (mais rápido).

## Cenário base

- 2 usuários cadastrados: joaopedro (admin+operador) e joaonora (operador)
- 15 feriados em 2026 (popados na Fase 1)
- 7 chaves em `config` (caixa.*, notificacao.*, pendencia.*, sync.*)
- ~30+ lançamentos espalhados em abril/2026

## CP7.1 — Usuários e papéis

### Teste 1: listar usuários
**Cómo:** abrir `/configuracoes/usuarios` como admin.
**Espera:** 2 cards renderizados; joaopedro com pílulas Admin (musgo) + Operador (âmbar) e badge "você"; joaonora com Operador apenas; ambos com email confirmado (✓) e último acesso preenchido em formato relativo ("há 2 dias", etc.).
**RPC equivalente:**
```sql
SELECT * FROM public.listar_usuarios_papeis();
```

### Teste 2: alterar papéis
**Cómo:** clicar "Alterar papéis" no card de joaonora; marcar "Admin" no drawer.
**Espera:**
- Aparece bloco vermelho "Promovendo a administrador" listando os 4 superpoderes
- Botão "Confirmar" fica desabilitado
- Digitar `promover` no input habilita o botão
- Clicar "Confirmar" → toast verde + lista atualiza com nova pílula admin em joaonora
- Reverter (desmarcar Admin) → bloco musgo "Confirma remover privilégios" + Confirmar funciona

### Teste 3: auto-proteção
**Cómo:** abrir o card próprio (joaopedro), tentar desmarcar "Admin".
**Espera:** Checkbox Admin já vem **desabilitado e marcado**, com tooltip "Você não pode remover seu próprio papel...". Se forçar via RPC direto, retorna erro pt-BR claro.

**Forçar via SQL:**
```sql
SELECT set_config('request.jwt.claim.sub', '<seu-uid>', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.definir_papeis_usuario('<seu-uid>'::uuid, ARRAY['operador']);
-- Espera: ERROR  Você não pode remover seu próprio papel de administrador. Peça para outro admin fazer isso.
```

## CP7.2 — Feriados

### Teste 4: lista 2026
**Cómo:** abrir `/configuracoes/feriados`. Select "Ano" mostra 2026, 2027 e qualquer outro ano com feriados cadastrados.
**Espera:** 15 cards cronológicos. Cada card mostra dia da semana em maiúsculas, dia + mês em italic Fraunces, pílula colorida do tipo (Nacional musgo, Estadual âmbar, Empresa neutra).
**Adicionar feriado:** clicar "+ Adicionar feriado", preencher data 2027-01-01, nome "Confraternização 2027", tipo "Nacional", salvar. Toast OK + lista atualiza (auto-pula para 2027 se a data caiu em outro ano).

### Teste 5: remover (soft-delete)
**Cómo:** clicar "Remover" em qualquer feriado. Modal de confirmação. Clicar "Sim, remover".
**Espera:** Feriado some da lista. Banco preserva linha com `ativo=false`:
```sql
SELECT data, descricao, ativo FROM public.feriado WHERE data = '<data-removida>';
-- Espera: 1 linha com ativo=false
```

## CP7.3 — Sistema

### Teste 6: validação de tipo
**Cómo:** em `/configuracoes/sistema`, clicar "Editar" em `pendencia.dias_alerta_atraso` (number). Digitar "abc". Borda fica vermelha + mensagem "Valor numérico inválido". Botão Salvar desabilitado.
**RPC força via SQL (confirma defesa em profundidade):**
```sql
SELECT public.atualizar_config('pendencia.dias_alerta_atraso', '"abc"'::jsonb);
-- Espera: ERROR Valor da chave pendencia.dias_alerta_atraso deve ser numérico.
```

### Teste 7: edição com sucesso
**Cómo:** mudar `pendencia.dias_alerta_atraso` de 3 para 5. Salvar.
**Espera:**
- Toast verde "Configuração atualizada"
- Card mostra novo valor 5 destacado em musgo
- Linha "Atualizado agora há pouco · por joaopedro@plexalabs.com" aparece embaixo
- Reverter para 3 (preserva default original)

## CP7.4 — Relatórios

### Teste 8: preview com filtros
**Cómo:** `/relatorios`. Quick "Mês passado" → datas 2026-04-01 a 2026-04-30. Marcar pílula "Pix". Aplicar filtros.
**Espera:** Tabela com apenas lançamentos pix de abril. Resumo mostra: Lançamentos > 0, Valor bruto, Líquido, Finalizado, Cancelado. URL atualiza para `/relatorios?ini=2026-04-01&fim=2026-04-30&cat=pix` (bookmarkable).

### Teste 9: CSV
**Cómo:** clicar "Baixar CSV (Excel)".
**Espera:**
- Download `caixa-boti_2026-04-01_a_2026-04-30.csv`
- Abrir no Excel: acentos preservados (São José Ltda renderiza certo, BOM funcionou)
- Valores monetários como "128,50" aparecem aspeados na fonte → Excel parseia em uma única coluna

**Inspeção via SQL:**
```sql
SELECT encode(left(public.exportar_relatorio_csv('2026-04-01','2026-04-30',ARRAY['pix']::categoria_lancamento[],NULL),3)::bytea,'hex');
-- Espera: 'efbbbf' (BOM UTF-8)
```

### Teste 10: PDF
**Cómo:** clicar "Baixar PDF".
**Espera:**
- Spinner aparece (libs jspdf/autotable são lazy-loaded ~250KB primeira vez)
- Download `caixa-boti_2026-04-01_a_2026-04-30.pdf`
- Abrir PDF: cabeçalho "CAIXA BOTI" musgo + linha; título "Relatório do período" italic; "De → Até"; filtros aplicados listados; nome do admin no canto superior direito; tabela completa com cabeçalho papel-claro + linhas alternadas; Sumário com totais no fim; "Página X de Y" no rodapé.

## Pendências conhecidas após CP7

1. **Trigger audit em `config` foi removido** (estava pré-quebrado por assumir NEW.id em PK varchar). Auditoria visível agora vem dos campos próprios `atualizado_em` + `atualizado_por`. Se em futuro for necessário log de mutação completo (com dados_antes/depois), refatorar `fn_auditar_mutacao` para tabelas keyed-por-text.

2. **Papéis `supervisor`/`auditor`** continuam permitidos pelo CHECK do banco mas a UI/RPC só aceitam `admin`/`operador`. Linhas pré-existentes desses papéis seguem ativas mas não aparecem na tela.

3. **PDF em mobile** pode demorar 5-10s em datasets grandes (>1000 linhas). Spinner cobre isso. Não foi otimizado para celulares — exportação contábil é fluxo desktop.

4. **Cache de `papeis.js`** invalida em login/logout/user_updated mas não em mudança de papel via outro admin enquanto sessão ativa. F5 corrige. Aceitável pra MVP.
