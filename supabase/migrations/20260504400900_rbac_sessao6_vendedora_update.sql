-- ============================================================
-- CP-RBAC Sessao 6 / Bloco B: migra vendedora_update
--
-- Antes:
--   USING (fn_tem_papel('admin') OR fn_tem_papel('operador'))
-- Depois:
--   USING tem_permissao('vendedora.editar')
--
-- IMPACTO: idem vendedora_insert -- operador PERDE, admin/gerente
-- seguem com permissao via perfil. super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS vendedora_update ON public.vendedora;

CREATE POLICY vendedora_update ON public.vendedora
  FOR UPDATE TO authenticated
  USING (public.tem_permissao(auth.uid(), 'vendedora.editar'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendedora' AND policyname = 'vendedora_update'
  ) THEN
    RAISE EXCEPTION 'vendedora_update nao foi recriada';
  END IF;
END$$;
