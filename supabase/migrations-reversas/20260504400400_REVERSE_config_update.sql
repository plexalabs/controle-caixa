-- REVERSA da migration 20260504400400_rbac_sessao6_config_update.sql

DROP POLICY IF EXISTS config_update ON public.config;

CREATE POLICY config_update ON public.config
  FOR UPDATE TO authenticated
  USING      (public.fn_tem_papel('admin'::character varying) AND editavel = true)
  WITH CHECK (public.fn_tem_papel('admin'::character varying) AND editavel = true);
