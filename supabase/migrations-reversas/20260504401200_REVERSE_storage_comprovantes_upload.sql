-- REVERSA da migration 20260504401200_rbac_sessao6_storage_comprovantes_upload.sql
--
-- Schema: storage (NAO public). Cole no Supabase Dashboard SQL Editor
-- se INSERT no bucket 'comprovantes' quebrar para o perfil gerente
-- (que ganhou capacidade na nova policy via 'lancamento.criar').

DROP POLICY IF EXISTS comprovantes_upload ON storage.objects;

CREATE POLICY comprovantes_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND (
      public.fn_tem_papel('operador'::character varying)
      OR public.fn_tem_papel('admin'::character varying)
    )
  );
