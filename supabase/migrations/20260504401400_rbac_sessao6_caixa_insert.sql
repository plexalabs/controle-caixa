-- ============================================================
-- CP-RBAC Sessao 6 / Bloco D: migra public.caixa caixa_insert
--
-- Antes:
--   WITH CHECK ((fn_tem_papel('operador') OR fn_tem_papel('admin'))
--               AND criado_por = auth.uid())
-- Depois:
--   WITH CHECK (tem_permissao('caixa.abrir') AND criado_por = auth.uid())
--
-- IMPACTO: 'caixa.abrir' esta em admin/gerente/operador no seed RBAC.
-- operador/admin mantem capacidade; gerente GANHA capacidade de abrir
-- caixa (alinhado com semantica do perfil). Restricao criado_por
-- preservada (usuario so pode criar caixa em seu proprio nome).
-- super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS caixa_insert ON public.caixa;

CREATE POLICY caixa_insert ON public.caixa
  FOR INSERT TO authenticated
  WITH CHECK (
    public.tem_permissao(auth.uid(), 'caixa.abrir')
    AND criado_por = auth.uid()
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'caixa'
      AND policyname = 'caixa_insert'
  ) THEN
    RAISE EXCEPTION 'caixa_insert nao foi recriada';
  END IF;
END$$;
