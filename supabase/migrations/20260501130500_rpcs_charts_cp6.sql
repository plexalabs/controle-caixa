-- CP6.4 — RPCs para charts no dashboard.

CREATE OR REPLACE FUNCTION public.serie_diaria_caixa(p_dias_atras integer DEFAULT 30)
RETURNS TABLE(
  data              date,
  total_valor       numeric(12,2),
  total_lancamentos integer,
  estado            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT data, total_valor, total_lancamentos, estado::text
  FROM public.caixa
  WHERE data >= current_date - p_dias_atras
  ORDER BY data ASC;
$$;

COMMENT ON FUNCTION public.serie_diaria_caixa(integer) IS
  'CP6.4 — caixas diários dos últimos N dias para o bar chart de movimento.';

GRANT EXECUTE ON FUNCTION public.serie_diaria_caixa(integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.distribuicao_categoria_mes(p_mes_ref date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  categoria         text,
  total_valor       numeric(12,2),
  total_lancamentos integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    l.categoria::text,
    sum(l.valor_nf)::numeric(12,2),
    count(*)::integer
  FROM public.lancamento l
  JOIN public.caixa c ON c.id = l.caixa_id
  WHERE c.data >= date_trunc('month', p_mes_ref)::date
    AND c.data <  (date_trunc('month', p_mes_ref) + interval '1 month')::date
    AND l.estado NOT IN ('cancelado','cancelado_pos','excluido')
    AND l.categoria IS NOT NULL
  GROUP BY l.categoria
  ORDER BY 2 DESC;
$$;

COMMENT ON FUNCTION public.distribuicao_categoria_mes(date) IS
  'CP6.4 — distribuição de valor e contagem por categoria no mês de referência. '
  'Exclui cancelado/cancelado_pos/excluido. Ordenado por valor descendente.';

GRANT EXECUTE ON FUNCTION public.distribuicao_categoria_mes(date) TO authenticated;
