-- ============================================================
-- CP-RBAC Sessao 6 / Bloco C: migra storage.objects comprovantes_upload
--
-- Antes:
--   WITH CHECK (bucket_id = 'comprovantes'
--               AND (fn_tem_papel('operador') OR fn_tem_papel('admin')))
-- Depois:
--   WITH CHECK (bucket_id = 'comprovantes'
--               AND tem_permissao('lancamento.criar'))
--
-- IMPACTO: 'lancamento.criar' esta em admin/gerente/operador no seed
-- RBAC. operador/admin mantem capacidade; gerente GANHA capacidade
-- (alinhado com semantica do perfil). super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS comprovantes_upload ON storage.objects;

CREATE POLICY comprovantes_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND public.tem_permissao(auth.uid(), 'lancamento.criar')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'comprovantes_upload'
  ) THEN
    RAISE EXCEPTION 'comprovantes_upload nao foi recriada';
  END IF;
END$$;
