-- REVERSA da migration 20260504400500_rbac_sessao6_feriado_modify.sql

DROP POLICY IF EXISTS feriado_modify ON public.feriado;

CREATE POLICY feriado_modify ON public.feriado
  FOR ALL TO authenticated
  USING      (public.fn_tem_papel('admin'::character varying))
  WITH CHECK (public.fn_tem_papel('admin'::character varying));
