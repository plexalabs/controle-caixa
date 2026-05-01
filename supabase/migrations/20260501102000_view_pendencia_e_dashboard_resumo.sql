-- Migration 209: atualiza view pendencia e RPC dashboard_resumo para o
-- ciclo de vida CP4 (estados finalizado e cancelado_pos).
--
-- View pendencia:
--   ANTES: estado IN ('pendente','em_preenchimento')
--   DEPOIS: estado IN ('pendente','em_preenchimento','completo')
--   Justificativa: "completo" e categorizado mas ainda nao finalizado/cancelado.
--   E uma pendencia que cabe ao Operador resolver (avisar cliente, etc).
--   "finalizado" e "cancelado_pos" sao estados terminais — saem da view.
--
-- RPC dashboard_resumo:
--   Adiciona 3 contagens novas (sem quebrar os campos existentes):
--   - total_em_analise          (estado=pendente, categoria IS NULL)
--   - total_finalizadas_hoje    (estado=finalizado, resolvido_em::date = hoje)
--   - total_canceladas_pos_hoje (estado=cancelado_pos, atualizado_em::date = hoje)

-- ── 3A. View pendencia ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.pendencia AS
SELECT
  l.id,
  l.caixa_id,
  c.data AS data_caixa,
  l.numero_nf,
  l.codigo_pedido,
  l.cliente_nome,
  l.valor_nf,
  l.estado,
  l.criado_em,
  l.atualizado_em,
  l.criado_por,
  EXTRACT(day FROM age(now(), l.criado_em))::integer AS idade_dias_corridos,
  dias_uteis_entre(l.criado_em::date, CURRENT_DATE) AS idade_dias_uteis,
  CASE
    WHEN dias_uteis_entre(l.criado_em::date, CURRENT_DATE) >
         COALESCE((SELECT valor::text::integer FROM config
                    WHERE chave::text = 'pendencia.dias_alerta_atraso'),
                  3)
      THEN 'urgente'::text
    WHEN dias_uteis_entre(l.criado_em::date, CURRENT_DATE) > 1
      THEN 'aviso'::text
    ELSE 'normal'::text
  END AS severidade
FROM public.lancamento l
JOIN public.caixa c ON c.id = l.caixa_id
WHERE l.estado IN ('pendente'::estado_lancamento,
                   'em_preenchimento'::estado_lancamento,
                   'completo'::estado_lancamento);

COMMENT ON VIEW public.pendencia IS
  'Lancamentos que precisam de atencao do Operador: pendente (sem categoria), '
  'em_preenchimento (legado) e completo (categorizado, sem finalizacao). '
  'Estados terminais (finalizado, cancelado_pos, excluido) ficam fora.';

-- ── 3B. RPC dashboard_resumo com 3 campos novos ───────────────────────
-- DROP necessario porque mudamos o RETURNS TABLE (nao da pra alterar
-- via CREATE OR REPLACE — Postgres exige DROP em mudanca de assinatura).
DROP FUNCTION IF EXISTS public.dashboard_resumo(date, date);

CREATE FUNCTION public.dashboard_resumo(
  p_data_ini date DEFAULT (CURRENT_DATE - interval '30 days')::date,
  p_data_fim date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  total_lancamentos          bigint,
  total_pendentes            bigint,
  total_cancelados           bigint,
  valor_liquido              numeric,
  por_categoria              jsonb,
  por_dia                    jsonb,
  total_em_analise           bigint,
  total_finalizadas_hoje     bigint,
  total_canceladas_pos_hoje  bigint
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT l.*, c.data AS data_caixa
    FROM public.lancamento l
    JOIN public.caixa c ON c.id = l.caixa_id
    WHERE c.data BETWEEN p_data_ini AND p_data_fim
      AND l.estado <> 'excluido'
  ),
  cat AS (
    SELECT COALESCE(jsonb_object_agg(categoria::text, cnt), '{}'::jsonb) AS por_categoria
    FROM (
      SELECT COALESCE(categoria::text, 'pendente') AS categoria, COUNT(*) AS cnt
      FROM base GROUP BY categoria
    ) c
  ),
  dia AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('data', data, 'total', total) ORDER BY data), '[]'::jsonb) AS por_dia
    FROM (
      SELECT data_caixa AS data, COUNT(*) AS total
      FROM base GROUP BY data_caixa
    ) d
  )
  SELECT
    (SELECT COUNT(*) FROM base),
    (SELECT COUNT(*) FROM base WHERE estado IN ('pendente','em_preenchimento','completo')),
    (SELECT COUNT(*) FROM base WHERE estado IN ('cancelado','cancelado_pos') OR categoria = 'cancelado'),
    (SELECT COALESCE(SUM(valor_nf), 0) FROM base
       WHERE estado NOT IN ('cancelado','cancelado_pos')
         AND (categoria IS NULL OR categoria <> 'cancelado')),
    cat.por_categoria,
    dia.por_dia,
    -- Campos novos do CP4:
    (SELECT COUNT(*) FROM base WHERE estado = 'pendente' AND categoria IS NULL),
    (SELECT COUNT(*) FROM public.lancamento
       WHERE estado = 'finalizado'
         AND resolvido_em::date = CURRENT_DATE),
    (SELECT COUNT(*) FROM public.lancamento
       WHERE estado = 'cancelado_pos'
         AND atualizado_em::date = CURRENT_DATE)
  FROM cat, dia;
$$;

COMMENT ON FUNCTION public.dashboard_resumo(date, date) IS
  'Resumo agregado para o Dashboard. Retorna contadores e distribuicao no '
  'periodo, mais 3 campos CP4: total_em_analise, total_finalizadas_hoje, '
  'total_canceladas_pos_hoje. Pendentes ja inclui "completo" (sem desfecho).';
