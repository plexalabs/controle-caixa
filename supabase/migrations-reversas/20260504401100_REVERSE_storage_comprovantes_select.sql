-- REVERSA da migration 20260504401100_rbac_sessao6_storage_comprovantes_select.sql
--
-- Schema: storage (NAO public). Cole no Supabase Dashboard SQL Editor
-- se SELECT no bucket 'comprovantes' quebrar para algum perfil legacy
-- (auditor/supervisor) que nao existe mais no novo modelo RBAC.

DROP POLICY IF EXISTS comprovantes_select ON storage.objects;

CREATE POLICY comprovantes_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND (
      public.fn_tem_papel('operador'::character varying)
      OR public.fn_tem_papel('supervisor'::character varying)
      OR public.fn_tem_papel('auditor'::character varying)
      OR public.fn_tem_papel('admin'::character varying)
    )
  );
