-- CP6.1D — dashboard_resumo le total_finalizado/cancelado_pos da tabela caixa
-- (mais barato que count na lancamento) e ganha valores monetarios.
-- DROP necessario porque a assinatura RETURNS TABLE muda.

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
  total_canceladas_pos_hoje  bigint,
  valor_finalizado_hoje      numeric,
  valor_cancelado_pos_hoje   numeric
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
    (SELECT COUNT(*) FROM base WHERE estado = 'pendente' AND categoria IS NULL),
    -- Hoje (com fallback 0 se nao houver caixa de hoje)
    (SELECT COALESCE((SELECT total_finalizado    FROM public.caixa WHERE data = CURRENT_DATE), 0))::bigint,
    (SELECT COALESCE((SELECT total_cancelado_pos FROM public.caixa WHERE data = CURRENT_DATE), 0))::bigint,
    (SELECT COALESCE((SELECT valor_finalizado    FROM public.caixa WHERE data = CURRENT_DATE), 0))::numeric,
    (SELECT COALESCE((SELECT valor_cancelado_pos FROM public.caixa WHERE data = CURRENT_DATE), 0))::numeric
  FROM cat, dia;
$$;

COMMENT ON FUNCTION public.dashboard_resumo(date, date) IS
  'CP6 — usa colunas auxiliares de caixa (total_finalizado, valor_finalizado, '
  'total_cancelado_pos, valor_cancelado_pos) em vez de contar de lancamento. '
  'Adiciona valor_finalizado_hoje e valor_cancelado_pos_hoje ao retorno. '
  'Retorna 0 (nao NULL) para campos de hoje quando nao ha caixa de hoje.';
