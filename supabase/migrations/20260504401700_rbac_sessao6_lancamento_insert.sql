-- ============================================================
-- CP-RBAC Sessao 6 / Bloco D: migra public.lancamento lancamento_insert
--
-- Antes:
--   WITH CHECK ((fn_tem_papel('operador') OR fn_tem_papel('admin'))
--               AND criado_por = auth.uid())
-- Depois:
--   WITH CHECK (tem_permissao('lancamento.criar')
--               AND criado_por = auth.uid())
--
-- IMPACTO: 'lancamento.criar' esta em admin/gerente/operador no seed
-- RBAC. operador/admin mantem; gerente GANHA capacidade de criar
-- lancamentos. Restricao criado_por preservada (usuario so cria
-- lancamento em seu proprio nome). super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS lancamento_insert ON public.lancamento;

CREATE POLICY lancamento_insert ON public.lancamento
  FOR INSERT TO authenticated
  WITH CHECK (
    public.tem_permissao(auth.uid(), 'lancamento.criar')
    AND criado_por = auth.uid()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lancamento'
      AND policyname = 'lancamento_insert'
  ) THEN
    RAISE EXCEPTION 'lancamento_insert nao foi recriada';
  END IF;
END$$;
