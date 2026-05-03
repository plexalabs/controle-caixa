-- ============================================================
-- CP-RBAC Sessao 6 / Bloco D: migra public.caixa caixa_update
--
-- Antes:
--   USING (fn_tem_papel('operador') OR fn_tem_papel('admin'))
-- Depois:
--   USING (tem_permissao('caixa.abrir'))
--
-- IMPACTO: 'caixa.abrir' (mais permissiva do modulo caixa) cobre
-- semanticamente a operacao de fechar/atualizar caixa. Esta em
-- admin/gerente/operador no seed RBAC. operador/admin mantem;
-- gerente GANHA capacidade. super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS caixa_update ON public.caixa;

CREATE POLICY caixa_update ON public.caixa
  FOR UPDATE TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'caixa.abrir')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'caixa'
      AND policyname = 'caixa_update'
  ) THEN
    RAISE EXCEPTION 'caixa_update nao foi recriada';
  END IF;
END$$;
