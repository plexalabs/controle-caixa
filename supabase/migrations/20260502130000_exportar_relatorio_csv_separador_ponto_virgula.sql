-- CP7-FIX — exportar_relatorio_csv usa ponto-vírgula como separador
--
-- Excel pt-BR (e LibreOffice em locale BR) usa `;` como separador padrão.
-- Com `,` o Excel jogava todas as colunas numa única célula.
--
-- Vantagem extra: vírgula deixa de ser ambígua, então o valor "128,50"
-- (decimal pt-BR) já não precisa ser aspeado pra preservar a coluna.
-- Mantemos o csv_escape pra cobrir campos com `;`, aspas ou newline.
--
-- BOM UTF-8 mantido — garante acentos certos no Excel.

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
  v_header := 'Data;Numero NF;Cliente;Valor;Categoria;Estado;Detalhes;Criado em;Resolvido em;Observacoes';

  SELECT string_agg(
           to_char(linha.data, 'DD/MM/YYYY') || ';' ||
           public.csv_escape(linha.numero_nf) || ';' ||
           public.csv_escape(linha.cliente_nome) || ';' ||
           -- Valor com vírgula decimal pt-BR. Como agora o separador é `;`,
           -- a vírgula NÃO ambígua mais — sem aspas necessárias.
           replace(coalesce(linha.valor_nf::text, ''), '.', ',') || ';' ||
           public.csv_escape(linha.categoria) || ';' ||
           public.csv_escape(linha.estado) || ';' ||
           public.csv_escape(linha.resumo_dados) || ';' ||
           to_char(linha.criado_em, 'DD/MM/YYYY HH24:MI') || ';' ||
           coalesce(to_char(linha.resolvido_em, 'DD/MM/YYYY HH24:MI'), '') || ';' ||
           linha.observacoes_qtd::text,
           E'\n'
           ORDER BY linha.data, linha.numero_nf
         )
    INTO v_corpo
    FROM public.gerar_relatorio_periodo(p_data_inicio, p_data_fim, p_categorias, p_estados) AS linha;

  RETURN E'\xEF\xBB\xBF' || v_header || E'\n' || coalesce(v_corpo, '');
END;
$$;

-- csv_escape continua igual: agora rejeita também `;` (já estava na regex).
-- Conferência:
--   '[,;"\n\r]' bate em ponto-vírgula → fields com `;` interno serão aspeados.
