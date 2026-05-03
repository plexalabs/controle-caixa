-- ============================================================
-- CP-RBAC Sessao 6 / Bloco B: migra usuario_papel_select
--
-- Antes:
--   USING (usuario_id = auth.uid() OR fn_tem_papel('admin'))
-- Depois:
--   USING (usuario_id = auth.uid() OR tem_permissao('usuario.visualizar'))
--
-- IMPACTO: equivalencia preservada -- admin tem 'usuario.visualizar'
-- na seed RBAC (alem de gerente). Usuarios olhando seus proprios
-- papeis continuam vendo (clausula self preservada). super_admin via
-- bypass.
-- ============================================================

DROP POLICY IF EXISTS usuario_papel_select ON public.usuario_papel;

CREATE POLICY usuario_papel_select ON public.usuario_papel
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.tem_permissao(auth.uid(), 'usuario.visualizar')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'usuario_papel' AND policyname = 'usuario_papel_select'
  ) THEN
    RAISE EXCEPTION 'usuario_papel_select nao foi recriada';
  END IF;
END$$;
