# PROMPT 02 — PLANILHA EXCEL: ESPECIFICAÇÃO COMPLETA

> **Pré-requisito:** Ler antes o arquivo `01_VISAO_GERAL_E_REGRAS_DE_NEGOCIO.md`.
>
> Este arquivo descreve a planilha mestre `Controle_Caixa_2026.xlsm` em nível de **célula, fórmula, validação, formatação condicional, macro VBA e proteção**, em detalhe suficiente para que um agente reproduza a planilha sem ambiguidade.
>
> Há também a **versão equivalente em Google Sheets** (Apps Script) descrita ao fim, para uso quando o desktop não estiver disponível.

---

## SUMÁRIO

1. Decisões de design
2. Configurações globais do arquivo
3. Lista de planilhas (abas) e seu papel
4. Aba `_CONFIG` — parâmetros do sistema
5. Aba `_VENDEDORAS` — lista controlada
6. Aba `_FERIADOS` — calendário
7. Aba `MODELO` — template canônico (cell-by-cell)
8. Abas `Caixa DD-MM` — cópias do modelo
9. Aba `DASHBOARD` — visão consolidada
10. Aba `_PENDENCIAS` — visão centralizada
11. Aba `_AUDIT` — log local
12. Aba `_CACHE_CLIENTES` — cache de pedidos
13. Sistema de cores e formatação condicional
14. Validações de dados (data validation)
15. Named ranges (intervalos nomeados)
16. Macros VBA — código completo
17. Apps Script — equivalente para Google Sheets
18. Proteção de planilha
19. Layout de impressão
20. Assets visuais (marca d'água)
21. Apêndice E — Tabela de fórmulas por célula
22. Apêndice F — Códigos RGB exatos
23. Apêndice G — Roteiro de teste manual

---

## 1. DECISÕES DE DESIGN

### 1.1. Por que `.xlsm` e não `.xlsx`?

`.xlsm` permite macros VBA. Macros são essenciais para:
- Criar novas abas a partir do MODELO automaticamente.
- Aplicar regras de visibilidade dinâmica de campos por categoria.
- Disparar sincronização com Supabase.
- Interceptar exclusão acidental de linhas.

### 1.2. Encoding e regional

- Codificação: UTF-8.
- Locale: pt-BR.
- Separador decimal: vírgula.
- Separador de milhares: ponto.
- Formato de data: `dd/mm/aaaa`.
- Formato de hora: `hh:mm:ss`.

### 1.3. Convenções

- Abas auxiliares começam com `_` (underscore) — sinaliza "não tocar".
- Nomes de células em `MAIÚSCULA_COM_UNDERSCORE` para named ranges.
- Cabeçalhos: linha 1 (estilo header), dados a partir da linha 2.
- Linha total: linha 1.000 fixa (suficiente para 1.000 lançamentos por dia, muito acima do volume real).

### 1.4. Tabelas formais (ListObjects)

Cada aba `Caixa DD-MM` contém uma **Tabela formal** chamada `tbl_DDmm` (ex: `tbl_0428`). Tabelas formais oferecem:
- Auto-extensão ao adicionar linha.
- Referências estruturadas (`tbl_0428[Numero NF]`).
- Filtros nativos no cabeçalho.

---

## 2. CONFIGURAÇÕES GLOBAIS DO ARQUIVO

### 2.1. Propriedades do documento

- **Título:** Controle de Caixa 2026
- **Autor:** Operador (preenchido na criação)
- **Comentários:** Sistema de auditoria de caixa — referência: documento 01.
- **Idioma:** Português (Brasil).

### 2.2. Configurações de cálculo

- Cálculo: **Automático**.
- Iteração: **Desativada** (sem fórmulas circulares).
- Precisão: padrão.

### 2.3. Configurações de exibição

- **Linhas de grade:** ativadas em todas exceto MODELO e DASHBOARD.
- **Cabeçalhos de linha/coluna:** ativados.
- **Barra de fórmulas:** sempre visível.
- **Zoom inicial:** 100%.

### 2.4. Macros e segurança

- Macros: **habilitadas no abrir** (ThisWorkbook handler).
- Assinatura digital: opcional, recomendada se a empresa usa Active Directory com certificados.
- Senha de proteção das abas auxiliares: definida em variável de ambiente (não hardcoded).

---

## 3. LISTA DE PLANILHAS (ABAS) E SEU PAPEL

| Ordem | Nome | Visibilidade | Protegida? | Função |
|------:|------|--------------|:----------:|--------|
| 1 | `DASHBOARD` | visível | sim (estrutura) | Visão consolidada e indicadores |
| 2 | `_PENDENCIAS` | visível | sim (estrutura) | Pendências de todos os caixas |
| 3 | `MODELO` | visível, **destacada** | **sim (total)** | Template canônico |
| 4..N | `Caixa DD-MM` | visível | parcial | Caixa diário (cresce com o tempo) |
| N+1 | `_CONFIG` | oculta | sim | Parâmetros |
| N+2 | `_VENDEDORAS` | oculta | sim | Lista controlada |
| N+3 | `_FERIADOS` | oculta | sim | Calendário |
| N+4 | `_AUDIT` | oculta | sim | Log local |
| N+5 | `_CACHE_CLIENTES` | oculta | sim | Cache para autocomplete |

> **Ordem de leitura para o usuário:** DASHBOARD primeiro, depois pendências, depois caixas. MODELO fica visível mas com cor de aba diferente (cinza-escuro) para sinalizar "não preencher".

---

## 4. ABA `_CONFIG`

### 4.1. Estrutura (chave-valor)

| Coluna | Tipo | Conteúdo |
|--------|------|----------|
| A — `Chave` | texto | identificador único |
| B — `Valor` | variant | valor configurável |
| C — `Tipo` | texto | `string`, `number`, `boolean`, `date`, `time` |
| D — `Descricao` | texto | descrição amigável |
| E — `Editavel` | boolean | se o usuário pode editar via UI |

### 4.2. Linhas iniciais (seed)

| Linha | Chave | Valor | Tipo | Descrição |
|------:|-------|-------|------|-----------|
| 2 | `versao_planilha` | `1.0.0` | string | Versão do schema |
| 3 | `ano_corrente` | `2026` | number | Ano vigente |
| 4 | `notif_intervalo_horas` | `4` | number | Frequência de notificações |
| 5 | `notif_horario_inicio` | `08:00` | time | Início janela |
| 6 | `notif_horario_fim` | `18:00` | time | Fim janela |
| 7 | `pendencia_dias_atraso` | `3` | number | Dias para virar urgente |
| 8 | `gerar_sabado` | `TRUE` | boolean | Gerar caixa sábado |
| 9 | `gerar_domingo` | `FALSE` | boolean | Gerar caixa domingo |
| 10 | `supabase_url` | (env) | string | URL do projeto |
| 11 | `supabase_anon_key` | (env) | string | Chave anônima |
| 12 | `sync_intervalo_min` | `5` | number | Sync minutos |
| 13 | `senha_protecao_modelo` | (env) | string | Senha das abas auxiliares |
| 14 | `responsavel_padrao` | `Operador` | string | Nome do auditor |

### 4.3. Acesso via VBA

Função utilitária:
```vba
Function GetConfig(chave As String) As Variant
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("_CONFIG")
    Dim r As Range
    Set r = ws.Range("A:A").Find(chave, LookIn:=xlValues, LookAt:=xlWhole)
    If r Is Nothing Then
        GetConfig = Null
    Else
        GetConfig = ws.Cells(r.Row, 2).Value
    End If
End Function
```

---

## 5. ABA `_VENDEDORAS`

### 5.1. Estrutura

| Coluna | Tipo | Conteúdo |
|--------|------|----------|
| A — `ID` | string | UUID gerado |
| B — `Nome` | string | Nome completo |
| C — `Apelido` | string | Como aparece atrás da NF |
| D — `Ativa` | boolean | TRUE/FALSE |
| E — `CriadaEm` | datetime | timestamp |

### 5.2. Linhas seed (substituir pelos nomes reais antes do uso)

```
ID                                    | Nome              | Apelido | Ativa | CriadaEm
00000000-0000-0000-0000-000000000001  | Vendedora Exemplo | Exemplo | TRUE  | 28/04/2026 00:00
```

### 5.3. Validação para uso em outras abas

Named range: `LISTA_VENDEDORAS_ATIVAS` =
```
=OFFSET(_VENDEDORAS!$B$2,0,0,COUNTIF(_VENDEDORAS!$D:$D,TRUE),1)
```

Será usado nos comboboxes da coluna correspondente do MODELO.

---

## 6. ABA `_FERIADOS`

### 6.1. Estrutura

| Coluna | Tipo |
|--------|------|
| A — `Data` | date |
| B — `Descricao` | string |
| C — `Tipo` | enum: `nacional`, `estadual`, `municipal`, `empresa` |

### 6.2. Função utilitária `EhFeriado(dt)`

```vba
Function EhFeriado(dt As Date) As Boolean
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("_FERIADOS")
    Dim r As Range
    Set r = ws.Range("A:A").Find(dt, LookIn:=xlValues, LookAt:=xlWhole)
    EhFeriado = Not (r Is Nothing)
End Function
```

---

## 7. ABA `MODELO` — TEMPLATE CANÔNICO

A aba `MODELO` é a fonte da verdade visual. Ela define:
- Layout de cabeçalho.
- Linhas de exemplo desabilitadas (apenas referência visual).
- Marca d'água "MODELO — NÃO PREENCHER" em ângulo, fonte 60pt, cor `#9CA3AF` (cinza), 30% opacidade.
- Cor de fundo da aba: `#374151` (cinza-escuro distintivo).
- **Toda a aba é protegida** (não permite edição direta).

### 7.1. Cabeçalho — linha 1

| Col | Conteúdo | Largura | Estilo |
|----:|----------|--------:|--------|
| A | `#` (numeração) | 5 | header |
| B | `Hora` | 10 | header |
| C | `Numero NF` | 14 | header |
| D | `Codigo Pedido` | 16 | header |
| E | `Cliente / Revendedora` | 32 | header |
| F | `Valor (R$)` | 13 | header |
| G | `Categoria` | 14 | header (combobox) |
| H | `Estado` | 12 | header |
| I | `Detalhe 1` | 22 | header dinâmico |
| J | `Detalhe 2` | 22 | header dinâmico |
| K | `Detalhe 3` | 22 | header dinâmico |
| L | `Detalhe 4` | 22 | header dinâmico |
| M | `Detalhe 5` | 22 | header dinâmico |
| N | `Comprovante` | 14 | header |
| O | `Resolvido?` | 11 | header |
| P | `Notas` | 30 | header |
| Q | `UUID` | 0 (oculta) | header oculto |
| R | `dados_categoria_json` | 0 (oculta) | header oculto |
| S | `audit_hash` | 0 (oculta) | header oculto |

**Estilo header:**
- Fonte: Calibri 11, **negrito**.
- Fundo: `#1F2937` (cinza-escuro).
- Texto: `#F9FAFB` (quase branco).
- Borda: 1px sólido `#374151`.
- Alinhamento: centro.
- Altura da linha: 28px.
- Congelar: linha 1 e colunas A-B.

### 7.2. Linhas de exemplo (desabilitadas)

Linhas 2 a 4 são **exemplos visuais** mostrando uma linha de cada categoria principal preenchida. Têm validações desabilitadas e ficam cinza-claro `#F3F4F6`.

**Linha 2 — Exemplo Cartão (cor azul):**
```
1 | 09:30 | 12345 | PED-001 | Cliente Exemplo Cartão | 250,00 | Cartão | completo | AUTH123456 | Visa | Crédito | 2x | **** 1234 | — | NÃO | — | (uuid) | (json) | (hash)
```

**Linha 3 — Exemplo Pix (cor verde-água):**
```
2 | 10:15 | 12346 | PED-002 | Cliente Exemplo Pix | 180,50 | Pix | completo | COMP-789 | CNPJ Empresa | 28/04/2026 10:14 | João Silva | — | 📎 | NÃO | — | (uuid) | (json) | (hash)
```

**Linha 4 — Exemplo Dinheiro (cor verde):**
```
3 | 11:00 | 12347 | PED-003 | Cliente Exemplo Dinheiro | 95,00 | Dinheiro | completo | Vendedora Exemplo | 100,00 | Troco 5,00 | — | — | — | NÃO | — | (uuid) | (json) | (hash)
```

### 7.3. Linhas de trabalho — 5 a 1000

Cada linha pode receber um lançamento. Vazias por padrão.

### 7.4. Cor de fundo

Toda a aba MODELO usa fundo cinza médio `#E5E7EB` para sinalizar visualmente que é template.

### 7.5. Marca d'água

Imagem PNG (1200×800) com texto "MODELO — NÃO PREENCHER" em diagonal, gerada uma vez e inserida como **plano de fundo** via `Layout da Página → Plano de Fundo`. Alternativa via macro `Worksheet.SetBackgroundPicture`.

---

## 8. ABAS `Caixa DD-MM` — CÓPIAS DO MODELO

### 8.1. Geração

Criadas via macro `CriarCaixaDoDia(dt As Date)`:

```vba
Public Sub CriarCaixaDoDia(dt As Date)
    Dim nome As String
    nome = "Caixa " & Format(dt, "dd-mm")
    
    ' Verifica se já existe
    On Error Resume Next
    Dim wsExist As Worksheet
    Set wsExist = ThisWorkbook.Sheets(nome)
    On Error GoTo 0
    If Not wsExist Is Nothing Then
        MsgBox "Caixa de " & Format(dt, "dd/mm") & " já existe.", vbInformation
        Exit Sub
    End If
    
    ' Verifica se é dia útil
    If Weekday(dt, vbMonday) = 7 And GetConfig("gerar_domingo") = False Then
        Exit Sub
    End If
    If EhFeriado(dt) Then Exit Sub
    
    ' Copia MODELO
    Sheets("MODELO").Copy After:=Sheets(Sheets.Count)
    Dim ws As Worksheet
    Set ws = ActiveSheet
    ws.Name = nome
    
    ' Aplica config específica do caixa
    With ws
        .Tab.Color = RGB(255, 255, 255) ' Branco para destacar do MODELO cinza
        .Cells.Interior.Color = xlNone ' Remove fundo cinza do modelo
        .Range("A2:S4").ClearContents ' Remove exemplos
        .Range("A2:S4").Interior.Color = xlNone
        .Visible = xlSheetVisible
        .Protect Password:=GetConfig("senha_protecao_modelo"), _
                 AllowFormattingCells:=True, _
                 AllowSorting:=True, _
                 AllowFiltering:=True, _
                 AllowUsingPivotTables:=True, _
                 UserInterfaceOnly:=True
    End With
    
    ' Aplica formatação condicional (chamada à sub auxiliar)
    Call AplicarFormatacaoCondicional(ws)
    
    ' Aplica validações
    Call AplicarValidacoes(ws)
    
    ' Cria tabela formal
    Dim tblName As String
    tblName = "tbl_" & Format(dt, "ddmm")
    ws.ListObjects.Add(xlSrcRange, ws.Range("A1:S1000"), , xlYes).Name = tblName
    
    ' Audit
    Call GravarAudit("CRIAR_CAIXA", nome, "", "")
    
    ' Sincroniza com Supabase
    Call SyncCaixaComSupabase(dt, ws)
    
    ' Reordena abas (caixas em ordem cronológica)
    Call ReordenarAbas
End Sub
```

### 8.2. Cor da aba

Cada caixa recebe uma cor de aba que reflete seu **estado**:
- `aberto` → branco (sem cor).
- `em_conferencia` → âmbar `#F59E0B`.
- `fechado` → verde `#10B981`.
- `arquivado` → cinza `#6B7280`.

### 8.3. Tabela formal (ListObject)

Cada caixa tem `tbl_DDMM` cobrindo `A1:S1000`. Vantagens:
- Filtros automáticos no header.
- Auto-extensão ao colar dados.
- Referências estruturadas em fórmulas.

---

## 9. ABA `DASHBOARD`

### 9.1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ DASHBOARD — CONTROLE DE CAIXA                  [data atual] │
├─────────────────────────────────────────────────────────────┤
│ [Período: ▼ Este mês]  [Atualizar] [Exportar Excel]         │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ Total NFs    │ Pendências   │ Cancelados   │ Valor Líquido   │
│   2.345      │     12       │     34       │  R$ 482.150,00  │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│ Distribuição por Categoria (gráfico de pizza)               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Série Diária (gráfico de barras empilhadas)                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Top 5 Vendedoras (Dinheiro)                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Pendências mais antigas (top 10)                            │
└─────────────────────────────────────────────────────────────┘
```

### 9.2. Células-chave

| Célula | Conteúdo | Fórmula |
|--------|----------|---------|
| `B1` | Título | `="DASHBOARD — CONTROLE DE CAIXA — "&TEXTO(HOJE();"dd/mm/aaaa")` |
| `B3` | Filtro de período | dropdown: Hoje, Esta semana, Este mês, Este ciclo, Custom |
| `D5` | Total NFs | =SOMA das linhas com `categoria <> "Cancelado"` em todos os caixas |
| `D6` | Pendências | =CONT.SE de `estado = "pendente"` |
| `D7` | Cancelados | =CONT.SE de `categoria = "Cancelado"` |
| `D8` | Valor Líquido | =SOMASE de `valor` onde `categoria <> "Cancelado"` |

### 9.3. Gráfico — Distribuição por Categoria

- Tipo: Donut (rosca).
- Série: contagem de lançamentos por categoria.
- Cores: paleta canônica (seção 13).
- Legenda: à direita.

### 9.4. Gráfico — Série Diária

- Tipo: barras empilhadas verticais.
- Eixo X: últimos 30 dias úteis.
- Eixo Y: valor (R$).
- Empilhamento: 6 segmentos = 6 categorias.
- Cores: paleta canônica.

### 9.5. Tabela — Top 5 Vendedoras

Pivot table baseada em todas as linhas com `categoria = "Dinheiro"`, agrupando por `vendedora_recebedora`, somando `valor`.

### 9.6. Tabela — Pendências mais antigas

Query: `_PENDENCIAS` ordenado por `idade_dias` desc, top 10.

### 9.7. Atualização

Botão "Atualizar" dispara macro `AtualizarDashboard` que:
1. Recalcula via `Application.CalculateFull`.
2. Atualiza pivot tables.
3. Atualiza gráficos.
4. Aplica timestamp em `B2`.

---

## 10. ABA `_PENDENCIAS`

### 10.1. Estrutura

Lista consolidada de **todas** as pendências em aberto, alimentada por fórmula que varre todos os caixas.

| Col | Conteúdo |
|----:|----------|
| A | Data caixa origem |
| B | Numero NF |
| C | Codigo Pedido |
| D | Cliente |
| E | Valor |
| F | Idade (dias úteis) |
| G | Status visual (●●●) |
| H | Link para caixa |

### 10.2. Fórmulas

Para popular dinamicamente, usar `LET` + `FILTRO` + `EMPILHARV` (Excel 365):

```excel
=LET(
  abas; ListaAbasCaixa();
  consolidado; REDUZIR("";abas;LAMBDA(acc;ab;
    EMPILHARV(acc;
      FILTRO(INDIRETO("'"&ab&"'!A2:S1000");
             INDIRETO("'"&ab&"'!H2:H1000")="pendente";
             ""))));
  consolidado
)
```

(Função auxiliar `ListaAbasCaixa()` implementada em VBA, retorna array de nomes de abas que começam com "Caixa ".)

### 10.3. Coluna F — Idade

```excel
=DIATRABALHOTOTAL(A2;HOJE())
```

### 10.4. Coluna G — Status visual

```excel
=SE(F2>3;"🔴 URGENTE";SE(F2>1;"🟡 Atenção";"🟢 Recente"))
```

### 10.5. Atualização automática

Gatilho: macro `AtualizarPendencias` chamada em `Workbook_Open` e a cada salvamento.

---

## 11. ABA `_AUDIT` — LOG LOCAL

### 11.1. Estrutura

| Col | Conteúdo |
|----:|----------|
| A | Timestamp |
| B | Usuario (Application.UserName) |
| C | Acao | (CRIAR, EDITAR, EXCLUIR, MUDAR_CATEGORIA, RESOLVER) |
| D | Aba | (nome da aba afetada) |
| E | Linha |
| F | Coluna |
| G | Valor anterior |
| H | Valor novo |
| I | Hash | (SHA-256 da combinação Timestamp+User+Acao+...) |

### 11.2. Sub `GravarAudit`

```vba
Public Sub GravarAudit(acao As String, aba As String, valAntes As String, valDepois As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("_AUDIT")
    Dim novaLinha As Long
    novaLinha = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row + 1
    
    ws.Cells(novaLinha, 1).Value = Now
    ws.Cells(novaLinha, 2).Value = Application.UserName
    ws.Cells(novaLinha, 3).Value = acao
    ws.Cells(novaLinha, 4).Value = aba
    ws.Cells(novaLinha, 7).Value = valAntes
    ws.Cells(novaLinha, 8).Value = valDepois
    ws.Cells(novaLinha, 9).Value = SHA256_String(CStr(ws.Cells(novaLinha, 1).Value) & _
                                    Application.UserName & acao & aba & valAntes & valDepois)
End Sub
```

### 11.3. Função SHA-256

Implementada via `System.Security.Cryptography.SHA256Managed` em VBA usando late-binding com mscorlib.

```vba
Function SHA256_String(input As String) As String
    Dim sha As Object
    Set sha = CreateObject("System.Security.Cryptography.SHA256Managed")
    Dim bytes() As Byte
    bytes = ConvertStringToByteArray(input, "utf-8")
    Dim hash() As Byte
    hash = sha.ComputeHash_2((bytes))
    SHA256_String = ConvertByteArrayToHex(hash)
End Function
```

---

## 12. ABA `_CACHE_CLIENTES`

Espelho do `cliente_cache` do Postgres, sincronizado em background.

| Col | Conteúdo |
|----:|----------|
| A | codigo_pedido |
| B | cliente_nome |
| C | valor_nf |
| D | ultima_vez_visto |

### 12.1. Uso

A coluna D do MODELO (Codigo Pedido) tem evento `Worksheet_Change` que dispara busca em `_CACHE_CLIENTES` e autopreenche E e F:

```vba
Private Sub Worksheet_Change(ByVal Target As Range)
    If Target.Column = 4 And Target.Row > 1 And Target.Cells.Count = 1 Then
        Dim codigo As String
        codigo = Target.Value
        If Len(codigo) = 0 Then Exit Sub
        Dim cache As Worksheet
        Set cache = ThisWorkbook.Sheets("_CACHE_CLIENTES")
        Dim r As Range
        Set r = cache.Range("A:A").Find(codigo, LookAt:=xlWhole)
        If Not r Is Nothing Then
            Application.EnableEvents = False
            Me.Cells(Target.Row, 5).Value = cache.Cells(r.Row, 2).Value
            Me.Cells(Target.Row, 6).Value = cache.Cells(r.Row, 3).Value
            Application.EnableEvents = True
        End If
    End If
End Sub
```

---

## 13. SISTEMA DE CORES E FORMATAÇÃO CONDICIONAL

### 13.1. Mapa de cores RGB

(Ver Apêndice F para detalhes; resumo abaixo.)

| Categoria | Background | Borda | Texto |
|-----------|-----------|-------|-------|
| `Cartão` | RGB(219, 234, 254) | RGB(30, 64, 175) | RGB(30, 58, 138) |
| `Pix` | RGB(204, 251, 241) | RGB(15, 118, 110) | RGB(19, 78, 74) |
| `Dinheiro` | RGB(220, 252, 231) | RGB(22, 101, 52) | RGB(20, 83, 45) |
| `Cancelado` | RGB(254, 202, 202) | RGB(153, 27, 27) | RGB(127, 29, 29) |
| `Cartão Link` | RGB(237, 233, 254) | RGB(91, 33, 182) | RGB(76, 29, 149) |
| `Obs` | RGB(254, 243, 199) | RGB(146, 64, 14) | RGB(120, 53, 15) |

### 13.2. Regras de formatação condicional

Aplicadas em range `A2:S1000` de cada aba `Caixa DD-MM`:

#### Regra 1 — Categoria Cartão (linha azul)
- Tipo: fórmula
- Fórmula: `=$G2="Cartão"`
- Formato: fundo `#DBEAFE`, texto `#1E3A8A`, borda esquerda 2px `#1E40AF`.

#### Regra 2 — Categoria Pix (verde-água)
- Fórmula: `=$G2="Pix"`
- Formato: fundo `#CCFBF1`, texto `#134E4A`, borda esquerda 2px `#0F766E`.

#### Regra 3 — Categoria Dinheiro (verde)
- Fórmula: `=$G2="Dinheiro"`
- Formato: fundo `#DCFCE7`, texto `#14532D`, borda esquerda 2px `#166534`.

#### Regra 4 — Categoria Cancelado (vermelho)
- Fórmula: `=$G2="Cancelado"`
- Formato: fundo `#FECACA`, texto `#7F1D1D`, **tachado**, borda esquerda 2px `#991B1B`.

#### Regra 5 — Categoria Cartão Link (roxo)
- Fórmula: `=$G2="Cartão Link"`
- Formato: fundo `#EDE9FE`, texto `#4C1D95`, borda esquerda 2px `#5B21B6`.

#### Regra 6 — Categoria Obs (âmbar)
- Fórmula: `=$G2="Obs"`
- Formato: fundo `#FEF3C7`, texto `#78350F`, borda esquerda 2px `#92400E`.

#### Regra 7 — Pendente (cinza neutro)
- Fórmula: `=$H2="pendente"`
- Formato: fundo `#F3F4F6`, texto `#6B7280`, borda esquerda 2px tracejada `#9CA3AF`.

#### Regra 8 — Em preenchimento (cor da categoria desbotada)
- Fórmula: `=$H2="em_preenchimento"`
- Formato: opacidade 60% sobre cor da categoria (Excel não suporta opacidade direta — usar tom mais claro fixo).

#### Regra 9 — Resolvido (sobrepõe faixa verde esquerda)
- Fórmula: `=$O2="SIM"`
- Formato: borda esquerda 4px `#10B981` (sobrescreve a borda anterior).

#### Regra 10 — Atrasado (>3 dias e ainda pendente)
- Fórmula: `=E($H2="pendente"; DIATRABALHOTOTAL($A2; HOJE())>3)`
- Formato: borda direita 4px `#EF4444`.

#### Regra 11 — Conflito de sync
- Fórmula: `=$S2="CONFLICT"`
- Formato: padrão "Hachura diagonal espessa" cor `#F59E0B`.

### 13.3. Ordem de aplicação

A ordem importa! Excel aplica de cima para baixo, parando na primeira regra `Stop if true`. Recomendação:
1. Regras 7-8 (estado pendente/preenchimento) **sem stop**.
2. Regras 1-6 (categoria) **sem stop**.
3. Regra 9 (resolvido) **sem stop** — apenas adiciona borda.
4. Regra 10 (atrasado) **sem stop** — apenas adiciona borda.
5. Regra 11 (conflito) **com stop**.

### 13.4. Aplicação via VBA

```vba
Public Sub AplicarFormatacaoCondicional(ws As Worksheet)
    Dim r As Range
    Set r = ws.Range("A2:S1000")
    r.FormatConditions.Delete
    
    ' Regra 1: Cartão
    With r.FormatConditions.Add(Type:=xlExpression, Formula1:="=$G2=""Cartão""")
        .Interior.Color = RGB(219, 234, 254)
        .Font.Color = RGB(30, 58, 138)
        .Borders(xlEdgeLeft).LineStyle = xlContinuous
        .Borders(xlEdgeLeft).Color = RGB(30, 64, 175)
        .Borders(xlEdgeLeft).Weight = xlMedium
    End With
    
    ' Regra 2: Pix
    With r.FormatConditions.Add(Type:=xlExpression, Formula1:="=$G2=""Pix""")
        .Interior.Color = RGB(204, 251, 241)
        .Font.Color = RGB(19, 78, 74)
        .Borders(xlEdgeLeft).LineStyle = xlContinuous
        .Borders(xlEdgeLeft).Color = RGB(15, 118, 110)
        .Borders(xlEdgeLeft).Weight = xlMedium
    End With
    
    ' (... e assim por diante para as demais 9 regras)
End Sub
```

---

## 14. VALIDAÇÕES DE DADOS

### 14.1. Coluna G — Categoria

Tipo: lista.
Origem: `=LISTA_CATEGORIAS` (named range com 6 valores).
Mensagem de erro: "Selecione uma categoria válida."
Estilo: Stop.

### 14.2. Coluna F — Valor

Tipo: decimal.
Min: 0,01.
Max: 999.999,99.
Mensagem: "Valor deve ser entre 0,01 e 999.999,99."

### 14.3. Coluna B — Hora

Tipo: hora.
Min: 00:00.
Max: 23:59.

### 14.4. Coluna C — Numero NF

Tipo: comprimento de texto.
Min: 1.
Max: 15.

### 14.5. Detalhes dinâmicos (colunas I-M)

Validações **trocam dinamicamente** conforme a categoria escolhida em G. Implementação via macro `Worksheet_Change`:

```vba
Private Sub Worksheet_Change(ByVal Target As Range)
    If Target.Column = 7 And Target.Row > 1 Then ' Coluna G = Categoria
        Application.EnableEvents = False
        Call AjustarDetalhes(Me, Target.Row, Target.Value)
        Application.EnableEvents = True
    End If
End Sub

Public Sub AjustarDetalhes(ws As Worksheet, linha As Long, categoria As String)
    Dim rangeDet As Range
    Set rangeDet = ws.Range(ws.Cells(linha, 9), ws.Cells(linha, 13)) ' I:M
    
    ' Limpa validações anteriores
    rangeDet.Validation.Delete
    rangeDet.ClearContents
    
    Select Case categoria
        Case "Cartão"
            ws.Cells(linha, 9).Validation.Add Type:=xlValidateTextLength, Operator:=xlBetween, Formula1:=4, Formula2:=20
            ws.Cells(linha, 10).Validation.Add Type:=xlValidateList, Formula1:="Visa,Mastercard,Elo,Hipercard,Amex,Outros"
            ws.Cells(linha, 11).Validation.Add Type:=xlValidateList, Formula1:="Crédito,Débito"
            ws.Cells(linha, 12).Validation.Add Type:=xlValidateWholeNumber, Operator:=xlBetween, Formula1:=1, Formula2:=24
            ws.Cells(linha, 13).Validation.Add Type:=xlValidateTextLength, Operator:=xlEqual, Formula1:=4
            
            ' Headers da linha (renderização visual)
            ' (não muda os headers da aba — eles são fixos; mas acrescenta tooltip via Comment)
            ws.Cells(linha, 9).AddComment "Código de autorização"
            ws.Cells(linha, 10).AddComment "Bandeira"
            ws.Cells(linha, 11).AddComment "Modalidade"
            ws.Cells(linha, 12).AddComment "Parcelas"
            ws.Cells(linha, 13).AddComment "Últimos 4 dígitos"
            
        Case "Pix"
            ws.Cells(linha, 9).AddComment "ID do comprovante"
            ws.Cells(linha, 10).AddComment "Chave recebedora"
            ws.Cells(linha, 11).AddComment "Data/hora do Pix"
            ws.Cells(linha, 12).AddComment "Nome do remetente"
            ws.Cells(linha, 13).AddComment "Valor recebido"
            
        Case "Dinheiro"
            ws.Cells(linha, 9).Validation.Add Type:=xlValidateList, Formula1:="=LISTA_VENDEDORAS_ATIVAS"
            ws.Cells(linha, 9).AddComment "Vendedora que recebeu"
            ws.Cells(linha, 10).AddComment "Valor recebido (cédulas)"
            ws.Cells(linha, 11).Formula = "=IF(K" & linha & "="""", """", K" & linha & "-F" & linha & ")"
            ws.Cells(linha, 11).AddComment "Troco (calculado)"
            
        Case "Cancelado"
            ws.Cells(linha, 9).Validation.Add Type:=xlValidateTextLength, Operator:=xlGreater, Formula1:=10
            ws.Cells(linha, 9).AddComment "Motivo (mín. 10 chars)"
            ws.Cells(linha, 10).AddComment "Cancelado por"
            ws.Cells(linha, 11).Validation.Add Type:=xlValidateDate
            ws.Cells(linha, 11).AddComment "Data do cancelamento"
            ws.Cells(linha, 12).AddComment "Número do estorno (opcional)"
            
        Case "Cartão Link"
            ws.Cells(linha, 9).Validation.Add Type:=xlValidateCustom, Formula1:="=ESQUERDA(I" & linha & ";8)=""https://"""
            ws.Cells(linha, 9).AddComment "URL do link (https://)"
            ws.Cells(linha, 10).AddComment "Código de autorização (quando pago)"
            ws.Cells(linha, 11).Validation.Add Type:=xlValidateList, Formula1:="Enviado,Pago,Expirado,Cancelado"
            ws.Cells(linha, 11).AddComment "Status do link"
            ws.Cells(linha, 12).AddComment "Data de envio"
            ws.Cells(linha, 13).AddComment "Data de pagamento"
            
        Case "Obs"
            ws.Cells(linha, 9).Validation.Add Type:=xlValidateList, Formula1:="Troca,Cortesia,Erro,Devolução,NF Perdida,Pix Conta Errada,Outro"
            ws.Cells(linha, 9).AddComment "Tipo de observação"
            ws.Cells(linha, 10).Validation.Add Type:=xlValidateTextLength, Operator:=xlGreater, Formula1:=20
            ws.Cells(linha, 10).AddComment "Descrição (mín. 20 chars)"
            ws.Cells(linha, 11).Validation.Add Type:=xlValidateList, Formula1:="SIM,NÃO"
            ws.Cells(linha, 11).AddComment "Ainda há ação pendente?"
            ws.Cells(linha, 12).AddComment "Responsável"
    End Select
    
    ' Atualiza estado
    ws.Cells(linha, 8).Value = "em_preenchimento"
    
    ' Marca timestamp
    If ws.Cells(linha, 2).Value = "" Then
        ws.Cells(linha, 2).Value = TimeValue(Now)
    End If
End Sub
```

---

## 15. NAMED RANGES

| Nome | Escopo | Refere-se a |
|------|--------|-------------|
| `LISTA_CATEGORIAS` | Pasta | `={"Cartão";"Pix";"Dinheiro";"Cancelado";"Cartão Link";"Obs"}` |
| `LISTA_VENDEDORAS_ATIVAS` | Pasta | `=OFFSET(_VENDEDORAS!$B$2;0;0;COUNTIF(_VENDEDORAS!$D:$D;TRUE);1)` |
| `LISTA_BANDEIRAS` | Pasta | `={"Visa";"Mastercard";"Elo";"Hipercard";"Amex";"Outros"}` |
| `LISTA_MODALIDADES` | Pasta | `={"Crédito";"Débito"}` |
| `LISTA_TIPOS_OBS` | Pasta | `={"Troca";"Cortesia";"Erro";"Devolução";"NF Perdida";"Pix Conta Errada";"Outro"}` |
| `LISTA_STATUS_LINK` | Pasta | `={"Enviado";"Pago";"Expirado";"Cancelado"}` |
| `CONFIG_VERSAO` | Pasta | `=_CONFIG!$B$2` |
| `CONFIG_INTERVALO_NOTIF` | Pasta | `=_CONFIG!$B$4` |
| `CONFIG_DIAS_ATRASO` | Pasta | `=_CONFIG!$B$7` |

---

## 16. MACROS VBA — CÓDIGO COMPLETO

### 16.1. Módulo `mod_Workbook` — eventos do workbook

```vba
' ThisWorkbook
Option Explicit

Private Sub Workbook_Open()
    On Error Resume Next
    Application.ScreenUpdating = False
    
    ' Inicializa caches
    Call InicializarSistema
    
    ' Garante caixa de hoje
    If EhDiaUtil(Date) Then
        Call CriarCaixaDoDia(Date)
    End If
    
    ' Atualiza pendências
    Call AtualizarPendencias
    
    ' Atualiza dashboard
    Call AtualizarDashboard
    
    ' Sync inicial
    Call SyncCompleto
    
    ' Mostra notificações
    Call MostrarNotificacoesDoDia
    
    Application.ScreenUpdating = True
    On Error GoTo 0
End Sub

Private Sub Workbook_BeforeSave(ByVal SaveAsUI As Boolean, Cancel As Boolean)
    Call AtualizarPendencias
    Call SyncCompleto
End Sub

Private Sub Workbook_BeforeClose(Cancel As Boolean)
    Call SyncCompleto
End Sub
```

### 16.2. Módulo `mod_Caixa` — gerenciamento de caixas

```vba
Option Explicit

Public Sub CriarCaixaDoDia(dt As Date)
    ' (já mostrado na seção 8.1)
End Sub

Public Sub ReordenarAbas()
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim caixas As Collection: Set caixas = New Collection
    Dim ws As Worksheet
    For Each ws In wb.Worksheets
        If Left(ws.Name, 6) = "Caixa " Then
            caixas.Add ws.Name
        End If
    Next ws
    
    ' Bubble sort por data
    Dim i As Long, j As Long, swap As String
    For i = 1 To caixas.Count - 1
        For j = i + 1 To caixas.Count
            If DataDeAba(caixas(i)) > DataDeAba(caixas(j)) Then
                swap = caixas(i)
                caixas.Remove i
                caixas.Add swap, , , j - 1
            End If
        Next j
    Next i
    
    ' Move
    Dim ultimaPos As Long: ultimaPos = wb.Worksheets("MODELO").Index
    For i = 1 To caixas.Count
        wb.Worksheets(caixas(i)).Move After:=wb.Worksheets(ultimaPos + i - 1)
    Next i
End Sub

Public Function DataDeAba(nome As String) As Date
    ' "Caixa DD-MM" → date
    Dim partes() As String
    partes = Split(Mid(nome, 7), "-")
    DataDeAba = DateSerial(GetConfig("ano_corrente"), CInt(partes(1)), CInt(partes(0)))
End Function

Public Function EhDiaUtil(dt As Date) As Boolean
    Dim wd As Integer: wd = Weekday(dt, vbMonday)
    If wd = 7 Then
        EhDiaUtil = (GetConfig("gerar_domingo") = True)
    ElseIf wd = 6 Then
        EhDiaUtil = (GetConfig("gerar_sabado") = True)
    Else
        EhDiaUtil = True
    End If
    
    If EhFeriado(dt) Then EhDiaUtil = False
End Function

Public Sub Auto_GerarCaixaDoDia()
    Application.DisplayAlerts = False
    Call CriarCaixaDoDia(Date)
    ThisWorkbook.Save
    Application.DisplayAlerts = True
End Sub
```

### 16.3. Módulo `mod_Validacao` — preenchimento dinâmico

```vba
Option Explicit

Public Sub AjustarDetalhes(ws As Worksheet, linha As Long, categoria As String)
    ' (já mostrado na seção 14.5)
End Sub

Public Function ValidarLancamento(ws As Worksheet, linha As Long) As String
    Dim erros As String: erros = ""
    
    If Trim(ws.Cells(linha, 3).Value) = "" Then erros = erros & vbCrLf & "- NF obrigatório"
    If Not IsNumeric(ws.Cells(linha, 6).Value) Or ws.Cells(linha, 6).Value <= 0 Then erros = erros & vbCrLf & "- Valor inválido"
    
    Dim cat As String: cat = ws.Cells(linha, 7).Value
    Select Case cat
        Case "Cartão"
            If Len(ws.Cells(linha, 9).Value) < 4 Then erros = erros & vbCrLf & "- Código de autorização inválido"
            If ws.Cells(linha, 10).Value = "" Then erros = erros & vbCrLf & "- Bandeira obrigatória"
            If ws.Cells(linha, 11).Value = "" Then erros = erros & vbCrLf & "- Modalidade obrigatória"
        Case "Pix"
            If ws.Cells(linha, 9).Value = "" Then erros = erros & vbCrLf & "- ID do comprovante obrigatório"
        Case "Dinheiro"
            If ws.Cells(linha, 9).Value = "" Then erros = erros & vbCrLf & "- Vendedora obrigatória"
            If Not IsNumeric(ws.Cells(linha, 10).Value) Then erros = erros & vbCrLf & "- Valor recebido inválido"
            If IsNumeric(ws.Cells(linha, 10).Value) And ws.Cells(linha, 10).Value < ws.Cells(linha, 6).Value Then erros = erros & vbCrLf & "- Valor recebido menor que NF"
        Case "Cancelado"
            If Len(ws.Cells(linha, 9).Value) < 10 Then erros = erros & vbCrLf & "- Motivo deve ter ao menos 10 caracteres"
            If ws.Cells(linha, 10).Value = "" Then erros = erros & vbCrLf & "- Cancelado por obrigatório"
            If Not IsDate(ws.Cells(linha, 11).Value) Then erros = erros & vbCrLf & "- Data inválida"
        Case "Cartão Link"
            If Left(ws.Cells(linha, 9).Value, 8) <> "https://" Then erros = erros & vbCrLf & "- Link deve começar com https://"
            If ws.Cells(linha, 11).Value = "Pago" And ws.Cells(linha, 10).Value = "" Then erros = erros & vbCrLf & "- Código de autorização obrigatório quando Pago"
        Case "Obs"
            If ws.Cells(linha, 9).Value = "" Then erros = erros & vbCrLf & "- Tipo de Obs obrigatório"
            If Len(ws.Cells(linha, 10).Value) < 20 Then erros = erros & vbCrLf & "- Descrição mínima 20 chars"
        Case Else
            erros = erros & vbCrLf & "- Categoria inválida"
    End Select
    
    ValidarLancamento = erros
End Function

Public Sub MarcarCompleto(ws As Worksheet, linha As Long)
    Dim erros As String: erros = ValidarLancamento(ws, linha)
    If erros = "" Then
        ws.Cells(linha, 8).Value = "completo"
    Else
        ws.Cells(linha, 8).Value = "em_preenchimento"
    End If
End Sub
```

### 16.4. Módulo `mod_Pendencias` — gerenciamento

```vba
Option Explicit

Public Sub AtualizarPendencias()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("_PENDENCIAS")
    ws.Range("A2:H10000").ClearContents
    
    Dim novaLinha As Long: novaLinha = 2
    Dim aba As Worksheet
    For Each aba In ThisWorkbook.Worksheets
        If Left(aba.Name, 6) = "Caixa " Then
            Dim r As Long
            For r = 2 To 1000
                If aba.Cells(r, 8).Value = "pendente" Or aba.Cells(r, 8).Value = "em_preenchimento" Then
                    ws.Cells(novaLinha, 1).Value = DataDeAba(aba.Name)
                    ws.Cells(novaLinha, 2).Value = aba.Cells(r, 3).Value ' NF
                    ws.Cells(novaLinha, 3).Value = aba.Cells(r, 4).Value ' Pedido
                    ws.Cells(novaLinha, 4).Value = aba.Cells(r, 5).Value ' Cliente
                    ws.Cells(novaLinha, 5).Value = aba.Cells(r, 6).Value ' Valor
                    ws.Cells(novaLinha, 6).Formula = "=NETWORKDAYS(A" & novaLinha & ",TODAY())"
                    ws.Cells(novaLinha, 7).Formula = "=IF(F" & novaLinha & ">3,""🔴 URGENTE"",IF(F" & novaLinha & ">1,""🟡 Atenção"",""🟢 Recente""))"
                    ws.Cells(novaLinha, 8).Hyperlinks.Add Anchor:=ws.Cells(novaLinha, 8), Address:="", SubAddress:="'" & aba.Name & "'!A" & r, TextToDisplay:="→ Abrir"
                    novaLinha = novaLinha + 1
                End If
            Next r
        End If
    Next aba
    
    ' Ordena por idade desc
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("F2:F" & (novaLinha - 1)), Order:=xlDescending
        .SetRange ws.Range("A1:H" & (novaLinha - 1))
        .Header = xlYes
        .Apply
    End With
End Sub

Public Sub ResolverPendencia(aba As String, linha As Long, categoria As String, dadosCat As Object)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(aba)
    
    Dim valAntes As String
    valAntes = "categoria=" & ws.Cells(linha, 7).Value & "; estado=" & ws.Cells(linha, 8).Value
    
    ws.Cells(linha, 7).Value = categoria
    ws.Cells(linha, 8).Value = "resolvido"
    ws.Cells(linha, 15).Value = "SIM" ' coluna O = Resolvido?
    
    Call AjustarDetalhes(ws, linha, categoria)
    ' (preenchimento dos detalhes via dadosCat omitido por brevidade)
    
    Call GravarAudit("RESOLVER_PENDENCIA", aba, valAntes, "categoria=" & categoria & "; estado=resolvido")
    
    Call AtualizarPendencias
    Call AtualizarDashboard
End Sub
```

### 16.5. Módulo `mod_Sync` — sincronização com Supabase

```vba
Option Explicit

Public Sub SyncCompleto()
    On Error GoTo TrataErro
    
    Dim url As String: url = GetConfig("supabase_url")
    Dim apikey As String: apikey = GetConfig("supabase_anon_key")
    
    If url = "" Or apikey = "" Then
        Debug.Print "Supabase não configurado — sync ignorado."
        Exit Sub
    End If
    
    ' Push: lançamentos modificados desde o último sync
    Call PushLancamentosModificados(url, apikey)
    
    ' Pull: lançamentos remotos novos
    Call PullLancamentosRemotos(url, apikey)
    
    Exit Sub
TrataErro:
    Debug.Print "Erro no sync: " & Err.Description
End Sub

Public Sub PushLancamentosModificados(url As String, apikey As String)
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If Left(ws.Name, 6) = "Caixa " Then
            Dim r As Long
            For r = 2 To 1000
                If ws.Cells(r, 17).Value <> "" Then ' UUID coluna Q
                    Dim modificado As String
                    modificado = ws.Cells(r, 19).Value ' hash
                    ' Compara com hash anterior cacheado em _AUDIT (lógica simplificada)
                    
                    Dim payload As String
                    payload = ConstruirPayloadLancamento(ws, r)
                    
                    http.Open "POST", url & "/rest/v1/rpc/upsert_lancamento", False
                    http.setRequestHeader "Content-Type", "application/json"
                    http.setRequestHeader "apikey", apikey
                    http.setRequestHeader "Authorization", "Bearer " & apikey
                    http.send payload
                    
                    If http.Status >= 400 Then
                        Debug.Print "Erro push linha " & r & ": " & http.responseText
                    End If
                End If
            Next r
        End If
    Next ws
End Sub

Public Function ConstruirPayloadLancamento(ws As Worksheet, linha As Long) As String
    ' Constrói JSON respeitando schema do Supabase.
    Dim s As String
    s = "{"
    s = s & """numero_nf"":""" & ws.Cells(linha, 3).Value & ""","
    s = s & """codigo_pedido"":""" & ws.Cells(linha, 4).Value & ""","
    s = s & """cliente_nome"":""" & EscapeJson(CStr(ws.Cells(linha, 5).Value)) & ""","
    s = s & """valor_nf"":" & Replace(CStr(ws.Cells(linha, 6).Value), ",", ".") & ","
    s = s & """categoria"":""" & ws.Cells(linha, 7).Value & ""","
    s = s & """estado"":""" & ws.Cells(linha, 8).Value & ""","
    s = s & """dados_categoria"":" & ws.Cells(linha, 18).Value & "," ' coluna R = json
    s = s & """data_caixa"":""" & Format(DataDeAba(ws.Name), "yyyy-mm-dd") & """"
    s = s & "}"
    ConstruirPayloadLancamento = s
End Function

Public Function EscapeJson(s As String) As String
    EscapeJson = Replace(Replace(Replace(s, "\", "\\"), """", "\"""), vbCrLf, "\n")
End Function

Public Sub PullLancamentosRemotos(url As String, apikey As String)
    ' Lê lançamentos do Supabase modificados após último sync timestamp e atualiza Excel.
    ' Implementação completa requer parser JSON (recomendado: VBA-JSON do GitHub).
End Sub
```

### 16.6. Módulo `mod_Notificacoes`

```vba
Option Explicit

Public Sub MostrarNotificacoesDoDia()
    Dim msg As String: msg = "📊 Bom dia! Resumo do sistema:" & vbCrLf & vbCrLf
    
    Dim totalPend As Long: totalPend = ContarPendencias()
    Dim atrasadas As Long: atrasadas = ContarPendenciasAtrasadas()
    Dim caixaHoje As String: caixaHoje = "Caixa " & Format(Date, "dd-mm")
    
    msg = msg & "• Pendências em aberto: " & totalPend & vbCrLf
    msg = msg & "• Pendências atrasadas (>3 dias): " & atrasadas & vbCrLf
    msg = msg & "• Caixa de hoje: " & caixaHoje & vbCrLf
    
    If atrasadas > 0 Then
        msg = msg & vbCrLf & "⚠️ Atenção: existem pendências antigas precisando de resolução."
    End If
    
    MsgBox msg, vbInformation, "Sistema de Caixa"
End Sub

Public Function ContarPendencias() As Long
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("_PENDENCIAS")
    ContarPendencias = WorksheetFunction.CountA(ws.Range("A2:A10000"))
End Function

Public Function ContarPendenciasAtrasadas() As Long
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("_PENDENCIAS")
    ContarPendenciasAtrasadas = WorksheetFunction.CountIf(ws.Range("F2:F10000"), ">3")
End Function
```

### 16.7. Módulo `mod_Dashboard`

```vba
Option Explicit

Public Sub AtualizarDashboard()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("DASHBOARD")
    Application.ScreenUpdating = False
    
    ' Recalcula totais
    ws.Cells(5, 4).Value = ContarTotalLancamentos("ALL")
    ws.Cells(6, 4).Value = ContarTotalLancamentos("PENDENTES")
    ws.Cells(7, 4).Value = ContarTotalLancamentos("CANCELADOS")
    ws.Cells(8, 4).Value = SomarValores("EFETIVOS")
    
    ' Atualiza pivot
    Dim pt As PivotTable
    For Each pt In ws.PivotTables
        pt.RefreshTable
    Next pt
    
    ' Atualiza timestamp
    ws.Cells(2, 2).Value = "Última atualização: " & Format(Now, "dd/mm/yyyy hh:mm")
    
    Application.ScreenUpdating = True
End Sub

Public Function ContarTotalLancamentos(tipo As String) As Long
    Dim total As Long: total = 0
    Dim aba As Worksheet
    For Each aba In ThisWorkbook.Worksheets
        If Left(aba.Name, 6) = "Caixa " Then
            Dim r As Long
            For r = 2 To 1000
                If aba.Cells(r, 3).Value <> "" Then
                    Select Case tipo
                        Case "ALL": total = total + 1
                        Case "PENDENTES": If aba.Cells(r, 8).Value = "pendente" Then total = total + 1
                        Case "CANCELADOS": If aba.Cells(r, 7).Value = "Cancelado" Then total = total + 1
                    End Select
                End If
            Next r
        End If
    Next aba
    ContarTotalLancamentos = total
End Function

Public Function SomarValores(tipo As String) As Double
    Dim total As Double: total = 0
    Dim aba As Worksheet
    For Each aba In ThisWorkbook.Worksheets
        If Left(aba.Name, 6) = "Caixa " Then
            Dim r As Long
            For r = 2 To 1000
                If aba.Cells(r, 3).Value <> "" And aba.Cells(r, 7).Value <> "Cancelado" Then
                    total = total + Nz(aba.Cells(r, 6).Value, 0)
                End If
            Next r
        End If
    Next aba
    SomarValores = total
End Function

Function Nz(v As Variant, fallback As Variant) As Variant
    If IsNull(v) Or v = "" Or IsError(v) Then Nz = fallback Else Nz = v
End Function
```

### 16.8. Módulo `mod_Init`

```vba
Option Explicit

Public Sub InicializarSistema()
    ' Garante que abas auxiliares existam
    Call GarantirAba("_CONFIG")
    Call GarantirAba("_VENDEDORAS")
    Call GarantirAba("_FERIADOS")
    Call GarantirAba("_AUDIT")
    Call GarantirAba("_CACHE_CLIENTES")
    Call GarantirAba("_PENDENCIAS")
    Call GarantirAba("DASHBOARD")
    Call GarantirAba("MODELO")
    
    ' Verifica versão da planilha
    Dim versao As String: versao = GetConfig("versao_planilha")
    If versao = "" Then
        ' Primeira inicialização — popular CONFIG seed
        Call PopularConfigSeed
    End If
End Sub

Private Sub GarantirAba(nome As String)
    On Error Resume Next
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(nome)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add
        ws.Name = nome
        If Left(nome, 1) = "_" Then ws.Visible = xlSheetHidden
    End If
End Sub

Private Sub PopularConfigSeed()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("_CONFIG")
    ws.Cells(1, 1).Value = "Chave"
    ws.Cells(1, 2).Value = "Valor"
    ws.Cells(1, 3).Value = "Tipo"
    ws.Cells(1, 4).Value = "Descrição"
    
    ws.Cells(2, 1).Value = "versao_planilha": ws.Cells(2, 2).Value = "1.0.0"
    ws.Cells(3, 1).Value = "ano_corrente": ws.Cells(3, 2).Value = Year(Date)
    ws.Cells(4, 1).Value = "notif_intervalo_horas": ws.Cells(4, 2).Value = 4
    ws.Cells(5, 1).Value = "notif_horario_inicio": ws.Cells(5, 2).Value = "08:00"
    ws.Cells(6, 1).Value = "notif_horario_fim": ws.Cells(6, 2).Value = "18:00"
    ws.Cells(7, 1).Value = "pendencia_dias_atraso": ws.Cells(7, 2).Value = 3
    ws.Cells(8, 1).Value = "gerar_sabado": ws.Cells(8, 2).Value = True
    ws.Cells(9, 1).Value = "gerar_domingo": ws.Cells(9, 2).Value = False
    ws.Cells(10, 1).Value = "supabase_url": ws.Cells(10, 2).Value = ""
    ws.Cells(11, 1).Value = "supabase_anon_key": ws.Cells(11, 2).Value = ""
    ws.Cells(12, 1).Value = "sync_intervalo_min": ws.Cells(12, 2).Value = 5
    ws.Cells(13, 1).Value = "responsavel_padrao": ws.Cells(13, 2).Value = Application.UserName
End Sub
```

---

## 17. APPS SCRIPT — EQUIVALENTE PARA GOOGLE SHEETS

Para uso quando o desktop não está disponível. Arquivo `Code.gs`:

```javascript
// Configurações
const CONFIG = PropertiesService.getScriptProperties();
const SUPABASE_URL = CONFIG.getProperty('SUPABASE_URL');
const SUPABASE_KEY = CONFIG.getProperty('SUPABASE_ANON_KEY');

const CATEGORIAS = ['Cartão', 'Pix', 'Dinheiro', 'Cancelado', 'Cartão Link', 'Obs'];

const CORES = {
  'Cartão':      { bg: '#DBEAFE', fg: '#1E3A8A' },
  'Pix':         { bg: '#CCFBF1', fg: '#134E4A' },
  'Dinheiro':    { bg: '#DCFCE7', fg: '#14532D' },
  'Cancelado':   { bg: '#FECACA', fg: '#7F1D1D' },
  'Cartão Link': { bg: '#EDE9FE', fg: '#4C1D95' },
  'Obs':         { bg: '#FEF3C7', fg: '#78350F' }
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Caixa')
    .addItem('Criar caixa de hoje', 'criarCaixaDeHoje')
    .addItem('Atualizar pendências', 'atualizarPendencias')
    .addItem('Atualizar dashboard', 'atualizarDashboard')
    .addItem('Sincronizar com Supabase', 'syncCompleto')
    .addSeparator()
    .addItem('Configurações', 'abrirConfig')
    .addToUi();
  
  // Verifica se caixa de hoje existe
  const hoje = new Date();
  if (ehDiaUtil(hoje)) {
    criarCaixaDoDia(hoje);
  }
}

function criarCaixaDoDia(dt) {
  const nome = 'Caixa ' + Utilities.formatDate(dt, 'America/Sao_Paulo', 'dd/MM');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(nome)) return;
  
  const modelo = ss.getSheetByName('MODELO');
  const novo = modelo.copyTo(ss);
  novo.setName(nome);
  novo.activate();
  
  // Limpa exemplos
  novo.getRange('A2:S4').clearContent().setBackground(null);
  
  aplicarFormatacaoCondicional(novo);
  aplicarValidacoes(novo);
  
  registrarAudit('CRIAR_CAIXA', nome, '', '');
}

function aplicarFormatacaoCondicional(sheet) {
  const range = sheet.getRange('A2:S1000');
  const rules = sheet.getConditionalFormatRules() || [];
  
  CATEGORIAS.forEach(cat => {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=$G2="${cat}"`)
      .setBackground(CORES[cat].bg)
      .setFontColor(CORES[cat].fg)
      .setRanges([range])
      .build();
    rules.push(rule);
  });
  
  // Pendente
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="pendente"')
    .setBackground('#F3F4F6')
    .setFontColor('#6B7280')
    .setRanges([range])
    .build());
  
  // Resolvido (faixa verde — Apps Script não suporta border parcial via regra,
  // implementação alternativa: coluna O com cor verde quando "SIM")
  
  sheet.setConditionalFormatRules(rules);
}

function aplicarValidacoes(sheet) {
  // Categoria
  const validacaoCat = SpreadsheetApp.newDataValidation()
    .requireValueInList(CATEGORIAS, true)
    .setAllowInvalid(false)
    .setHelpText('Selecione uma categoria.')
    .build();
  sheet.getRange('G2:G1000').setDataValidation(validacaoCat);
  
  // (validações específicas por categoria implementadas via onEdit)
}

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (!sheet.getName().startsWith('Caixa ')) return;
  
  if (range.getColumn() === 7 && range.getRow() > 1) {
    const categoria = range.getValue();
    ajustarDetalhes(sheet, range.getRow(), categoria);
    
    // Marca timestamp se ainda vazio
    const cellHora = sheet.getRange(range.getRow(), 2);
    if (!cellHora.getValue()) {
      cellHora.setValue(Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm'));
    }
  }
  
  if (range.getColumn() === 4 && range.getRow() > 1) {
    // Autocomplete cliente
    autocompletarCliente(sheet, range.getRow(), range.getValue());
  }
}

function ajustarDetalhes(sheet, linha, categoria) {
  const detRange = sheet.getRange(linha, 9, 1, 5); // I:M
  detRange.clearDataValidations();
  
  switch (categoria) {
    case 'Cartão':
      sheet.getRange(linha, 10).setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(['Visa','Mastercard','Elo','Hipercard','Amex','Outros'], true)
          .build()
      );
      sheet.getRange(linha, 11).setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(['Crédito','Débito'], true)
          .build()
      );
      // (notas via setNote)
      sheet.getRange(linha, 9).setNote('Código de autorização');
      sheet.getRange(linha, 10).setNote('Bandeira');
      sheet.getRange(linha, 11).setNote('Modalidade');
      sheet.getRange(linha, 12).setNote('Parcelas');
      sheet.getRange(linha, 13).setNote('Últimos 4 dígitos');
      break;
    case 'Pix':
      sheet.getRange(linha, 9).setNote('ID do comprovante (NF)');
      sheet.getRange(linha, 10).setNote('Chave recebedora');
      // ...
      break;
    // (demais categorias)
  }
  
  sheet.getRange(linha, 8).setValue('em_preenchimento');
}

function syncCompleto() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(sh => {
    if (!sh.getName().startsWith('Caixa ')) return;
    pushLancamentos(sh);
  });
}

function pushLancamentos(sheet) {
  const data = sheet.getRange('A2:S1000').getValues();
  data.forEach((row, i) => {
    if (!row[2]) return; // sem NF, pula
    const payload = {
      numero_nf: row[2],
      codigo_pedido: row[3],
      cliente_nome: row[4],
      valor_nf: row[5],
      categoria: row[6],
      estado: row[7],
      dados_categoria: row[17] ? JSON.parse(row[17]) : {},
      data_caixa: dataDeAba(sheet.getName())
    };
    
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/upsert_lancamento', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  });
}

function ehDiaUtil(dt) {
  const wd = dt.getDay();
  if (wd === 0) return false; // domingo
  if (wd === 6) return CONFIG.getProperty('GERAR_SABADO') !== 'false';
  return true;
}

function dataDeAba(nome) {
  const [d, m] = nome.replace('Caixa ', '').split('/');
  return `${new Date().getFullYear()}-${m}-${d}`;
}

// Trigger: rodar diariamente às 06:00
function instalarGatilhoDiario() {
  ScriptApp.newTrigger('criarCaixaDeHoje')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
}

function criarCaixaDeHoje() {
  if (ehDiaUtil(new Date())) {
    criarCaixaDoDia(new Date());
  }
}
```

---

## 18. PROTEÇÃO DE PLANILHA

### 18.1. Aba MODELO

```vba
Sheets("MODELO").Protect Password:=GetConfig("senha_protecao_modelo"), _
    DrawingObjects:=True, _
    Contents:=True, _
    Scenarios:=True, _
    UserInterfaceOnly:=False
```

Nenhuma célula desbloqueada.

### 18.2. Abas `Caixa DD-MM`

```vba
ws.Protect Password:=GetConfig("senha_protecao_modelo"), _
    AllowFormattingCells:=True, _
    AllowSorting:=True, _
    AllowFiltering:=True, _
    AllowUsingPivotTables:=True, _
    UserInterfaceOnly:=True
```

Células A1:S1 (cabeçalho) bloqueadas. A2:S1000 desbloqueadas para edição. Cabeçalho fica congelado.

### 18.3. Abas `_*` (auxiliares)

Totalmente protegidas. Edição apenas via macros.

---

## 19. LAYOUT DE IMPRESSÃO

### 19.1. Caixa DD-MM

- Orientação: paisagem.
- Tamanho: A4.
- Margens: 1.5 cm (todas).
- Cabeçalho de impressão: linha 1 repetida em todas as páginas.
- Rodapé: número da página + nome da aba + data de impressão.
- Escala: ajustar para 1 página de largura.
- Cores: imprimir em cores (inclui cores das categorias).

### 19.2. DASHBOARD

- Orientação: retrato.
- Tamanho: A4.
- Escala: 1 página total.
- Inclui gráficos.

---

## 20. ASSETS VISUAIS

### 20.1. Marca d'água "MODELO"

PNG 1200×800px, fundo transparente, texto "MODELO — NÃO PREENCHER":
- Fonte: Inter Bold ou Arial Bold.
- Tamanho: 80pt.
- Cor: `#9CA3AF` com 40% opacidade.
- Rotação: -30°.
- Repetido em padrão diagonal a cada 400×300 px.

Salvar como `assets/modelo_watermark.png` no mesmo diretório da planilha.

### 20.2. Ícones de categoria (opcional)

PNG 24×24 transparente, um por categoria:
- `assets/icon_cartao.png` — círculo azul com símbolo de cartão.
- `assets/icon_pix.png` — losango verde-água com "Pi" estilizado.
- `assets/icon_dinheiro.png` — cifrão verde.
- `assets/icon_cancelado.png` — círculo vermelho com X.
- `assets/icon_link.png` — corrente roxa.
- `assets/icon_obs.png` — exclamação âmbar.

Inseridos na linha como Picture via macro quando categoria é definida (opcional; primeiro release pode pular este detalhe).

---

## 21. APÊNDICE E — TABELA DE FÓRMULAS POR CÉLULA

### MODELO — fórmulas em linhas (aplicadas em todas as linhas 2-1000)

| Célula | Fórmula |
|--------|---------|
| `A2` | `=SE(C2="";"";LIN()-1)` (numeração automática) |
| `B2` | (preenchido por macro `Worksheet_Change` em coluna G) |
| `H2` | (gerenciado por macros — não fórmula) |
| `K2` (quando Dinheiro) | `=SE(J2="";"";J2-F2)` (cálculo de troco) |
| `O2` | (preenchido manualmente ou por macro `ResolverPendencia`) |
| `Q2` | (UUID gerado por macro ao criar linha) |
| `R2` | (JSON gerado por macro a partir das colunas I-M) |
| `S2` | `=HASH(C2&D2&F2&G2&Q2)` (hash para sync) — função personalizada |

### DASHBOARD — fórmulas-chave

| Célula | Fórmula |
|--------|---------|
| `D5` | `=ContarTotalLancamentos("ALL")` (UDF VBA) |
| `D6` | `=ContarTotalLancamentos("PENDENTES")` |
| `D7` | `=ContarTotalLancamentos("CANCELADOS")` |
| `D8` | `=TEXTO(SomarValores("EFETIVOS");"R$ #.##0,00")` |

### _PENDENCIAS — fórmulas dinâmicas

(Já mostradas na seção 10.2.)

---

## 22. APÊNDICE F — CÓDIGOS RGB EXATOS

| Categoria | Background HEX | RGB | Texto HEX | RGB Texto |
|-----------|----------------|-----|-----------|-----------|
| Cartão | `#DBEAFE` | `RGB(219, 234, 254)` | `#1E3A8A` | `RGB(30, 58, 138)` |
| Pix | `#CCFBF1` | `RGB(204, 251, 241)` | `#134E4A` | `RGB(19, 78, 74)` |
| Dinheiro | `#DCFCE7` | `RGB(220, 252, 231)` | `#14532D` | `RGB(20, 83, 45)` |
| Cancelado | `#FECACA` | `RGB(254, 202, 202)` | `#7F1D1D` | `RGB(127, 29, 29)` |
| Cartão Link | `#EDE9FE` | `RGB(237, 233, 254)` | `#4C1D95` | `RGB(76, 29, 149)` |
| Obs | `#FEF3C7` | `RGB(254, 243, 199)` | `#78350F` | `RGB(120, 53, 15)` |
| Pendente | `#F3F4F6` | `RGB(243, 244, 246)` | `#6B7280` | `RGB(107, 114, 128)` |
| Resolvido (faixa) | `#10B981` | `RGB(16, 185, 129)` | — | — |
| Atrasado (faixa direita) | `#EF4444` | `RGB(239, 68, 68)` | — | — |
| Conflito (hachura) | `#F59E0B` | `RGB(245, 158, 11)` | — | — |
| Header escuro | `#1F2937` | `RGB(31, 41, 55)` | `#F9FAFB` | `RGB(249, 250, 251)` |
| Aba MODELO | `#374151` | `RGB(55, 65, 81)` | — | — |

---

## 23. APÊNDICE G — ROTEIRO DE TESTE MANUAL

> Execute **todos** os passos antes de declarar o Excel pronto. Marque ✅ ou ❌ ao lado de cada item.

### G.1. Setup inicial
- [ ] Abrir planilha pela primeira vez. Macros são habilitadas?
- [ ] Aba `MODELO` aparece com fundo cinza-escuro e marca d'água visível?
- [ ] Abas `_CONFIG`, `_VENDEDORAS` etc. estão ocultas?
- [ ] Aba `Caixa DD-MM` do dia atual foi criada automaticamente?

### G.2. Criar lançamento Cartão
- [ ] Em `Caixa de hoje`, linha 2: digitar NF, Pedido, Cliente, Valor.
- [ ] Em `G2` selecionar "Cartão". Validações I-M aparecem com hovers corretos?
- [ ] Preencher autorização, bandeira, modalidade, parcelas.
- [ ] Linha fica azul claro? Borda esquerda azul forte 2px?
- [ ] Estado em H2 muda para "completo"?

### G.3. Criar lançamento Pix
- [ ] Linha 3: preencher NF + ID comprovante + chave + data Pix.
- [ ] Linha verde-água?

### G.4. Criar lançamento Dinheiro
- [ ] Linha 4: vendedora obrigatória aparece como dropdown?
- [ ] Valor recebido > NF gera troco automático em K?
- [ ] Linha verde?

### G.5. Cancelar lançamento existente
- [ ] Mudar G2 (atualmente "Cartão") para "Cancelado". Modal pede motivo?
- [ ] Após confirmação, linha vira vermelha com texto tachado?
- [ ] Audit log gravou a transição?

### G.6. Resolver pendência
- [ ] Criar lançamento sem categoria (ex: usar macro "Importar pendência").
- [ ] Aparece cinza com borda tracejada?
- [ ] Em `_PENDENCIAS`, aparece listado?
- [ ] Resolver via macro. Linha original ganha cor + faixa verde?

### G.7. Pendência atrasada
- [ ] Manualmente, no Excel, mudar a "data" de uma pendência para 5 dias atrás.
- [ ] Borda direita vermelha aparece?

### G.8. Geração automática
- [ ] Fechar planilha. Reabrir no dia seguinte. Aba do novo dia foi criada?

### G.9. Sync com Supabase
- [ ] Configurar `_CONFIG` com URL e chave válidas.
- [ ] Salvar planilha. Lançamentos aparecem no Postgres (verificar via web)?
- [ ] Modificar um lançamento na web. Próximo abrir do Excel reflete?

### G.10. Dashboard
- [ ] Abrir DASHBOARD. Totais batem com soma manual?
- [ ] Gráfico de pizza mostra todas as categorias?
- [ ] Botão "Atualizar" funciona?

### G.11. Proteção
- [ ] Tentar editar célula em MODELO sem senha. É bloqueado?
- [ ] Tentar editar header em `Caixa DD-MM`. É bloqueado?
- [ ] Tentar excluir linha. Macro intercepta?

### G.12. Imprimir
- [ ] Ctrl+P em uma aba caixa. Visualização mostra todas as colunas?
- [ ] Cabeçalho repete em segunda página?

---

## FIM DO DOCUMENTO 02

> Próxima leitura recomendada: `03_BACKEND_SUPABASE_DATABASE.md`.

