-- ============================================================
-- CP-RBAC Sessao 2: migra gerar_relatorio_periodo para tem_permissao()
--
-- ANTES: exigia papel IN ('admin','operador') AND ativo=true
-- DEPOIS: exige tem_permissao('relatorio.diario')
--
-- IMPACTO: operador NAO tem 'relatorio.diario' na seed RBAC
-- (so admin, gerente, contador). Se algum operador tentava ver
-- relatorios hoje, deixa de conseguir. Operador atual eh super_admin
-- via bypass; super_admin sempre passa.
--
-- Toda a query SQL (RETURN QUERY com JOIN, CASE de categoria,
-- filtros de data/categoria/estado) PRESERVADA integralmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.gerar_relatorio_periodo(
  p_data_inicio date,
  p_data_fim    date,
  p_categorias  categoria_lancamento[] DEFAULT NULL::categoria_lancamento[],
  p_estados     text[]                 DEFAULT NULL::text[]
)
RETURNS TABLE(
  lancamento_id    uuid,
  caixa_id         uuid,
  data             date,
  numero_nf        text,
  cliente_nome     text,
  valor_nf         numeric,
  categoria        text,
  estado           text,
  resumo_dados     text,
  criado_em        timestamp with time zone,
  resolvido_em     timestamp with time zone,
  observacoes_qtd  integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem usuário autenticado.' USING ERRCODE = '42501';
  END IF;

  -- Permissao: relatorio.diario (substitui check papel IN admin/operador)
  IF NOT public.tem_permissao(auth.uid(), 'relatorio.diario') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  IF p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Data fim deve ser maior ou igual à data início.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    c.id,
    c.data,
    coalesce(l.numero_nf, '')::text,
    coalesce(l.cliente_nome, '')::text,
    l.valor_nf,
    coalesce(l.categoria::text, 'em_analise'),
    l.estado::text,
    CASE l.categoria
      WHEN 'cartao' THEN
        trim(BOTH ' ' FROM
          coalesce(l.dados_categoria->>'bandeira', '') || ' ' ||
          coalesce(l.dados_categoria->>'modalidade', '') || ' ' ||
          coalesce(l.dados_categoria->>'parcelas', '1') || 'x'
        )
      WHEN 'pix' THEN
        'Pix · ' || coalesce(l.dados_categoria->>'nome_remetente', '—')
      WHEN 'dinheiro' THEN
        'Dinheiro · ' || coalesce(l.dados_categoria->>'vendedora_nome', '—')
      WHEN 'cancelado' THEN
        'Cancelado: ' || coalesce(l.dados_categoria->>'motivo', '—')
      WHEN 'cartao_link' THEN
        'Link · ' || coalesce(l.dados_categoria->>'status', '—')
      WHEN 'obs' THEN
        'Obs · ' || coalesce(l.dados_categoria->>'tipo', '—')
      ELSE ''
    END::text,
    l.criado_em,
    l.resolvido_em,
    (SELECT count(*)::integer FROM public.lancamento_observacao lo
      WHERE lo.lancamento_id = l.id)
  FROM public.lancamento l
  JOIN public.caixa c ON c.id = l.caixa_id
  WHERE c.data BETWEEN p_data_inicio AND p_data_fim
    AND (p_categorias IS NULL OR array_length(p_categorias, 1) IS NULL
         OR l.categoria = ANY(p_categorias))
    AND (p_estados IS NULL OR array_length(p_estados, 1) IS NULL
         OR l.estado::text = ANY(p_estados))
    AND l.estado <> 'excluido'
  ORDER BY c.data ASC, l.numero_nf ASC NULLS LAST;
END;
$function$;
