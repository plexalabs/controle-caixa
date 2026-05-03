-- ============================================================
-- CP-RBAC Sessao 6 / Bloco B: migra vendedora_insert
--
-- Antes:
--   WITH CHECK (fn_tem_papel('admin') OR fn_tem_papel('operador'))
-- Depois:
--   WITH CHECK tem_permissao('vendedora.criar')
--
-- IMPACTO: 'vendedora.criar' esta em admin/gerente/super_admin no
-- seed RBAC. Operador (papel/perfil) PERDE permissao de criar
-- vendedora -- coerente com desenho: operador so visualiza.
-- super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS vendedora_insert ON public.vendedora;

CREATE POLICY vendedora_insert ON public.vendedora
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao(auth.uid(), 'vendedora.criar'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendedora' AND policyname = 'vendedora_insert'
  ) THEN
    RAISE EXCEPTION 'vendedora_insert nao foi recriada';
  END IF;
END$$;
