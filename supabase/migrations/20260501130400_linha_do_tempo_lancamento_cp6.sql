-- CP6.3A — RPC que consolida em uma única consulta os eventos do
-- ciclo de vida de um lancamento (criacao + observacoes). Os
-- desfechos finalizado/cancelado_pos ja viram observacoes automaticas
-- no CP4 (fonte='finalizar'/'cancelar_pos'), entao a timeline cobre
-- tudo via observacoes + criacao.

CREATE OR REPLACE FUNCTION public.linha_do_tempo_lancamento(p_lancamento_id uuid)
RETURNS TABLE(
  evento_tipo  text,
  ocorrido_em  timestamptz,
  autor_id     uuid,
  autor_email  text,
  conteudo     jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    'criacao'::text                                                                AS evento_tipo,
    l.criado_em                                                                    AS ocorrido_em,
    l.criado_por                                                                   AS autor_id,
    coalesce(u.email, '—')                                                         AS autor_email,
    jsonb_build_object(
      'numero_nf',     l.numero_nf,
      'valor_nf',      l.valor_nf,
      'cliente_nome',  l.cliente_nome,
      'codigo_pedido', l.codigo_pedido
    )                                                                              AS conteudo
  FROM public.lancamento l
  LEFT JOIN auth.users u ON u.id = l.criado_por
  WHERE l.id = p_lancamento_id

  UNION ALL

  SELECT
    CASE o.fonte
      WHEN 'finalizar'    THEN 'finalizacao'
      WHEN 'cancelar_pos' THEN 'cancelamento_pos'
      WHEN 'sistema'      THEN 'sistema'
      ELSE                     'observacao'
    END                                                                            AS evento_tipo,
    o.criado_em                                                                    AS ocorrido_em,
    o.autor_id                                                                     AS autor_id,
    coalesce(o.autor_email, '—')                                                   AS autor_email,
    jsonb_build_object('texto', o.texto, 'fonte', o.fonte)                         AS conteudo
  FROM public.lancamento_observacao o
  WHERE o.lancamento_id = p_lancamento_id

  ORDER BY 2 DESC;
$$;

COMMENT ON FUNCTION public.linha_do_tempo_lancamento(uuid) IS
  'CP6.3 — timeline consolidada de um lancamento. Une criacao + observacoes '
  '(automaticas e manuais). Os desfechos finalizar/cancelar_pos chegam aqui '
  'classificados como tipo proprio para a UI estilizar.';

GRANT EXECUTE ON FUNCTION public.linha_do_tempo_lancamento(uuid) TO authenticated;
