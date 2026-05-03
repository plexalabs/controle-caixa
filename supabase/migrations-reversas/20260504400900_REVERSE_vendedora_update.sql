-- REVERSA da migration 20260504400900_rbac_sessao6_vendedora_update.sql

DROP POLICY IF EXISTS vendedora_update ON public.vendedora;

CREATE POLICY vendedora_update ON public.vendedora
  FOR UPDATE TO authenticated
  USING (
    public.fn_tem_papel('admin'::character varying)
    OR public.fn_tem_papel('operador'::character varying)
  );
