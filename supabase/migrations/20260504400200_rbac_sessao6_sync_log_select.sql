-- ============================================================
-- CP-RBAC Sessao 6 / Bloco A: migra sync_log_select
--
-- Antes:
--   USING (usuario_id = auth.uid()
--          OR fn_tem_papel('admin') OR fn_tem_papel('auditor'))
-- Depois:
--   USING (usuario_id = auth.uid()
--          OR tem_permissao('auditoria.visualizar'))
--
-- Mesma logica de equivalencia do audit_log_select_admin.
--
-- Migration reversa em supabase/migrations-reversas/.
-- ============================================================

DROP POLICY IF EXISTS sync_log_select ON public.sync_log;

CREATE POLICY sync_log_select ON public.sync_log
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.tem_permissao(auth.uid(), 'auditoria.visualizar')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sync_log' AND policyname = 'sync_log_select'
  ) THEN
    RAISE EXCEPTION 'sync_log_select nao foi recriada';
  END IF;
  RAISE NOTICE '[OK] sync_log_select migrada para tem_permissao(auditoria.visualizar).';
END$$;
