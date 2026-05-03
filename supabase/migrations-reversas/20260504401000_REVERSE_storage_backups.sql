-- REVERSA da migration 20260504401000_rbac_sessao6_storage_backups.sql
--
-- Schema: storage (NAO public). Cole no Supabase Dashboard SQL Editor
-- se acesso ao bucket 'backups' quebrar para admin (papel) que nao
-- tem permissao 'config.editar_sistema' no novo modelo.

DROP POLICY IF EXISTS backups_admin_only ON storage.objects;

CREATE POLICY backups_admin_only ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id <> 'backups'
    OR public.fn_tem_papel('admin'::character varying)
  )
  WITH CHECK (
    bucket_id <> 'backups'
    OR public.fn_tem_papel('admin'::character varying)
  );
