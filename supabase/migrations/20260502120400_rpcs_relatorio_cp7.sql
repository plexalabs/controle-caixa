-- CP7.4 — RPCs para a tela de Relatórios
--
-- gerar_relatorio_periodo: linhas estruturadas, com filtros opcionais.
--   Acesso: admin OU operador (operador também precisa exportar pra contação).
--
-- exportar_relatorio_csv: monta CSV com BOM UTF-8 (Excel abre acentos certos).
--   Reutiliza gerar_relatorio_periodo para garantir mesma fonte de dados.
--
-- csv_escape: helper para campos com vírgula, aspas, ponto-e-vírgula ou newline.

-- ─── csv_escape (helper imutável) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.csv_escape(p_valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_valor IS NULL THEN ''
    WHEN p_valor ~ '[,;"\n\r]' THEN '"' || replace(p_valor, '"', '""') || '"'
    ELSE p_valor
  END;
$$;

GRANT EXECUTE ON FUNCTION public.csv_escape(text) TO authenticated;

-- ─── gerar_relatorio_periodo ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gerar_relatorio_periodo(
  p_data_inicio date,
  p_data_fim    date,
  p_categorias  public.categoria_lancamento[] DEFAULT NULL,
  p_estados     text[]                        DEFAULT NULL
)
RETURNS TABLE(
  lancamento_id   uuid,
  caixa_id        uuid,
  data            date,
  numero_nf       text,
  cliente_nome    text,
  valor_nf        numeric(12,2),
  categoria       text,
  estado          text,
  resumo_dados    text,
  criado_em       timestamptz,
  resolvido_em    timestamptz,
  observacoes_qtd integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem usuário autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_papel
     WHERE usuario_id = auth.uid()
       AND papel IN ('admin','operador')
       AND ativo = true
  ) THEN
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
    -- Resumo formatado da categoria — mesma semântica do resumoDetalhes() JS
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
$$;

GRANT EXECUTE ON FUNCTION public.gerar_relatorio_periodo(date, date, public.categoria_lancamento[], text[]) TO authenticated;

-- ─── exportar_relatorio_csv ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exportar_relatorio_csv(
  p_data_inicio date,
  p_data_fim    date,
  p_categorias  public.categoria_lancamento[] DEFAULT NULL,
  p_estados     text[]                        DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_header text;
  v_corpo  text;
BEGIN
  -- Mesmo guardião da gerar_relatorio_periodo (que é STABLE/SECDEF) — vou
  -- chamar diretamente e ela rejeita não-autorizados.

  v_header := 'Data,Numero NF,Cliente,Valor,Categoria,Estado,Detalhes,Criado em,Resolvido em,Observacoes';

  SELECT string_agg(
           to_char(linha.data, 'DD/MM/YYYY') || ',' ||
           public.csv_escape(linha.numero_nf) || ',' ||
           public.csv_escape(linha.cliente_nome) || ',' ||
           -- Valor com vírgula decimal pt-BR. csv_escape aspeia para evitar
           -- que Excel quebre "128,50" em duas colunas (vírgula é separador).
           public.csv_escape(replace(coalesce(linha.valor_nf::text, ''), '.', ',')) || ',' ||
           public.csv_escape(linha.categoria) || ',' ||
           public.csv_escape(linha.estado) || ',' ||
           public.csv_escape(linha.resumo_dados) || ',' ||
           to_char(linha.criado_em, 'DD/MM/YYYY HH24:MI') || ',' ||
           coalesce(to_char(linha.resolvido_em, 'DD/MM/YYYY HH24:MI'), '') || ',' ||
           linha.observacoes_qtd::text,
           E'\n'
           ORDER BY linha.data, linha.numero_nf
         )
    INTO v_corpo
    FROM public.gerar_relatorio_periodo(p_data_inicio, p_data_fim, p_categorias, p_estados) AS linha;

  -- BOM UTF-8 garante que Excel abra acentos certos (sem isso, "São José"
  -- vira "S?o Jos?"). Header fim de linha CRLF para máxima compatibilidade.
  RETURN E'\xEF\xBB\xBF' || v_header || E'\n' || coalesce(v_corpo, '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.exportar_relatorio_csv(date, date, public.categoria_lancamento[], text[]) TO authenticated;
