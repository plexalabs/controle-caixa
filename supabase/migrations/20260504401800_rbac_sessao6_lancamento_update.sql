-- ============================================================
-- CP-RBAC Sessao 6 / Bloco D: migra public.lancamento lancamento_update
--
-- Antes:
--   USING (fn_tem_papel('operador') OR fn_tem_papel('admin'))
-- Depois:
--   USING (tem_permissao('lancamento.editar_pre_categoria'))
--
-- IMPACTO: 'lancamento.editar_pre_categoria' esta em admin/gerente/
-- operador no seed RBAC (a edicao tipica e categorizar lancamento
-- pendente). operador/admin mantem capacidade; gerente GANHA. Edicoes
-- pos-categoria continuam protegidas por permissoes mais especificas
-- ao nivel de aplicacao. super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS lancamento_update ON public.lancamento;

CREATE POLICY lancamento_update ON public.lancamento
  FOR UPDATE TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'lancamento.editar_pre_categoria')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lancamento'
      AND policyname = 'lancamento_update'
  ) THEN
    RAISE EXCEPTION 'lancamento_update nao foi recriada';
  END IF;
END$$;
