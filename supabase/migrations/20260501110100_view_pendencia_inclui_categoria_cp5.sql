-- CP5.2 — adiciona categoria e dados_categoria à view pendencia
-- (no FINAL da projeção, porque CREATE OR REPLACE VIEW só permite
-- ADICIONAR colunas e não reordenar / renomear).

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
  END AS severidade,
  -- CP5: novas colunas adicionadas no FINAL para passar pelo CREATE OR REPLACE.
  l.categoria,
  l.dados_categoria
FROM public.lancamento l
JOIN public.caixa c ON c.id = l.caixa_id
WHERE l.estado IN ('pendente'::estado_lancamento,
                   'em_preenchimento'::estado_lancamento,
                   'completo'::estado_lancamento);

COMMENT ON VIEW public.pendencia IS
  'Lancamentos que precisam de atencao do Operador: pendente (sem categoria), '
  'em_preenchimento (legado) e completo (categorizado, sem finalizacao). '
  'Estados terminais (finalizado, cancelado_pos, excluido) ficam fora. '
  'CP5: inclui categoria e dados_categoria para filtros do cliente.';
