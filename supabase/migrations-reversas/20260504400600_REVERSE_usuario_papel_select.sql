-- REVERSA da migration 20260504400600_rbac_sessao6_usuario_papel_select.sql

DROP POLICY IF EXISTS usuario_papel_select ON public.usuario_papel;

CREATE POLICY usuario_papel_select ON public.usuario_papel
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.fn_tem_papel('admin'::character varying)
  );
