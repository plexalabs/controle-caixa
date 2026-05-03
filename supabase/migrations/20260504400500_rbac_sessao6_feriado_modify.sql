-- ============================================================
-- CP-RBAC Sessao 6 / Bloco B: migra feriado_modify
--
-- Antes:
--   USING      fn_tem_papel('admin')
--   WITH CHECK fn_tem_papel('admin')
-- Depois:
--   USING      tem_permissao('config.gerenciar_feriados')
--   WITH CHECK tem_permissao('config.gerenciar_feriados')
--
-- IMPACTO: equivalencia preservada -- admin tem 'config.gerenciar_feriados'
-- na seed RBAC (alem de gerente). super_admin via bypass.
-- ============================================================

DROP POLICY IF EXISTS feriado_modify ON public.feriado;

CREATE POLICY feriado_modify ON public.feriado
  FOR ALL TO authenticated
  USING      (public.tem_permissao(auth.uid(), 'config.gerenciar_feriados'))
  WITH CHECK (public.tem_permissao(auth.uid(), 'config.gerenciar_feriados'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feriado' AND policyname = 'feriado_modify'
  ) THEN
    RAISE EXCEPTION 'feriado_modify nao foi recriada';
  END IF;
END$$;
