-- REVERSA da migration 20260504400800_rbac_sessao6_vendedora_insert.sql

DROP POLICY IF EXISTS vendedora_insert ON public.vendedora;

CREATE POLICY vendedora_insert ON public.vendedora
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_tem_papel('admin'::character varying)
    OR public.fn_tem_papel('operador'::character varying)
  );
