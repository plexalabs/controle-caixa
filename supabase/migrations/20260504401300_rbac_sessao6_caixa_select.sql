-- ============================================================
-- CP-RBAC Sessao 6 / Bloco D: migra public.caixa caixa_select
--
-- Antes:
--   USING (fn_tem_papel('operador') OR fn_tem_papel('supervisor')
--          OR fn_tem_papel('auditor') OR fn_tem_papel('admin'))
-- Depois:
--   USING (tem_permissao('caixa.visualizar'))
--
-- IMPACTO: 'caixa.visualizar' esta em admin/gerente/operador/contador
-- no seed RBAC. supervisor/auditor legacy nao existem como perfil RBAC.
-- Conjunto efetivo de papeis com acesso fica equivalente ou ligeiramente
-- ampliado (gerente/contador ganham). super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS caixa_select ON public.caixa;

CREATE POLICY caixa_select ON public.caixa
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'caixa.visualizar')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'caixa'
      AND policyname = 'caixa_select'
  ) THEN
    RAISE EXCEPTION 'caixa_select nao foi recriada';
  END IF;
END$$;
