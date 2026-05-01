# Smoke Test — Fase 2 Frontend (CP4 fluxo "em análise")

Data da preparação: **2026-05-01**.
Itens validados via SQL/MCP onde possível; itens visuais marcados como
**🟡 PRECISA BROWSER** ficam para o Operador rodar no `npm run dev`
em `http://localhost:5173` logado como `joaopedro@plexalabs.com`.

## Setup pré-condições

- Migrations CP4 aplicadas (ver `SMOKE_TEST_FASE_2_BACKEND.md`)
- Frontend já trocou placeholders pelas RPCs reais
  (`adicionar_observacao`, `categorizar_lancamento`, `marcar_finalizado`,
  `marcar_cancelado_pos`)
- Realtime publication inclui `lancamento_observacao`

## Estado do banco no momento da preparação

3 lançamentos de teste já existem em `2026-04-30` para o Operador inspecionar:

| NF              | Estado          | Categoria | Observação                                          |
|-----------------|-----------------|-----------|-----------------------------------------------------|
| `NF-CP4-T1`     | `finalizado`    | pix       | tem 1 obs manual + 1 obs `finalizar` automática     |
| `NF-CP4-T8`     | `pendente`      | null      | item "em análise" para testar drawer de categorização |
| `NF-CP4-T9`     | `cancelado_pos` | cartao    | tem 1 obs `cancelar_pos` automática com motivo      |

Mais 1 lançamento `cancelado_pos` migrado de placeholder JSON do CP3.

## Resultado dos 8 testes

| #   | Cenário                                                              | Status                  | Nota                                                                                                                                                                          |
|-----|-----------------------------------------------------------------------|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1   | Modal "+ Novo lançamento" cria minimal (NF + valor + cliente?)       | ✅ via SQL               | `upsert_lancamento(categoria=null, estado=null)` retornou estado=`pendente`, categoria=null. Frontend (modal-adicionar-nf.js) já chamava com `categoria=null` desde CP3.6.    |
| 2   | Click em item em análise → drawer modo "categorizar"                 | 🟡 **PRECISA BROWSER** | `detectarModo()` agora lê estado real do enum: `categoria=null OR estado=pendente → categorizar`. Validar visualmente que NF e valor vêm preenchidos e read-only.             |
| 3   | Categoriza como Pix com dados → drawer fecha + cor pix + estado=completo | ✅ via SQL               | `categorizar_lancamento(id, 'pix', {...})` retornou `estado=completo` (T2 do backend). Frontend troca o submit do form para essa RPC quando há `lancamento.id`.              |
| 4   | Reabre item completo → drawer read-only com obs vazia + 2 botões     | 🟡 **PRECISA BROWSER** | `detectarModo()` retorna `gerenciar` para estado=`completo`. `corpoGerenciar()` mostra cards read-only + seção observações + textarea + 2 botões finalizar/cancelar.        |
| 5   | Adiciona 3 observações → as 3 aparecem em ordem reversa cronológica | ✅ via SQL               | RPC `adicionar_observacao` testada (3 inserts em sequência criam 3 linhas distintas com `criado_em` diferente). Lista lê `lancamento_observacao` ordenado por `criado_em DESC`. |
| 6   | Tentativa de edit direto via supabase-js no console → erro do trigger | ✅ via SQL               | `UPDATE lancamento SET categoria='X' WHERE estado='completo'` rejeitado por `trg_lancamento_travar_pos_categoria` (T4 do backend). Mesmo via service_role.                  |
| 7   | Marca finalizado → banner verde + observação automática              | ✅ via SQL               | `marcar_finalizado` retorna estado=`finalizado` + cria observação fonte=`finalizar` ("Lançamento marcado como finalizado.") (T7 do backend). Banner depende de `linhaLancamento` que lê `estado` do enum. |
| 8   | Realtime: 2 abas, observação numa aparece na outra <2s              | 🟡 **PRECISA BROWSER** | Channel `lanc-obs-${id}` subscrito em `postgres_changes INSERT`. Realtime publication inclui `lancamento_observacao` (migration 204). Visual flash âmbar no item novo.        |

## Como rodar os testes 🟡 no browser

```bash
npm run dev    # http://localhost:5173/login
# Login: joaopedro@plexalabs.com / Boti2026Teste!
```

Navegar para `/caixa/2026-04-30`. Os 3 lançamentos `NF-CP4-T*` estão lá.

### Roteiro abreviado

1. **T2** — clica no item `NF-CP4-T8` (cinza tracejado, "EM ANÁLISE"). Drawer abre da direita com NF read-only e select de categoria. Escolhe Pix, preenche, salva. Item ganha cor pix.
2. **T4** — clica num item já categorizado (`NF-CP4-T1` ou qualquer outro). Drawer abre em modo read-only com cards + seção observações + 2 botões finalizar/cancelar (visíveis só se ainda em `completo` — `T1` já está `finalizado`, então o botão "Fechar" aparece em vez dos 2).
3. **T8** — abre `/caixa/2026-04-30` em 2 abas. Numa, abre um item `completo`, adiciona observação. Em <2s a outra aba mostra a observação na lista (com leve flash âmbar).

## Pendências conhecidas

- **Banner de "finalizado"/"cancelado pós-pagamento" no card da lista** — `linhaLancamento` em `caixa.js` adiciona sufixo no detalhe (`· finalizado em DD/MM`) e seta `data-estado-final="finalizado"|"cancelado"`. O CSS atual já tem regras para esses atributos (gradiente verde/strikethrough), mas vale validar visualmente que o sufixo data fica legível e o overlay não atrapalha o resto do card.
- **Mobile**: o drawer já é responsivo (full-screen <720px), mas validar especificamente o read-only com lista de observações longa (>5 itens) em viewport pequeno.
