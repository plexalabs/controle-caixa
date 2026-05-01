# Próxima rodada — Backend para o fluxo "Em análise" → "Finalizado / Cancelado"

> **Contexto.** O frontend (CP3.5/CP3.6) já entrega o fluxo completo, mas
> persistência depende de campos ad-hoc dentro de `dados_categoria` JSONB
> (`estado_final`, `observacoes[]`). Esta rodada formaliza o backend.

## Decisões alinhadas (mantidas dos prompts anteriores)

1. **`cancelado` permanece como categoria** (NF nasceu cancelada, sem
   pagamento). E **vira também um movimento de estado** quando uma NF
   já categorizada como Cartão/Pix/Dinheiro/Link é cancelada *depois*.
   Os dois caminhos coexistem.
2. **Observações ilimitadas em tabela própria.** Histórico imutável,
   com autor e timestamp. Estilo audit_log.

---

## 1. Migration: `estado_lancamento` enum

Hoje o enum tem `pendente, em_preenchimento, completo, resolvido,
cancelado, excluido`. Reinterpretação:

| Estado                  | Significado novo                                     |
|-------------------------|-------------------------------------------------------|
| `pendente`              | Em análise (NF + valor, sem categoria) — já existe.  |
| `em_preenchimento`      | Deprecado (manter no enum, não criar novos).         |
| `completo`              | Categoria definida, aguardando desfecho.             |
| `resolvido`             | **Finalizado** (cliente buscou). Renomear no UI.     |
| `cancelado`             | **Cancelado pós-pagamento** (substitui semântica).   |
| `excluido`              | Soft-delete — inalterado.                            |

**Decisão de naming**: prefiro **manter o enum como está**, só atribuindo
a nova semântica via doc + RPCs. Adicionar `finalizado` causaria mais
confusão do que ganho. O frontend pode mostrar `resolvido → "Finalizado"`
sem mexer no banco.

## 2. Migration: tabela `lancamento_observacao`

```sql
CREATE TABLE public.lancamento_observacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL REFERENCES public.lancamento(id) ON DELETE CASCADE,
  texto         text NOT NULL CHECK (length(texto) >= 3 AND length(texto) <= 500),
  autor_id      uuid NOT NULL REFERENCES auth.users(id),
  autor_email   text,                              -- snapshot, ja que email muda
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lanc_obs_lancamento ON public.lancamento_observacao(lancamento_id, criado_em DESC);

-- Imutabilidade: rejeita UPDATE e DELETE (igual audit_log)
CREATE OR REPLACE FUNCTION fn_lanc_obs_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Observações de lançamento são imutáveis. Para retificar, adicione uma nova.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lanc_obs_no_update BEFORE UPDATE ON public.lancamento_observacao
  FOR EACH ROW EXECUTE FUNCTION fn_lanc_obs_imutavel();
CREATE TRIGGER trg_lanc_obs_no_delete BEFORE DELETE ON public.lancamento_observacao
  FOR EACH ROW EXECUTE FUNCTION fn_lanc_obs_imutavel();

ALTER TABLE public.lancamento_observacao ENABLE ROW LEVEL SECURITY;
```

## 3. RPCs novas

### 3.1 `adicionar_observacao(lancamento_id uuid, texto text)`
- Checa que o lancamento existe e pertence a caixa não-arquivado.
- Insere em `lancamento_observacao` com `auth.uid()` e email atual.
- Retorna o `id` da observação.

### 3.2 `categorizar_lancamento(lancamento_id uuid, categoria categoria_lancamento, dados_categoria jsonb)`
- **Só funciona se** `lancamento.estado = 'pendente'` E `categoria IS NULL`.
- Faz UPDATE: aplica `categoria`, `dados_categoria`, `estado='completo'`
  (ou `cancelado` se a nova categoria for `cancelado`).
- Bloqueado pelo trigger de imutabilidade abaixo se já saiu de pendente.

### 3.3 `marcar_finalizado(lancamento_id uuid)`
- **Só funciona se** estado atual = `completo`.
- UPDATE: `estado='resolvido'`, `resolvido_em=now()`, `resolvido_por=auth.uid()`.

### 3.4 `marcar_cancelado_pos(lancamento_id uuid, motivo text)`
- **Só funciona se** estado atual = `completo`.
- UPDATE: `estado='cancelado'` + adiciona uma observação automática
  com o motivo via `adicionar_observacao`.
- Importante: NÃO mexe em `categoria` — a categoria de pagamento original
  (Cartão/Pix/etc) fica preservada para auditoria.

## 4. Trigger anti-mudança em `lancamento`

```sql
CREATE OR REPLACE FUNCTION fn_lancamento_imutavel_apos_categorizar()
RETURNS trigger AS $$
BEGIN
  -- Permite mudar dados_categoria livremente apenas enquanto pendente.
  -- Apos categorizar, so transicoes de estado controladas via RPC sao OK.
  IF OLD.estado <> 'pendente' AND NEW.estado <> OLD.estado THEN
    -- Permite estado completo → resolvido / cancelado / excluido
    IF OLD.estado = 'completo' AND NEW.estado IN ('resolvido','cancelado','excluido') THEN
      -- ok
    ELSIF NEW.estado = 'excluido' THEN
      -- soft-delete sempre permitido
    ELSE
      RAISE EXCEPTION 'Transição de estado inválida: % → %', OLD.estado, NEW.estado;
    END IF;
  END IF;

  -- Apos sair de pendente, categoria nao muda mais.
  IF OLD.estado <> 'pendente' AND NEW.categoria IS DISTINCT FROM OLD.categoria THEN
    RAISE EXCEPTION 'Categoria do lançamento não pode mais ser alterada (estado %).', OLD.estado;
  END IF;

  -- dados_categoria pode mudar SE for so pra adicionar campos auditados
  -- (estado_final no JSON, observacoes inline). Apos a migracao para a
  -- tabela de observacoes, dados_categoria fica congelado tambem.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lanc_imutavel BEFORE UPDATE ON public.lancamento
  FOR EACH ROW EXECUTE FUNCTION fn_lancamento_imutavel_apos_categorizar();
```

## 5. View / RPC `dashboard_resumo` atualizar

- Trocar "Pendentes" para considerar **só `estado='pendente'`** (em análise).
- Adicionar contador "Em curso" para `estado='completo'`.
- "Resolvidas hoje" passa a ser "Finalizadas hoje" (mesmo enum
  `resolvido`, label novo).
- "Canceladas hoje" continua olhando `estado='cancelado'`.

## 6. Realtime publication

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamento_observacao;
```
Para que adicionar uma observação refresque o drawer aberto em outras
abas/usuários sem F5.

## 7. Migração de dados existentes (frontend → tabela)

```sql
-- Para cada lancamento que tem dados_categoria.observacoes (array JSON),
-- mover para a tabela e remover o campo do JSON.
INSERT INTO public.lancamento_observacao (lancamento_id, texto, autor_id, autor_email, criado_em)
SELECT
  l.id,
  obs->>'texto',
  COALESCE((obs->>'autor_id')::uuid, l.criado_por),
  obs->>'autor',
  COALESCE((obs->>'criado_em')::timestamptz, l.criado_em)
FROM public.lancamento l,
     jsonb_array_elements(COALESCE(l.dados_categoria->'observacoes', '[]'::jsonb)) AS obs
WHERE l.dados_categoria ? 'observacoes';

UPDATE public.lancamento
SET dados_categoria = dados_categoria - 'observacoes'
WHERE dados_categoria ? 'observacoes';
```

E para `estado_final` no JSON → coluna real:

```sql
UPDATE public.lancamento
SET estado = 'resolvido'
WHERE dados_categoria->>'estado_final' = 'finalizado'
  AND estado = 'completo';

UPDATE public.lancamento
SET estado = 'cancelado'
WHERE dados_categoria->>'estado_final' = 'cancelado'
  AND estado = 'completo';

-- Remove os campos transitórios:
UPDATE public.lancamento
SET dados_categoria = (dados_categoria
                        - 'estado_final'
                        - 'estado_final_em'
                        - 'estado_final_motivo')
WHERE dados_categoria ? 'estado_final';
```

## 8. Atualizar frontend após backend

Quando as RPCs e a tabela existirem, **substituir** no
`modal-editar-lancamento.js`:

- `persistirObservacao` → chamar `rpc('adicionar_observacao', { ... })`.
- Buscar lista de observações via `from('lancamento_observacao').select(...)`.
- `aplicarEstadoFinal('finalizado')` → chamar `rpc('marcar_finalizado', { ... })`.
- `aplicarEstadoFinal('cancelado', motivo)` → chamar `rpc('marcar_cancelado_pos', { ... })`.
- `linhaLancamento` em `caixa.js` lê `l.estado` (real) em vez de
  `l.dados_categoria.estado_final` (transitório).

## Ordem sugerida da rodada de backend

1. Migration tabela `lancamento_observacao` + RLS + triggers de imutabilidade.
2. RPCs `adicionar_observacao` + grant.
3. Trigger anti-mudança em `lancamento`.
4. RPCs `categorizar_lancamento`, `marcar_finalizado`, `marcar_cancelado_pos`.
5. Realtime publication.
6. Migração de dados (script SQL acima).
7. Frontend: trocar JSON → RPCs + queries da tabela.
8. Smoke test do fluxo completo: criar pendente → categorizar → adicionar
   3 observações → finalizar → confirmar trigger bloqueia mudar categoria.
