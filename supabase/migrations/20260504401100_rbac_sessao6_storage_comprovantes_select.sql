-- ============================================================
-- CP-RBAC Sessao 6 / Bloco C: migra storage.objects comprovantes_select
--
-- Antes:
--   USING (bucket_id = 'comprovantes'
--          AND (fn_tem_papel('operador') OR fn_tem_papel('supervisor')
--               OR fn_tem_papel('auditor') OR fn_tem_papel('admin')))
-- Depois:
--   USING (bucket_id = 'comprovantes'
--          AND tem_permissao('lancamento.revelar_pii'))
--
-- IMPACTO: lancamento.revelar_pii esta em admin/gerente/operador na
-- seed RBAC (atribuida na Sessao 2). Mesma semantica de "ver dados
-- sensiveis de lancamento" -- comprovantes contam. supervisor/auditor
-- legacy nao existem como perfil RBAC; o conjunto de papeis com acesso
-- fica equivalente (admin, operador, gerente). super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS comprovantes_select ON storage.objects;

CREATE POLICY comprovantes_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND public.tem_permissao(auth.uid(), 'lancamento.revelar_pii')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'comprovantes_select'
  ) THEN
    RAISE EXCEPTION 'comprovantes_select nao foi recriada';
  END IF;
END$$;
