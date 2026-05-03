-- ============================================================
-- CP-RBAC Sessao 6 / Bloco A: migra audit_log_select_admin
--
-- Antes:
--   USING (fn_tem_papel('admin') OR fn_tem_papel('auditor')
--          OR usuario_id = auth.uid())
-- Depois:
--   USING (tem_permissao('auditoria.visualizar')
--          OR usuario_id = auth.uid())
--
-- Mudanca comportamental:
--   Antes: admin (papel) OR auditor (papel) OR proprio user
--   Depois: quem tem auditoria.visualizar (perfil admin no seed; ou via
--           override extra; ou super_admin via bypass) OR proprio user
--   - "auditor" legacy nao existe como perfil RBAC (proxy: admin/super_admin)
--   - admin RBAC tem auditoria.visualizar (atribuido na Etapa 0)
--   - Operadores futuros que sao "proprios users" continuam vendo
--     seus proprios eventos -- preservada
--
-- Migration reversa em supabase/migrations-reversas/.
-- ============================================================

DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;

CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'auditoria.visualizar')
    OR usuario_id = auth.uid()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log' AND policyname = 'audit_log_select_admin'
  ) THEN
    RAISE EXCEPTION 'audit_log_select_admin nao foi recriada';
  END IF;
  RAISE NOTICE '[OK] audit_log_select_admin migrada para tem_permissao(auditoria.visualizar).';
END$$;
