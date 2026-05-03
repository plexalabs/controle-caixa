-- REVERSA da migration 20260504400200_rbac_sessao6_sync_log_select.sql
--
-- NÃO aplicar automaticamente. Cole no Supabase Dashboard → SQL Editor
-- se queries internas que dependem de sync_log pararem de funcionar.

DROP POLICY IF EXISTS sync_log_select ON public.sync_log;

CREATE POLICY sync_log_select ON public.sync_log
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.fn_tem_papel('admin'::character varying)
    OR public.fn_tem_papel('auditor'::character varying)
  );
