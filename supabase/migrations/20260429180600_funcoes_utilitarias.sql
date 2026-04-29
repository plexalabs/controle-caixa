-- Migration 007: funções utilitárias usadas em views, RPCs e RLS.

-- Conta dias úteis (seg-sáb, exceto feriados ativos) entre duas datas inclusive.
-- STABLE porque depende da tabela `feriado` (não é IMMUTABLE).
CREATE OR REPLACE FUNCTION public.dias_uteis_entre(d_ini date, d_fim date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT COUNT(*)::int
    FROM generate_series(d_ini, d_fim, interval '1 day') AS dt
    WHERE EXTRACT(ISODOW FROM dt) < 7  -- 1=seg, 2=ter, ..., 6=sáb (exclui 7=dom).
      AND dt::date NOT IN (SELECT data FROM public.feriado WHERE ativo = true);
$$;

COMMENT ON FUNCTION public.dias_uteis_entre IS
'Conta dias úteis (seg-sáb, exceto feriados ativos) entre d_ini e d_fim inclusive. Usada em pendencia.idade_dias_uteis.';

-- Helper imutável para construir nome de aba Excel a partir de uma data.
CREATE OR REPLACE FUNCTION public.fn_nome_aba_excel(d date)
RETURNS varchar
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT 'Caixa ' ||
           lpad(extract(day   from d)::int::text, 2, '0') || '-' ||
           lpad(extract(month from d)::int::text, 2, '0');
$$;

-- Helper imutável para construir nome de aba Web (com barra).
CREATE OR REPLACE FUNCTION public.fn_nome_aba_web(d date)
RETURNS varchar
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT 'Caixa ' ||
           lpad(extract(day   from d)::int::text, 2, '0') || '/' ||
           lpad(extract(month from d)::int::text, 2, '0');
$$;
