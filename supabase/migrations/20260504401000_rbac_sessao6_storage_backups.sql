-- ============================================================
-- CP-RBAC Sessao 6 / Bloco C: migra storage.objects backups_admin_only
--
-- Antes:
--   USING      (bucket_id <> 'backups' OR fn_tem_papel('admin'))
--   WITH CHECK (bucket_id <> 'backups' OR fn_tem_papel('admin'))
-- Depois:
--   USING      (bucket_id <> 'backups' OR tem_permissao('config.editar_sistema'))
--   WITH CHECK (bucket_id <> 'backups' OR tem_permissao('config.editar_sistema'))
--
-- IMPACTO: 'config.editar_sistema' eh exclusiva de super_admin no
-- seed da Sessao 1 -- admin (papel/perfil) PERDE acesso ao bucket
-- 'backups'. Backups passam a ser exclusivos de super_admin (alinhado
-- com semantica de "operacao critica de sistema"). super_admin via
-- bypass mantem acesso. Outros buckets (comprovantes etc.) nao sao
-- afetados pela clausula bucket_id <> 'backups'.
-- ============================================================

DROP POLICY IF EXISTS backups_admin_only ON storage.objects;

CREATE POLICY backups_admin_only ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id <> 'backups'
    OR public.tem_permissao(auth.uid(), 'config.editar_sistema')
  )
  WITH CHECK (
    bucket_id <> 'backups'
    OR public.tem_permissao(auth.uid(), 'config.editar_sistema')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'backups_admin_only'
  ) THEN
    RAISE EXCEPTION 'backups_admin_only nao foi recriada';
  END IF;
END$$;
