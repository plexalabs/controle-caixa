# Smoke Test — Fase 2 Backend (CP4 fluxo "em análise")

Data da execução: **2026-05-01** (após aplicação das migrations 201–209).
Executor: agente via MCP Supabase + role `authenticated` simulando o
operador `joaopedro@plexalabs.com` (admin+operador).

## Setup

- Projeto: `controle-caixa-prod` (`shjtwrojdgotmxdbpbta`)
- 4 migrations CP4 aplicadas:
  - 201 `estado_lancamento_finalizado_cancelado_pos`
  - 202 `lancamento_observacao_imutavel`
  - 203 `trigger_travar_lancamento_pos_categoria`
  - 204 `realtime_lancamento_observacao`
- 4 RPCs novas + `upsert_lancamento` ajustado:
  - 205 `rpc_adicionar_observacao`
  - 206 `rpc_categorizar_lancamento`
  - 207 `rpc_marcar_finalizado_e_cancelado_pos`
  - 208 `rpc_upsert_lancamento_minimal`
- View `pendencia` + RPC `dashboard_resumo` atualizadas (209).
- Script `tools/migrar_temporarios.sql` rodado 2× (idempotente).

## Resultado

| #   | Teste                                                                | Resultado | Nota                                                                              |
|-----|-----------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------|
| 1   | Criar minimal: `upsert_lancamento(categoria=null)` → `estado=pendente` | ✅        | id_t1 = `fd0a09…1b4f`, estado=`pendente`, categoria=null                          |
| 2   | Categorizar pendente → completo                                       | ✅        | `categorizar_lancamento(id, pix, dados)` retornou `estado=completo`               |
| 3   | Categorizar item já completo                                          | ✅        | `ERRCODE 23514: Apenas lançamentos pendentes podem ser categorizados.`            |
| 4   | UPDATE direto em item categorizado                                    | ✅        | `ERRCODE 23514: Lançamento já categorizado não pode ter categoria... alterados.`  |
| 5   | UPDATE em observação (mesmo `service_role`)                           | ✅        | `ERRCODE 23514: Observação de lançamento é imutável (auditoria).`                 |
| 6   | DELETE em observação (mesmo `service_role`)                           | ✅        | `ERRCODE 23514: Observação de lançamento é imutável (auditoria).`                 |
| 7   | `marcar_finalizado` em completo                                       | ✅        | estado=`finalizado`, `resolvido_em` preenchido, observação `fonte=finalizar` criada |
| 8   | `marcar_finalizado` em pendente                                       | ✅        | `ERRCODE 23514: Só lançamentos completos podem ser finalizados.`                  |
| 9   | `marcar_cancelado_pos` em completo                                    | ✅        | estado=`cancelado_pos`, observação `fonte=cancelar_pos` criada com motivo embutido |
| 10  | Migração idempotente (2× rodada)                                      | ✅        | `obs_total=1` antes, `obs_total=1` depois; `cancelado_pos=1` antes/depois         |

## Snapshot pós-testes

```
lanc_finalizado:    1   (NF-CP4-T1)
lanc_cancelado_pos: 2   (NF-CP4-T9 + 1 da migração de placeholder JSON)
lanc_obs_total:     4   (1 manual de teste + 1 finalizar + 1 cancelar_pos + 1 sistema-migracao)
lanc_obs_finalizar: 1
lanc_obs_cancelar:  1
```

## Decisões pontuais durante a execução

- **`dashboard_resumo` precisou DROP+CREATE** (não `CREATE OR REPLACE`) porque a assinatura mudou — adicionou 3 colunas no `RETURNS TABLE`. Postgres não permite mudança de tipo de retorno via `OR REPLACE`.
- **Trigger anti-mudança convive com a `fn_validar_dados_categoria` existente.** Ordem alfabética das `BEFORE UPDATE` em `lancamento`: `_atualizar_ts`, `_hash`, `_travar_pos_categoria`, `_validar_dados`. A trava roda antes da validação — fail-fast em UPDATEs ilegais.
- **RLS de `lancamento_observacao` filtra UPDATE/DELETE silenciosamente** para `authenticated` (sem policy → 0 linhas afetadas). A trigger só dispara em `service_role` (que pula RLS). Os 2 testes (T5/T6) precisaram ser feitos via `SET LOCAL ROLE service_role` para confirmar que a imutabilidade vale **mesmo para quem ignora RLS** — o que é a garantia de auditoria.
- **`upsert_lancamento` rejeita atualização em estado travado ANTES da trigger disparar**, com mensagem mais útil apontando para a RPC adequada (`categorizar_lancamento` / `marcar_finalizado` / `marcar_cancelado_pos`).
- **`dados_categoria` ruidoso fica.** Items migrados de placeholder JSON ainda têm `dados_categoria.estado_final` etc. — a trigger anti-mudança bloqueia limpar pós-transição, e desativar trigger não é privilégio disponível em Supabase Cloud. Frontend CP4 ignora as chaves antigas (lê `lancamento_observacao` e estado do enum).

## Pendências conhecidas

- **Triggers de auditoria existentes (`trg_lancamento_audit`, `trg_lancamento_recalcular_caixa`, etc.) não foram revisadas** para os novos estados. Se algum desses precisar tratar `finalizado`/`cancelado_pos` especificamente, fica para uma sub-rodada. Hoje eles funcionam genericamente (recalculam totais sem distinção).
- **`fn_recalcular_caixa`** atualmente exclui `cancelado/excluido` do `total_valor`. Não inclui `cancelado_pos` — vale revisar se o caixa deveria descontar ou não esses cancelamentos pós. Se sim, é um one-line add ao filtro.
