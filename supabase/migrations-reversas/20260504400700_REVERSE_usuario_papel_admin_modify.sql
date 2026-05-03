-- REVERSA da migration 20260504400700_rbac_sessao6_usuario_papel_admin_modify.sql

DROP POLICY IF EXISTS usuario_papel_admin_modify ON public.usuario_papel;

CREATE POLICY usuario_papel_admin_modify ON public.usuario_papel
  FOR ALL TO authenticated
  USING      (public.fn_tem_papel('admin'::character varying))
  WITH CHECK (public.fn_tem_papel('admin'::character varying));
