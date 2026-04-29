-- Migration 008: view derivada `pendencia`.
-- Lista lançamentos em estado pendente/em_preenchimento, com cálculo de idade
-- em dias úteis e severidade visual conforme config.pendencia.dias_alerta_atraso.

CREATE OR REPLACE VIEW public.pendencia
WITH (security_invoker = true)
AS
SELECT
    l.id,
    l.caixa_id,
    c.data                                 AS data_caixa,
    l.numero_nf,
    l.codigo_pedido,
    l.cliente_nome,
    l.valor_nf,
    l.estado,
    l.criado_em,
    l.atualizado_em,
    l.criado_por,
    EXTRACT(DAY FROM age(now(), l.criado_em))::int AS idade_dias_corridos,
    public.dias_uteis_entre(l.criado_em::date, current_date) AS idade_dias_uteis,
    CASE
        WHEN public.dias_uteis_entre(l.criado_em::date, current_date) >
             COALESCE((SELECT (valor::text)::int FROM public.config WHERE chave = 'pendencia.dias_alerta_atraso'), 3)
        THEN 'urgente'
        WHEN public.dias_uteis_entre(l.criado_em::date, current_date) > 1
        THEN 'aviso'
        ELSE 'normal'
    END AS severidade
FROM public.lancamento l
JOIN public.caixa c ON c.id = l.caixa_id
WHERE l.estado IN ('pendente', 'em_preenchimento');

COMMENT ON VIEW public.pendencia IS
'Lançamentos em aberto com idade em dias úteis e severidade. SECURITY INVOKER respeita RLS do invocador.';
