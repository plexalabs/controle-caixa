-- REVERSA da migration 20260504400100_rbac_sessao6_audit_log_select.sql
--
-- NÃO aplicar automaticamente. Cole no Supabase Dashboard → SQL Editor
-- se a tela /dashboard ou queries internas que dependem de audit_log
-- pararem de funcionar (sintoma comum: SELECT vazio inesperado em
-- audit_log, ou erro 403 ao consultar).

DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;

CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.fn_tem_papel('admin'::character varying)
    OR public.fn_tem_papel('auditor'::character varying)
    OR usuario_id = auth.uid()
  );
