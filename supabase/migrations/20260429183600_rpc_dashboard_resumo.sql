-- Migration 036: RPC dashboard_resumo.
-- Retorna agregados consolidados para a tela DASHBOARD da Web.

CREATE OR REPLACE FUNCTION public.dashboard_resumo(
    p_data_ini date DEFAULT (current_date - interval '30 days')::date,
    p_data_fim date DEFAULT current_date
)
RETURNS TABLE (
    total_lancamentos bigint,
    total_pendentes   bigint,
    total_cancelados  bigint,
    valor_liquido     numeric,
    por_categoria     jsonb,
    por_dia           jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
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
            FROM base
            GROUP BY categoria
        ) c
    ),
    dia AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('data', data, 'total', total) ORDER BY data), '[]'::jsonb) AS por_dia
        FROM (
            SELECT data_caixa AS data, COUNT(*) AS total
            FROM base
            GROUP BY data_caixa
        ) d
    )
    SELECT
        (SELECT COUNT(*) FROM base),
        (SELECT COUNT(*) FROM base WHERE estado IN ('pendente','em_preenchimento')),
        (SELECT COUNT(*) FROM base WHERE categoria = 'cancelado'),
        (SELECT COALESCE(SUM(valor_nf), 0) FROM base WHERE categoria <> 'cancelado' OR categoria IS NULL),
        cat.por_categoria,
        dia.por_dia
    FROM cat, dia;
$$;

COMMENT ON FUNCTION public.dashboard_resumo IS
'Agregados para a tela Dashboard da Web. Default: ultimos 30 dias.';
