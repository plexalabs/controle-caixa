# PROMPT 01 — VISÃO GERAL, REGRAS DE NEGÓCIO E DICIONÁRIO DE DADOS

> **Documento mestre do projeto.** Leia este arquivo antes de qualquer outro.
> Ele estabelece o contexto, vocabulário, regras de negócio e critérios de aceite que regem
> os arquivos 02 (Excel), 03 (Supabase), 04 (Web) e 05 (Integração).
>
> **Versão:** 1.0
> **Data de criação:** 28/04/2026
> **Audiência:** Agente executor de código (Claude/Copilot/Cursor) e desenvolvedor humano de apoio.
> **Linguagem:** Português brasileiro (todas as labels, mensagens, validações e logs).

---

## SUMÁRIO

1. Contexto do negócio
2. Glossário oficial
3. Personas e atores do sistema
4. Visão de produto (escopo)
5. As seis categorias de pagamento
6. Sistema de cores (semântica e técnica)
7. Dicionário de dados — entidades e atributos
8. Regras de negócio (RN-001 ... RN-080)
9. Workflows operacionais detalhados
10. Sistema de pendências
11. Sistema de notificações inteligentes
12. Catálogo de casos extremos (edge cases)
13. Requisitos não-funcionais
14. Critérios de aceite globais
15. Mensagens padronizadas (UI strings)
16. Roadmap de fases
17. Apêndice A — Tabela canônica de campos por categoria
18. Apêndice B — Máquina de estados do lançamento
19. Apêndice C — Calendário de geração automática de abas
20. Apêndice D — Padrão de mascaramento de dados sensíveis

---

## 1. CONTEXTO DO NEGÓCIO

### 1.1. A empresa

A operação é uma central de revenda com três fluxos de venda paralelos:

- **PDV físico** — clientes finais e revendedoras compram presencialmente; pagamento ocorre via cartão (crédito/débito), Pix ou dinheiro vivo.
- **Link de pagamento (Cartão Link)** — vendedoras enviam link gerado pela maquininha/gateway para o cliente quitar à distância.
- **Faturamento de revendedoras com retirada na central** — pedidos faturados antecipadamente; revendedora retira posteriormente. Aqui mora o problema central deste sistema.

### 1.2. O sistema mybucks

`mybucks` é o sistema financeiro proprietário da empresa. Características:

- Integração nativa com a máquina de pagamento (PinPad/TEF) e com o emissor de NF-e.
- Toda nota fiscal emitida transita por ele.
- Toda compra do PDV ou via link cai automaticamente no fluxo dele.
- **Possui um modo de "fatura forçada de ciclo"** — quando o ciclo de revenda fecha, todos os pedidos pendentes são marcados como faturados/entregues para evitar cancelamentos automáticos. Esse comportamento é o gerador de risco financeiro.

> **Por que isso é um problema?**
> O sistema "diz" que o pedido foi entregue ao revendedor, mas na vida real o pedido continua na central, sem retirada e sem cobrança efetiva. Sem um controle paralelo, o saldo aparente da empresa diverge da realidade.

### 1.3. Quem cuida hoje vs. quem cuida amanhã

Atualmente a auditoria é feita manualmente por uma colaboradora que se desliga em breve. O usuário deste sistema (referido como **Operador**) está assumindo a função e quer **digitalizar 100% do processo**, mantendo o controle granular mas eliminando papel, planilhas avulsas e dependência de memória pessoal.

### 1.4. Por que mybucks "redondo" não basta

O mybucks é robusto **para o que ele se propõe**: registrar a movimentação financeira sob a ótica da máquina e da NF-e. Ele **não foi feito** para auditar:

- Pedidos faturados que ainda não foram retirados nem pagos efetivamente.
- Notas fiscais perdidas (papel físico extraviado).
- Reconciliação de quem efetivamente recebeu dinheiro vivo no caixa.
- Comprovantes de Pix avulsos não anexados à NF-e.
- Cancelamentos com motivo, autor e data registrados.

O sistema descrito neste documento é a **camada de auditoria humana sobre o mybucks**.

---

## 2. GLOSSÁRIO OFICIAL

Este glossário é normativo. Todo código, mensagem e documento deve usar exatamente estes termos.

| Termo | Definição |
|-------|-----------|
| **Caixa** | Conjunto de lançamentos de um único dia útil. Cada caixa é representado por **uma aba** na planilha e **um registro pai** no banco. Identificador: data no formato `DD/MM` (web) ou `DD-MM` (Excel). |
| **Lançamento** | Uma única linha do caixa. Representa uma nota fiscal/pedido em auditoria. Tem identificador único interno (UUID) e número da NF como chave de negócio. |
| **NF / Nota / NF-e** | Nota fiscal eletrônica emitida pelo mybucks. Possui número sequencial. |
| **Pedido** | Conjunto comercial vendido. Possui código próprio no mybucks e está vinculado a um cliente/revendedora. Um pedido pode gerar uma ou mais NFs, mas no escopo deste sistema tratamos 1 pedido = 1 NF. |
| **Cliente / Revendedora** | A pessoa cujo nome consta no pedido. Tratados como o mesmo conceito (campo `cliente_nome`). |
| **Vendedora** | Funcionária que atendeu o cliente. Obrigatório para `Dinheiro` (regra de auditoria interna: o nome dela vai atrás da NF impressa). |
| **Categoria** | Classificação de como aquele lançamento foi pago/processado. Seis valores possíveis: Cartão, Pix, Dinheiro, Cancelado, Cartão Link, Obs. |
| **Etiqueta** | Sinônimo coloquial de categoria, usado pelo Operador. Quando aparecer "etiqueta" na conversa, traduzir mentalmente para `categoria`. |
| **Caça (de pendência)** | Atividade de investigação manual. Operador parte de uma pendência genérica do mybucks e descobre se foi cartão, Pix, dinheiro, link ou cancelamento, registrando no caixa correto. |
| **Pendência genérica** | Lançamento ainda sem resolução. Surge porque o mybucks aglutinou várias entradas e o Operador precisa caçar. |
| **Pendência resolvida** | Lançamento que teve sua categoria identificada e todos os campos obrigatórios preenchidos. Fica na cor da categoria com tom **verde de check** sobreposto (regra RN-035). |
| **Ciclo** | Período comercial da empresa (geralmente 21 ou 28 dias). Ao fim do ciclo, o mybucks força o fechamento. |
| **Faturamento forçado** | Ato do mybucks de marcar todos os pedidos abertos como faturados ao fim do ciclo. |
| **Caixinha** | Termo coloquial do Operador para a aba do caixa daquele dia. Sinônimo de Caixa. |
| **OTP** | Código de 6 dígitos enviado por email para confirmar cadastro ou redefinir senha. Implementado via Supabase Auth + Resend SMTP, expira em 1 hora. |
| **Auditoria** | Registro imutável de quem fez o quê, quando e o quê mudou. Tabela `audit_log`. |
| **Comprovante** | Arquivo (imagem ou PDF) anexado a um lançamento. Vai para o Storage do Supabase com criptografia em repouso. |
| **Dashboard** | Aba/página de visão consolidada com indicadores agregados. |

---

## 3. PERSONAS E ATORES DO SISTEMA

### 3.1. Persona primária — "Operador" (única hoje)

- **Nome convencional:** Operador (a planilha real usa o nome real do usuário).
- **Cargo:** Auditor de caixa.
- **Frequência de uso:** diária, segunda a sábado, várias vezes ao dia.
- **Dispositivo principal:** PC do trabalho (lento, sem permissão para instalar bibliotecas pesadas).
- **Dispositivo secundário:** notebook pessoal e celular, ocasional.
- **Conhecimento técnico:** intermediário — sabe Excel bem, escreve fórmulas, mas não programa.
- **Tarefa central:** garantir que todo lançamento que entrou no mybucks tem reflexo correto e auditável neste sistema.
- **Dor principal:** caçar manualmente a origem de pendências genéricas.
- **Objetivo do sistema:** ser a primeira coisa que abre de manhã e a última que olha à tarde.

### 3.2. Atores secundários (futuro próximo, não obrigatório no MVP)

- **Supervisor financeiro** — somente leitura, vê dashboard.
- **Auditor externo** — acesso temporário a relatórios exportados.

> **No MVP, projetar para um único usuário ativo, mas a arquitetura deve permitir multi-usuário com RLS (ver arquivo 03).**

---

## 4. VISÃO DE PRODUTO (ESCOPO)

### 4.1. O que está dentro do escopo (MVP)

- Registro de lançamentos diários com 6 categorias e campos dinâmicos por categoria.
- Estrutura de abas/caixas por dia, geração automática de abas em dias úteis.
- Aba/template MODELO bloqueada e marcada como referência.
- Sistema de pendências com transição visual (cor) ao serem resolvidas.
- Dashboard com indicadores: totais por categoria, pendências em aberto, série temporal.
- Notificações inteligentes a cada 4 horas em horário comercial.
- Sincronização bidirecional Excel ↔ Supabase ↔ Web.
- Login email + senha + OTP de 6 dígitos via Resend (cadastro aberto, confirmação obrigatória).
- Anexo de comprovantes (imagem/PDF) no Storage criptografado.
- Auditoria imutável de toda alteração.

### 4.2. O que está fora do escopo (não fazer)

- Auditoria de boletos (mybucks já cobre).
- Emissão de NF (mybucks já cobre).
- Conciliação bancária com extrato (fase 2).
- Aplicativo mobile nativo (a web é responsiva e basta).
- Importação automática direto do mybucks via API (sem API pública confirmada — fase 2).
- Cálculo de comissões.
- Multi-empresa.

### 4.3. Premissas técnicas

- O Operador tem **plano pago do Supabase ativo**.
- O PC do trabalho **tem internet** mas é **lento** e **não permite instalações pesadas**.
- A web app deve rodar com **bibliotecas mínimas via CDN**, sem build local nem servidor próprio.
- O Excel pode ter **macros VBA habilitadas** (arquivo `.xlsm`).
- Existe **uma alternativa Google Sheets via Apps Script** para quando o Excel desktop não estiver disponível.

---

## 5. AS SEIS CATEGORIAS DE PAGAMENTO

> Qualquer lançamento, em qualquer momento, está em **exatamente uma** das seis categorias abaixo. Não há lançamento sem categoria — quando o Operador ainda não sabe qual é, o estado é `Pendente` (que não é uma categoria, é um estado anterior — ver máquina de estados no Apêndice B).

### 5.1. CARTÃO

**Quando usar:** Pagamento presencial via maquininha física (PinPad).

**Campos obrigatórios:**
- `codigo_autorizacao` — string alfanumérica retornada pela maquininha (4 a 20 caracteres).
- `bandeira` — Visa / Mastercard / Elo / Hipercard / Amex / Outros.
- `modalidade` — Crédito / Débito.
- `parcelas` — inteiro ≥ 1 (se Débito, sempre 1).
- `ultimos_4_digitos` — 4 dígitos numéricos (opcional mas recomendado).

**Validações:**
- `codigo_autorizacao` obrigatório, formato livre, mas único por dia (alerta se duplicado).
- `parcelas ≥ 2` só se `modalidade == 'Crédito'`.

### 5.2. PIX

**Quando usar:** Transferência via Pix recebida em qualquer chave da empresa.

**Campos obrigatórios:**
- `comprovante_id_externo` — número do comprovante que vem impresso na NF.
- `chave_recebedora` — chave Pix usada (CNPJ / e-mail / telefone / aleatória).
- `data_hora_pix` — timestamp do pagamento (pode divergir da data do caixa).

**Campos opcionais:**
- `nome_remetente` — quem pagou (string livre).
- `valor_recebido` — se diferente do valor da NF (reconciliação parcial).
- `arquivo_comprovante` — upload do comprovante (PDF/JPG/PNG até 5 MB).

**Validações:**
- `comprovante_id_externo` único por dia (alerta se duplicado).

### 5.3. DINHEIRO

**Quando usar:** Pagamento em espécie no caixa.

**Campos obrigatórios:**
- `vendedora_recebedora` — seleção de uma lista mantida em tabela `vendedoras` (ver dicionário de dados). Combobox com autocomplete.
- `valor_recebido` — valor em mãos (pode ser maior que a NF, gera troco).
- `troco` — calculado: `valor_recebido - valor_nf`. Apenas leitura.

**Campos opcionais:**
- `observacao_caixa` — notas livres (ex: "recebi em cédulas pequenas").

**Validações:**
- `vendedora_recebedora` não pode ser vazio nem livre — deve estar na lista cadastrada.
- `valor_recebido ≥ valor_nf`.

### 5.4. CANCELADO

**Quando usar:** Pedido foi cancelado depois de já ter sido faturado/registrado.

**Campos obrigatórios:**
- `motivo_cancelamento` — texto livre, ≥ 10 caracteres.
- `cancelado_por` — nome de quem autorizou o cancelamento (lista controlada de supervisores).
- `data_cancelamento` — data em que foi cancelado (pode ser posterior à data do caixa).
- `numero_estorno` — opcional; preencher se houve estorno financeiro com identificador.

**Validações:**
- `data_cancelamento ≥ data_caixa`.
- Se já existia categoria anterior (ex: era Cartão), o histórico precisa ser preservado em `audit_log`.

### 5.5. CARTÃO LINK

**Quando usar:** Cobrança remota via link enviado ao cliente.

**Campos obrigatórios:**
- `link_url` — URL completa do link de pagamento enviado.
- `codigo_autorizacao` — quando o cliente pagar, o código retornado.
- `status_link` — Enviado / Pago / Expirado / Cancelado.
- `data_envio_link` — quando o link foi enviado.

**Campos opcionais:**
- `data_pagamento_link` — quando o link foi efetivamente pago.
- `bandeira`, `modalidade`, `parcelas` — quando pago.

**Validações:**
- `link_url` deve começar com `https://`.
- Se `status_link == 'Pago'`, `codigo_autorizacao` torna-se obrigatório.

### 5.6. OBS (OBSERVAÇÃO / OUTROS)

**Quando usar:** Casos atípicos não cobertos pelas categorias anteriores. Exemplos esperados:
- Trocas de mercadoria sem fluxo financeiro.
- Cortesias internas autorizadas.
- Erros de lançamento que precisam de nota.
- Devoluções parciais.

**Campos obrigatórios:**
- `tipo_obs` — combobox livre que aprende: Troca / Cortesia / Erro / Devolução / Outro.
- `descricao` — texto livre, ≥ 20 caracteres.

**Campos opcionais:**
- `acao_pendente` — checkbox: "ainda há ação a tomar".
- `responsavel` — nome de quem está cuidando.

> **Importante:** A categoria Obs é deliberadamente flexível. Não bloqueie o Operador com validações rígidas aqui. É a "saída de emergência" do sistema.

---

## 6. SISTEMA DE CORES (SEMÂNTICA E TÉCNICA)

### 6.1. Princípios

1. **Cada categoria tem uma cor distintiva e semanticamente coerente.**
2. **A cor é aplicada à linha inteira no Excel** e ao **card/linha do lançamento na web**.
3. **Existe uma versão clara (modo claro) e uma versão escura (modo escuro)** de cada cor — a web alterna automaticamente; o Excel usa a versão clara.
4. **Pendências resolvidas ganham um indicador secundário verde** (faixa esquerda 4px ou ícone ✓), preservando a cor primária da categoria.
5. **Todas as cores devem passar em contraste AA (WCAG 4.5:1)** com o texto preto/branco usado.

### 6.2. Paleta canônica

| Categoria | Razão semântica | HEX modo claro | HEX modo escuro | RGB Excel |
|-----------|-----------------|----------------|-----------------|-----------|
| **Cartão** | Azul = pagamento eletrônico clássico, confiável | `#DBEAFE` (fundo) `#1E40AF` (texto/borda) | `#1E3A8A` / `#BFDBFE` | `219, 234, 254` |
| **Pix** | Verde-água = identidade visual oficial do Pix | `#CCFBF1` / `#0F766E` | `#134E4A` / `#99F6E4` | `204, 251, 241` |
| **Dinheiro** | Verde sólido = papel-moeda, dinheiro físico | `#DCFCE7` / `#166534` | `#14532D` / `#BBF7D0` | `220, 252, 231` |
| **Cancelado** | Vermelho/rosa-escuro = erro, encerrado | `#FECACA` / `#991B1B` | `#7F1D1D` / `#FECACA` | `254, 202, 202` |
| **Cartão Link** | Roxo = digital, moderno, à distância | `#EDE9FE` / `#5B21B6` | `#4C1D95` / `#DDD6FE` | `237, 233, 254` |
| **Obs** | Amarelo/âmbar = atenção, observação neutra | `#FEF3C7` / `#92400E` | `#78350F` / `#FDE68A` | `254, 243, 199` |

### 6.3. Estados auxiliares (não-categorias)

| Estado | Cor | Aplicação |
|--------|-----|-----------|
| **Pendente** (sem categoria ainda) | `#F3F4F6` (cinza neutro) com borda esquerda `#9CA3AF` tracejada | Linha aguardando classificação |
| **Resolvida** (overlay sobre cor da categoria) | Faixa esquerda 4px `#10B981` + ícone ✓ | Pendência identificada e fechada |
| **Atrasada >3 dias** | Mesma cor da categoria + borda direita 4px `#EF4444` pulsante | Alerta visual de prioridade |
| **Conflito de sincronização** | Hachura diagonal âmbar sobre cor original | Ainda não conciliado entre Excel e Supabase |

### 6.4. Aplicação técnica

- **Excel:** formatação condicional baseada no valor da célula `Categoria` aplicada ao range da linha (ver arquivo 02).
- **Web:** classes CSS `.cat-cartao`, `.cat-pix`, `.cat-dinheiro`, `.cat-cancelado`, `.cat-cartao-link`, `.cat-obs`, com variáveis CSS controlando o modo (ver arquivo 04).
- **Cor secundária resolvida:** classe modificadora `.is-resolvida` que adiciona `box-shadow: inset 4px 0 0 #10B981`.

---

## 7. DICIONÁRIO DE DADOS — ENTIDADES E ATRIBUTOS

### 7.1. Entidade `caixa`

Um caixa = um dia operacional.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | uuid | sim | Chave primária. |
| `data` | date | sim | Data do caixa. UNIQUE. |
| `nome_aba_excel` | string(20) | sim | Formato `Caixa DD-MM`. UNIQUE. |
| `nome_aba_web` | string(20) | sim | Formato `Caixa DD/MM`. |
| `status` | enum | sim | `aberto`, `em_conferencia`, `fechado`, `arquivado`. |
| `total_lancamentos` | int | sim | Cache (atualizado via trigger). |
| `total_pendentes` | int | sim | Cache. |
| `total_valor` | numeric(12,2) | sim | Cache. |
| `criado_em` | timestamptz | sim | Default `now()`. |
| `criado_por` | uuid | sim | FK para `auth.users`. |
| `fechado_em` | timestamptz | não | Nulo até fechamento. |
| `fechado_por` | uuid | não | Quem fechou. |
| `observacoes` | text | não | Notas livres do dia. |

### 7.2. Entidade `lancamento`

Uma linha de um caixa.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | uuid | sim | Chave primária. |
| `caixa_id` | uuid | sim | FK para `caixa.id`. |
| `numero_nf` | string(15) | sim | Número da NF-e. UNIQUE por dia. |
| `codigo_pedido` | string(20) | sim | Código do mybucks. |
| `cliente_nome` | string(120) | sim | Nome do cliente/revendedora. |
| `valor_nf` | numeric(12,2) | sim | Valor total da nota. |
| `categoria` | enum | sim | Uma das 6 categorias. |
| `estado` | enum | sim | `pendente`, `em_preenchimento`, `completo`, `resolvido`, `cancelado`. |
| `dados_categoria` | jsonb | sim | Objeto com campos específicos da categoria (ver Apêndice A). |
| `criado_em` | timestamptz | sim | |
| `atualizado_em` | timestamptz | sim | |
| `resolvido_em` | timestamptz | não | |
| `criado_por` | uuid | sim | |
| `atualizado_por` | uuid | sim | |
| `comprovante_storage_path` | string(500) | não | Caminho no Supabase Storage. |
| `tags` | string[] | não | Etiquetas livres do Operador. |

### 7.3. Entidade `vendedora`

Lista controlada para `Dinheiro`.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `id` | uuid | sim | |
| `nome` | string(80) | sim | UNIQUE. |
| `apelido` | string(40) | não | Como aparece atrás da NF. |
| `ativa` | boolean | sim | Default `true`. |
| `criada_em` | timestamptz | sim | |

### 7.4. Entidade `cliente_cache`

Cache derivado para autocomplete (não é fonte de verdade, é o mybucks).

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `codigo_pedido` | string(20) | sim | PK. |
| `cliente_nome` | string(120) | sim | |
| `valor_nf` | numeric(12,2) | sim | |
| `ultima_vez_visto` | timestamptz | sim | |

### 7.5. Entidade `pendencia`

Vista derivada (view materializada) sobre `lancamento` onde `estado IN ('pendente','em_preenchimento')`.

### 7.6. Entidade `audit_log`

Registro imutável.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | |
| `tabela` | string(50) | Nome da tabela alterada. |
| `registro_id` | uuid | ID do registro alterado. |
| `acao` | enum | `INSERT`, `UPDATE`, `DELETE`. |
| `dados_antes` | jsonb | Estado anterior (null se INSERT). |
| `dados_depois` | jsonb | Estado novo (null se DELETE). |
| `usuario_id` | uuid | Quem fez. |
| `usuario_email` | string(120) | Cache do email no momento. |
| `ip` | inet | IP do cliente. |
| `user_agent` | string(500) | Navegador. |
| `criado_em` | timestamptz | |

### 7.7. Entidade `notificacao`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | |
| `tipo` | enum | `pendencia_aberta`, `pendencia_atrasada`, `caixa_nao_fechado`, `valor_divergente`, `comprovante_faltando`, `link_expirando`. |
| `severidade` | enum | `info`, `aviso`, `urgente`. |
| `titulo` | string(120) | |
| `mensagem` | text | |
| `lancamento_id` | uuid | FK opcional. |
| `caixa_id` | uuid | FK opcional. |
| `lida_em` | timestamptz | Null = não lida. |
| `criada_em` | timestamptz | |

### 7.8. Entidade `config`

Chave-valor para parâmetros do sistema.

| Chave | Valor padrão | Descrição |
|-------|--------------|-----------|
| `notificacao.intervalo_horas` | `4` | Frequência de checagem. |
| `notificacao.horario_inicio` | `08:00` | Início do dia. |
| `notificacao.horario_fim` | `18:00` | Fim do dia. |
| `pendencia.dias_alerta_atraso` | `3` | A partir de quantos dias vira urgente. |
| `caixa.gerar_sabado` | `true` | |
| `caixa.gerar_domingo` | `false` | |
| `sync.intervalo_minutos` | `5` | Intervalo de sincronização. |

---

## 8. REGRAS DE NEGÓCIO

> Cada regra tem identificador único `RN-NNN`. Toda violação deve gerar mensagem de erro padronizada (ver seção 15).

### 8.1. Estrutura e identidade

- **RN-001:** Cada caixa corresponde a exatamente uma data calendário.
- **RN-002:** O nome da aba no Excel segue exatamente o padrão `Caixa DD-MM` (sem barras, conforme limitação do Excel).
- **RN-003:** O nome da aba na web segue exatamente o padrão `Caixa DD/MM` (com barras, mais legível).
- **RN-004:** Em cada virada de ano, é criada uma nova planilha mestre. As abas voltam a partir de `Caixa 01-01`. O ano anterior é arquivado.
- **RN-005:** A aba `MODELO` existe em todas as planilhas, sempre com fundo cinza-escuro distinto e marca d'água "MODELO — NÃO PREENCHER".
- **RN-006:** A aba `MODELO` é protegida com senha definida no momento da criação (senha registrada em variável de ambiente, nunca hardcoded).

### 8.2. Lançamentos — criação e identidade

- **RN-010:** Todo lançamento tem um `id` UUID gerado pelo sistema, único globalmente.
- **RN-011:** O `numero_nf` deve ser único dentro de um caixa. Duplicatas geram alerta amarelo, mas não bloqueiam (pode haver legítima necessidade).
- **RN-012:** O `numero_nf` pode se repetir entre caixas diferentes (devolução, reemissão).
- **RN-013:** O `codigo_pedido` é validado contra `cliente_cache`; se encontrado, autopreenche `cliente_nome` e `valor_nf`.
- **RN-014:** Ao criar um lançamento sem categoria, o estado é `pendente` e a linha fica cinza neutra.

### 8.3. Categoria e campos dinâmicos

- **RN-020:** Mudar a categoria após preenchimento parcial preserva os dados em `dados_categoria` (campos antigos viram parte do `audit_log` mas saem da UI).
- **RN-021:** A UI **oculta visualmente** os campos não pertinentes à categoria atual, mas eles continuam no JSON com prefixo `_archived_` se foram preenchidos antes.
- **RN-022:** Todos os campos obrigatórios da categoria devem estar preenchidos para o lançamento sair de `em_preenchimento` para `completo`.
- **RN-023:** A linha **só recebe a cor da categoria** quando o estado é `completo` ou `resolvido`. Em `em_preenchimento`, fica com cor desbotada (60% de saturação).

### 8.4. Pendências e resolução

- **RN-030:** Uma pendência genérica do mybucks é registrada como lançamento `pendente` com `categoria = null` e `dados_categoria = {origem_pendencia: 'mybucks_generica'}`.
- **RN-031:** Ao identificar a categoria, o lançamento permanece **no mesmo caixa** (mesma data) — não é movido para o caixa do dia da resolução.
- **RN-032:** A data e o usuário da resolução são gravados em `resolvido_em` e `resolvido_por` (e em `audit_log`).
- **RN-033:** Pendência aberta há mais de **3 dias úteis** (configurável em `config.pendencia.dias_alerta_atraso`) é marcada visualmente como `atrasada`.
- **RN-034:** Pendências atrasadas geram notificação `urgente` automaticamente.
- **RN-035:** Pendência resolvida exibe **faixa verde 4px à esquerda** sobre a cor da categoria.

### 8.5. Cancelamento de lançamento

- **RN-040:** Cancelar um lançamento (categoria → Cancelado) **não exclui** o registro; apenas muda categoria, preserva o histórico em `audit_log`.
- **RN-041:** Cancelar exige preenchimento de motivo, autorizador e data.
- **RN-042:** Não é possível "descancelar" — para reverter, criar novo lançamento e referenciar o anterior em `dados_categoria.lancamento_substituido`.
- **RN-043:** Lançamentos cancelados continuam contados no total de lançamentos do caixa, mas não no total financeiro.

### 8.6. Cores e estado visual

- **RN-050:** A cor da linha é função pura do par `(categoria, estado)`. Não há override manual.
- **RN-051:** O modo escuro é determinado pela preferência do sistema (`prefers-color-scheme`).
- **RN-052:** Linhas com conflito de sincronização exibem hachura diagonal âmbar até o conflito ser resolvido (ver arquivo 05).

### 8.7. Caixa — abertura e fechamento

- **RN-060:** Um caixa é criado automaticamente todo dia útil (segunda a sábado por padrão), conforme calendário no Apêndice C.
- **RN-061:** Domingo não gera caixa por padrão. Se houver venda em domingo, criar manualmente.
- **RN-062:** Fechar um caixa requer: (a) zero pendências em aberto naquele caixa, (b) dashboard de divergências em verde.
- **RN-063:** Fechamento forçado é permitido, mas exige justificativa textual e gera notificação de aviso.

### 8.8. Permissões e autenticação

- **RN-070:** Todo acesso à web exige autenticação via Supabase Auth — email + senha. **Cadastro é aberto a qualquer email**; defesa de acesso passa pelo papel atribuído (RLS) e pela confirmação obrigatória de email.
- **RN-070a:** Toda nova conta recebe email com OTP de 6 dígitos (template pt-BR via Resend SMTP). `email_confirmed_at` só é populado após confirmação. Login antes da confirmação retorna `email_not_confirmed` e é bloqueado pela UI.
- **RN-070b:** Primeiro usuário cadastrado no sistema vira **admin + operador** automaticamente (anchor admin). Demais usuários viram apenas **operador**; promoção a admin é manual via SQL pelo admin existente.
- **RN-070c:** Senha mínima: 8 caracteres, ao menos 1 letra e 1 número (padrão Supabase configurável em Auth → Password requirements).
- **RN-071:** O Operador é o único usuário com permissão de escrita no MVP.
- **RN-072:** Toda mutação dispara linha em `audit_log` (trigger no Postgres).
- **RN-073:** Tentativa de excluir um lançamento é negada — apenas soft-delete via mudança de estado.

### 8.9. Dados sensíveis

- **RN-080:** Os últimos 4 dígitos do cartão e a chave Pix são considerados PII. Mascarar na UI (`****1234`) e descriptografar apenas sob clique explícito (botão "revelar"). Cada revelação grava entrada em `audit_log`.

---

## 9. WORKFLOWS OPERACIONAIS DETALHADOS

### 9.1. Workflow A — Criar lançamento novo (caso simples)

**Pré-condição:** Caixa do dia já existe.

**Passos:**
1. Operador clica em "Novo lançamento" na aba do dia.
2. Sistema abre formulário com 4 campos visíveis: `numero_nf`, `codigo_pedido`, `cliente_nome`, `valor_nf`. Categoria começa vazia.
3. Operador digita `codigo_pedido`.
4. Sistema busca em `cliente_cache`; se encontrado, autopreenche `cliente_nome` e `valor_nf` e exibe pequeno selo "auto".
5. Operador escolhe categoria no combobox.
6. Sistema renderiza dinamicamente os campos da categoria (ver Apêndice A).
7. Operador preenche campos.
8. Sistema valida em tempo real; campos inválidos ficam destacados em vermelho.
9. Operador clica em "Salvar".
10. Sistema persiste no Supabase, dispara trigger de auditoria, recalcula totais do caixa, atualiza UI com a cor da categoria.

**Pós-condição:** Lançamento aparece colorido, contador de lançamentos do caixa incrementa.

### 9.2. Workflow B — Importar pendência genérica do mybucks

**Pré-condição:** Operador identificou no mybucks uma pendência sem categoria clara.

**Passos:**
1. Operador clica em "Importar pendência".
2. Formulário pede só `numero_nf`, `codigo_pedido`, `cliente_nome`, `valor_nf`, `caixa_destino` (combobox de datas, default hoje).
3. Categoria fica `null`. Estado = `pendente`.
4. Salvar.
5. Linha aparece cinza neutra com borda esquerda tracejada.
6. Notificação `info` registrada: "Nova pendência aberta — investigar."

### 9.3. Workflow C — Resolver pendência (caça)

**Pré-condição:** Existe pendência aberta.

**Passos:**
1. Operador abre o caixa onde a pendência está (não onde ele está hoje, mas onde a pendência foi originada — RN-031).
2. Clica na linha da pendência.
3. Painel lateral abre com botões "Identificar como Cartão / Pix / Dinheiro / Cancelado / Cartão Link / Obs".
4. Operador escolhe.
5. Formulário dinâmico aparece com campos da categoria.
6. Operador preenche.
7. Sistema:
   - Atualiza `categoria` e `estado = 'resolvido'`.
   - Grava `resolvido_em = now()` e `resolvido_por = current_user`.
   - Aplica cor da categoria + faixa verde de resolvido.
   - Atualiza dashboard.
   - Cria notificação `info`: "Pendência X resolvida como [categoria]".
8. Audit log grava transição completa.

### 9.4. Workflow D — Cancelar lançamento existente

**Passos:**
1. Operador clica no lançamento.
2. Menu de ações → "Cancelar".
3. Modal pede: motivo (≥10 chars), autorizador (lista), data do cancelamento (default hoje).
4. Confirmar.
5. Categoria muda para `Cancelado`, dados antigos arquivados em `_archived_*`.
6. Linha vira vermelha.
7. Total financeiro do caixa é recalculado (excluindo cancelados).

### 9.5. Workflow E — Anexar comprovante (Pix)

**Passos:**
1. No lançamento Pix, Operador clica em "Anexar comprovante".
2. Seleciona arquivo (PDF/JPG/PNG ≤ 5 MB).
3. Sistema:
   - Faz upload para bucket `comprovantes` no Storage.
   - Caminho: `{caixa_id}/{lancamento_id}/{timestamp}-{nome_original}`.
   - Storage criptografado em repouso.
   - Salva path em `lancamento.comprovante_storage_path`.
4. UI mostra ícone de clipe + thumbnail.
5. Clicar no clipe abre preview em modal.

### 9.6. Workflow F — Fechar caixa do dia

**Passos:**
1. Operador clica em "Fechar caixa".
2. Sistema verifica pré-condições (RN-062).
3. Se há pendências, exibe lista e bloqueia.
4. Operador resolve ou marca "fechar mesmo assim" (gera notificação aviso).
5. Caixa muda status para `fechado`, grava `fechado_em` e `fechado_por`.
6. Dashboard atualiza.

### 9.7. Workflow G — Geração automática de abas

**Trigger:** scheduler (Apps Script no Google Sheets ou cron do Supabase Edge Function).

**Lógica:**
- Toda **segunda às 06:00**: cria caixa de **sábado anterior** (caso não exista) e **segunda atual**.
- **Terça a sexta às 06:00**: cria caixa do dia.
- **Sábado às 06:00**: cria caixa do sábado.
- **Domingo**: nada.
- Se feriado configurado em `config.feriados`, pular.

**Implementação dupla:**
- Excel: macro VBA `Auto_GerarCaixaDoDia()` rodando via Windows Task Scheduler.
- Apps Script: trigger time-based diário.
- Supabase: pg_cron + Edge Function `cria_caixa_diario`.

---

## 10. SISTEMA DE PENDÊNCIAS — DETALHE

### 10.1. Tipologia das pendências

#### Tipo 1 — Pendência de cartão aglutinada
**Origem:** mybucks junta tudo num único bloco "cartões a auditar" sem distinguir entre cartão presencial, link, ou estornos.
**Ação:** Operador caça e classifica em uma das categorias de cartão ou registra como Obs se for atípico.

#### Tipo 2 — Entrada monetária ambígua
**Origem:** Aparece no extrato do mybucks um valor recebido sem identificação clara.
**Ação:** Operador investiga e classifica em Pix, Cartão Link ou Outros.

#### Tipo 3 — NF emitida sem retirada nem pagamento
**Origem:** Faturamento forçado de fim de ciclo. Pedido está "entregue" no sistema mas fisicamente ainda na central.
**Ação:** Registrar como pendência com tag `aguarda_retirada`. Acompanhar até resolução.

### 10.2. Indicadores visuais

| Estado | Visual |
|--------|--------|
| Aberta < 1 dia | Cinza neutro |
| Aberta 1-3 dias | Cinza neutro + ícone relógio âmbar |
| Aberta > 3 dias | Cinza neutro + borda direita 4px vermelha pulsante |
| Resolvida hoje | Cor da categoria + faixa verde + brilho leve por 24h |
| Resolvida anterior | Cor da categoria + faixa verde |

### 10.3. Painel central de pendências

A web possui aba dedicada **"Pendências"** que agrega todas as pendências em aberto de **todos os caixas**, ordenadas por idade (mais antigas primeiro). Cada item mostra:
- Data do caixa de origem.
- Idade em dias úteis.
- Resumo (NF, cliente, valor).
- Botão "Resolver" (atalho para Workflow C).

---

## 11. SISTEMA DE NOTIFICAÇÕES INTELIGENTES

### 11.1. Princípios

- **Frequência base:** verificação a cada **4 horas** dentro do horário comercial.
- **Horário comercial:** 08:00 às 18:00, segunda a sábado.
- **Não enviar fora do horário** (acumula para próxima janela).
- **Agrupamento:** notificações similares dentro de 1h são agrupadas em uma só.
- **Canais:** badge na web (sempre), e-mail (configurável), Web Push (futuro).

### 11.2. Catálogo de tipos

| Tipo | Severidade | Trigger | Mensagem padrão |
|------|------------|---------|------------------|
| `pendencia_aberta` | info | Pendência criada nas últimas 4h | "Há N nova(s) pendência(s) aguardando classificação." |
| `pendencia_atrasada` | urgente | Pendência aberta > 3 dias | "Pendência da NF {nf} está aberta há {dias} dias úteis." |
| `caixa_nao_fechado` | aviso | Caixa do dia anterior não fechado às 09:00 | "Caixa de {data} ainda não foi fechado." |
| `valor_divergente` | aviso | Soma do dia diverge do esperado em > R$ 1,00 | "Divergência de R$ {valor} no caixa de {data}." |
| `comprovante_faltando` | info | Pix sem comprovante anexado há > 24h | "Pix da NF {nf} sem comprovante." |
| `link_expirando` | aviso | Link de cartão criado há > 5 dias e ainda `Enviado` | "Link da NF {nf} prestes a expirar." |
| `bom_dia_resumo` | info | Primeiro acesso do dia | "Bom dia! {n} pendências, {m} caixas em aberto." |

### 11.3. Comportamento da UI

- Sino com badge vermelho de contador no canto superior direito.
- Click abre painel lateral com lista cronológica.
- Cada notificação tem botão "Marcar como lida" e "Ir para o lançamento".
- Notificações `urgente` exibem toast no canto inferior + emitem som curto (configurável).

---

## 12. CATÁLOGO DE CASOS EXTREMOS (EDGE CASES)

> Cada caso aqui foi mapeado a partir de cenários reais. O sistema deve lidar graciosamente com todos.

### 12.1. EC-001 — Cliente paga parte em Pix e parte em dinheiro
**Solução:** Criar dois lançamentos separados, mesmo `numero_nf`, valores parciais somando o total. Adicionar tag `pagamento_misto` em ambos. Sistema detecta e mostra alerta amarelo se total não bater (RN-011 estendido).

### 12.2. EC-002 — Cliente cancela após emissão e pede reemissão imediata
**Solução:** Lançamento original vira `Cancelado`. Novo lançamento criado com referência em `dados_categoria.substitui_nf`.

### 12.3. EC-003 — NF perdida fisicamente (papel)
**Solução:** Categoria `Obs`, `tipo_obs = 'NF Perdida'`, descrição obrigatória, anexo de qualquer comprovante adicional disponível.

### 12.4. EC-004 — Estorno parcial de cartão
**Solução:** Manter lançamento original como `Cartão`, criar segundo lançamento `Cancelado` com valor negativo igual ao estorno e referência cruzada.

### 12.5. EC-005 — Pix recebido em conta errada
**Solução:** Lançamento `Obs`, `tipo_obs = 'Pix Conta Errada'`, anexo do comprovante, descrição com plano de correção.

### 12.6. EC-006 — Vendedora não cadastrada na lista
**Solução:** Botão "+" no combobox abre modal rápido para cadastro. Aprovação automática se Operador for admin. Auditoria gravada.

### 12.7. EC-007 — Caixa do dia não foi gerado pelo scheduler
**Solução:** Botão manual "Gerar caixa de hoje" sempre disponível como fallback.

### 12.8. EC-008 — Ano vira no meio de pendências
**Solução:** Pendências de 2025 continuam acessíveis na planilha 2025 arquivada. Notificações cessam após arquivamento, mas dashboard global mostra "ainda há X pendências legadas".

### 12.9. EC-009 — Conflito de sincronização (Excel offline + Web online)
**Solução:** Última escrita ganha; conflito flagado com hachura âmbar; Operador resolve manualmente clicando "Aceitar versão A / B / Manual".

### 12.10. EC-010 — PC do trabalho sem internet
**Solução:** Excel funciona local. Sync ocorre na próxima conexão. Web app exibe banner "modo offline — alterações serão sincronizadas".

### 12.11. EC-011 — Mesmo NF aparecendo duplicada (engano do mybucks)
**Solução:** Alerta amarelo, **não bloqueia**. Operador decide se exclui o duplicado (cancelando como `Obs/Erro`) ou mantém ambos.

### 12.12. EC-012 — Categoria mudou de Cartão para Pix após preenchimento parcial
**Solução:** RN-021 — campos de Cartão preenchidos vão para `_archived_cartao_*` no JSON, ficam disponíveis em "Histórico de mudanças".

### 12.13. EC-013 — Comprovante carregado sem extensão reconhecida
**Solução:** Aceitar apenas MIME `application/pdf`, `image/jpeg`, `image/png`, `image/webp`. Outros geram erro com mensagem amigável.

### 12.14. EC-014 — Operador apaga acidentalmente uma linha no Excel
**Solução:** Macro VBA intercepta evento `BeforeRightClick` e `BeforeDelete` (custom), pede confirmação, registra audit. Sync para Supabase trata como soft-delete (estado=`excluido`), nunca DELETE.

### 12.15. EC-015 — Sessão Supabase expirada (JWT venceu)
**Solução:** Web detecta erro 401 (`PGRST301` ou `invalid_grant`). Antes de redirecionar para `/login`, tenta salvar trabalho em curso em `localStorage` com flag `unsaved_work`. Refresh token automático do `supabase-js` resolve a maioria dos casos sem reautenticação manual.

### 12.16. EC-016 — Múltiplas abas abertas no navegador
**Solução:** Detectar via `BroadcastChannel API`. Última aba ativa ganha foco em alterações. Outras mostram banner "Edição em outra aba — recarregue".

### 12.17. EC-017 — Caracteres especiais no nome do cliente (ç, ã, '')
**Solução:** UTF-8 em todo o pipeline. Excel salvo como `.xlsm` com BOM. CSV de exportação com UTF-8 BOM.

### 12.18. EC-018 — Valor de NF com mais de 2 casas decimais
**Solução:** Sistema arredonda para 2 casas (banker's rounding) e exibe alerta informativo.

### 12.19. EC-019 — Operador altera dados de lançamento já marcado como `resolvido`
**Solução:** Permitir, mas requer justificativa textual antes de salvar. Audit log marca como `EDIT_AFTER_RESOLVE`.

### 12.20. EC-020 — Sincronização disparada com banco em manutenção
**Solução:** Retry exponencial até 5 tentativas. Após 5 falhas, marca lançamento como `pending_sync` e notifica.

---

## 13. REQUISITOS NÃO-FUNCIONAIS

### 13.1. Performance

- **Tempo de carregamento inicial da web** ≤ 3s no PC do trabalho (4G simulado, hardware modesto).
- **Tempo de salvar lançamento** ≤ 800ms (p95).
- **Tempo de cálculo de dashboard** ≤ 1.5s (p95) com 2.000 lançamentos.
- **Excel:** abrir planilha com 12 meses de dados ≤ 10s.

### 13.2. Disponibilidade

- Supabase: SLA do plano pago (≥ 99,9%).
- Web: hospedada em CDN estática; SLA do provedor (Cloudflare Pages, Netlify ou Vercel free tier).

### 13.3. Segurança

- TLS 1.2+ obrigatório.
- RLS no Supabase em todas as tabelas.
- Storage com políticas de acesso autenticado.
- Senhas: armazenadas hash bcrypt pelo Supabase Auth (nunca em texto). Política configurável em Auth → Password requirements.
- Tokens JWT com expiração ≤ 1h, refresh seguro.
- Backup diário automático do Postgres (Supabase nativo).
- Backup semanal manual exportado para arquivo Excel.

### 13.4. Acessibilidade

- Contraste mínimo AA (4.5:1 texto, 3:1 ícones).
- Navegação por teclado completa.
- ARIA labels nos botões e inputs.
- Mensagens de erro associadas via `aria-describedby`.

### 13.5. Internacionalização

- MVP: pt-BR apenas.
- Datas: formato `DD/MM/YYYY` na UI, `YYYY-MM-DD` no storage.
- Moeda: BRL com `R$` prefixo, separador decimal vírgula.
- Strings centralizadas em arquivo `i18n/pt-BR.json` para futura tradução.

### 13.6. Manutenibilidade

- Código fonte versionado (Git).
- Convenção de commits: Conventional Commits.
- Documentação inline (JSDoc / docstrings VBA).
- Variáveis de ambiente para todas as configurações sensíveis.
- README.md em cada repo com setup local.

### 13.7. Observabilidade

- Logs estruturados (JSON) na Edge Function.
- Métricas: contagem de lançamentos/dia, latência de sync, erros.
- Dashboard de saúde do sistema (Supabase logs + alerta por e-mail).

---

## 14. CRITÉRIOS DE ACEITE GLOBAIS

> Para considerar o MVP entregue, **todos** os critérios abaixo devem passar.

- **CA-01:** Operador consegue, em uma única sessão, criar lançamento de cada uma das 6 categorias com todos os campos obrigatórios e ver a cor correspondente aplicada.
- **CA-02:** Mudar a categoria de um lançamento existente preserva dados antigos no `audit_log` e atualiza visualmente em < 500ms.
- **CA-03:** Pendência criada hoje aparece automaticamente na aba "Pendências" e na notificação do próximo ciclo de 4h.
- **CA-04:** Pendência aberta há 4 dias gera notificação `urgente` automática.
- **CA-05:** Resolver pendência move-a do estado `pendente` para `resolvido`, mantendo-a no caixa de origem (não no caixa de hoje).
- **CA-06:** Excel e Web mostram exatamente os mesmos lançamentos após sync (no máximo 5 min de defasagem).
- **CA-07:** Toda alteração gera linha em `audit_log` com usuário, timestamp, dados antes/depois.
- **CA-08:** Aba MODELO está protegida por senha e exibe marca d'água visível.
- **CA-09:** Geração automática de aba acontece todos os dias úteis às 06:00 sem intervenção manual.
- **CA-10:** Dashboard exibe corretamente: total por categoria, série diária, top vendedoras, % pendências.
- **CA-11:** Signup com email + senha gera OTP de 6 dígitos via Resend; confirmação popula `email_confirmed_at`; login pré-confirmação é bloqueado com mensagem clara; primeiro usuário recebe admin+operador automaticamente.
- **CA-12:** Comprovante de Pix anexado é recuperável e renderizável em < 2s.
- **CA-13:** Cancelar lançamento exige todos os campos de cancelamento e move o lançamento para a cor vermelha.
- **CA-14:** Sistema sobrevive a perda de internet por 30 minutos sem perda de dados (modo offline + retry).
- **CA-15:** Backup semanal exportado para Excel pode ser aberto e contém todos os caixas do período.

---

## 15. MENSAGENS PADRONIZADAS (UI STRINGS)

> Todas as mensagens em pt-BR. Estrutura: `[chave]: [texto]`.

### 15.1. Erros de validação

- `erro.nf.obrigatorio`: "Número da NF é obrigatório."
- `erro.nf.formato`: "NF deve ter entre 1 e 15 caracteres."
- `erro.nf.duplicada`: "Atenção: já existe lançamento com esta NF neste caixa. Confirmar?"
- `erro.valor.obrigatorio`: "Valor da NF é obrigatório."
- `erro.valor.positivo`: "Valor deve ser maior que zero."
- `erro.categoria.obrigatorio`: "Selecione uma categoria."
- `erro.cartao.autorizacao_obrigatorio`: "Código de autorização é obrigatório para Cartão."
- `erro.pix.comprovante_obrigatorio`: "Identificador do comprovante é obrigatório."
- `erro.dinheiro.vendedora_obrigatorio`: "Selecione a vendedora que recebeu."
- `erro.cancelado.motivo_curto`: "Motivo do cancelamento deve ter no mínimo 10 caracteres."
- `erro.link.url_invalida`: "Link deve começar com https://."

### 15.2. Confirmações

- `conf.cancelar_lancamento`: "Tem certeza que deseja cancelar este lançamento? Esta ação requer motivo."
- `conf.fechar_caixa`: "Fechar este caixa? {n} pendências serão arrastadas para amanhã."
- `conf.fechar_caixa_sem_pendencias`: "Fechar caixa de {data}?"
- `conf.alterar_categoria`: "Alterar categoria de {antiga} para {nova}? Os dados antigos serão arquivados."

### 15.3. Sucesso

- `ok.lancamento_salvo`: "Lançamento salvo."
- `ok.pendencia_resolvida`: "Pendência resolvida — bom trabalho!"
- `ok.caixa_fechado`: "Caixa de {data} fechado."
- `ok.comprovante_anexado`: "Comprovante anexado."

### 15.4. Notificações

- `notif.bom_dia`: "Bom dia! {n_pendencias} pendência(s) e {n_caixas} caixa(s) em aberto."
- `notif.pendencia_atrasada`: "Pendência da NF {nf} está aberta há {dias} dias úteis."
- `notif.divergencia`: "Divergência de {valor} no caixa de {data}."

### 15.5. Estados vazios

- `vazio.nenhum_lancamento`: "Nenhum lançamento ainda neste caixa. Comece criando o primeiro."
- `vazio.nenhuma_pendencia`: "Nenhuma pendência em aberto. ✨"
- `vazio.dashboard_sem_dados`: "Sem dados para o período selecionado."

---

## 16. ROADMAP DE FASES

### Fase 0 — Preparação (1 semana)
- Criar projeto Supabase.
- Configurar Resend SMTP no Supabase Auth (templates pt-BR + Confirm Email + OTP).
- Criar repositórios Git.
- Configurar variáveis de ambiente.

### Fase 1 — MVP Excel + Supabase (3 semanas)
- Modelo Excel completo (arquivo 02).
- Schema Postgres + RLS (arquivo 03).
- Sync Excel → Supabase via Apps Script (arquivo 05).

### Fase 2 — Web App (3 semanas)
- Auth + dashboard (arquivo 04).
- CRUD de lançamentos.
- Aba pendências.
- Notificações em browser.

### Fase 3 — Notificações & Polimento (1 semana)
- Edge Function de scheduler.
- E-mail de notificações.
- Dashboard avançado.

### Fase 4 — Hardening (1 semana)
- Testes de carga.
- Backup/restore drill.
- Documentação final ao usuário.

---

## 17. APÊNDICE A — TABELA CANÔNICA DE CAMPOS POR CATEGORIA

> Esta tabela é a fonte da verdade para o objeto `dados_categoria` (jsonb).
> Toda implementação (Excel, Web, Postgres) deve respeitar exatamente esta estrutura.

### A.1 Cartão

```json
{
  "codigo_autorizacao": "string",
  "bandeira": "Visa|Mastercard|Elo|Hipercard|Amex|Outros",
  "modalidade": "Credito|Debito",
  "parcelas": "integer >= 1",
  "ultimos_4_digitos": "string(4)?"
}
```

### A.2 Pix

```json
{
  "comprovante_id_externo": "string",
  "chave_recebedora": "string",
  "data_hora_pix": "ISO8601 timestamp",
  "nome_remetente": "string?",
  "valor_recebido": "number?"
}
```

### A.3 Dinheiro

```json
{
  "vendedora_id": "uuid",
  "vendedora_nome_cache": "string",
  "valor_recebido": "number",
  "troco": "number (calculado)",
  "observacao_caixa": "string?"
}
```

### A.4 Cancelado

```json
{
  "motivo_cancelamento": "string (>=10 chars)",
  "cancelado_por": "string",
  "data_cancelamento": "ISO8601 date",
  "numero_estorno": "string?",
  "categoria_anterior": "string?",
  "_archived_dados_categoria_anterior": "object?"
}
```

### A.5 Cartão Link

```json
{
  "link_url": "https url",
  "codigo_autorizacao": "string?",
  "status_link": "Enviado|Pago|Expirado|Cancelado",
  "data_envio_link": "ISO8601 timestamp",
  "data_pagamento_link": "ISO8601 timestamp?",
  "bandeira": "string?",
  "modalidade": "Credito|Debito|null",
  "parcelas": "integer?"
}
```

### A.6 Obs

```json
{
  "tipo_obs": "Troca|Cortesia|Erro|Devolucao|NF Perdida|Pix Conta Errada|Outro",
  "descricao": "string (>=20 chars)",
  "acao_pendente": "boolean",
  "responsavel": "string?"
}
```

---

## 18. APÊNDICE B — MÁQUINA DE ESTADOS DO LANÇAMENTO

```
              ┌──────────────┐
              │   pendente   │  ← criado sem categoria
              └──────┬───────┘
                     │ definir categoria
                     ▼
            ┌────────────────────┐
            │ em_preenchimento   │  ← categoria definida, campos faltando
            └────────┬───────────┘
                     │ todos campos OK
                     ▼
              ┌──────────────┐
              │   completo   │  ← linha colorida normal
              └──────┬───────┘
                     │ pendência mybucks resolvida
                     ▼
              ┌──────────────┐
              │   resolvido  │  ← cor + faixa verde
              └──────────────┘

  qualquer estado acima ──cancelar──▶ ┌──────────────┐
                                      │   cancelado  │  ← vermelho
                                      └──────────────┘
```

**Transições permitidas:**

| De | Para | Gatilho |
|----|------|---------|
| (nada) | `pendente` | Criar sem categoria |
| (nada) | `em_preenchimento` | Criar com categoria |
| `pendente` | `em_preenchimento` | Definir categoria |
| `em_preenchimento` | `completo` | Validação OK |
| `completo` | `em_preenchimento` | Editar campo obrigatório (deixar inválido) |
| `pendente`/`em_preenchimento`/`completo` | `resolvido` | Marcar como pendência mybucks resolvida |
| `resolvido` | `em_preenchimento` | Editar (com justificativa, RN-019) |
| qualquer | `cancelado` | Workflow D |
| `cancelado` | (nenhum) | Não é possível desfazer (RN-042) |

---

## 19. APÊNDICE C — CALENDÁRIO DE GERAÇÃO AUTOMÁTICA DE ABAS

```
Domingo    │ ❌ Não gera caixa
Segunda    │ ✅ Gera caixa de segunda + de sábado anterior (se faltou)
Terça      │ ✅ Gera caixa de terça
Quarta     │ ✅ Gera caixa de quarta
Quinta     │ ✅ Gera caixa de quinta
Sexta      │ ✅ Gera caixa de sexta
Sábado     │ ✅ Gera caixa de sábado
Feriado    │ ❌ Não gera (configurável em config.feriados)
```

**Horário do trigger:** 06:00 América/São_Paulo.

**Implementação tripla redundante:**

1. **Apps Script (Google Sheets):** trigger `time-based daily`.
2. **Supabase Edge Function:** invocada por `pg_cron` configurado na própria DB.
3. **Excel desktop (fallback):** macro chamada pelo Windows Task Scheduler.

A primeira bem-sucedida marca a flag `caixa.gerado_automaticamente = true` para as outras pularem.

---

## 20. APÊNDICE D — PADRÃO DE MASCARAMENTO DE DADOS SENSÍVEIS

| Campo | Armazenamento | Exibição padrão | Após "Revelar" |
|-------|---------------|-----------------|----------------|
| `ultimos_4_digitos` | texto plano (são apenas 4 dígitos não-PCI) | `****1234` | `1234` |
| `chave_recebedora` (Pix CPF/CNPJ) | criptografado | `***.***.***-12` | full |
| `chave_recebedora` (Pix e-mail) | criptografado | `j***@empresa.com` | full |
| `chave_recebedora` (Pix telefone) | criptografado | `(11) ****-1234` | full |
| `link_url` | texto plano | `https://link.../...{ultimos_8}` | full |
| `comprovante_storage_path` | texto plano | URL assinada com expiração 5 min | — |

---

## FIM DO DOCUMENTO 01

> Próxima leitura recomendada: `02_PLANILHA_EXCEL_ESPECIFICACAO_COMPLETA.md`.

