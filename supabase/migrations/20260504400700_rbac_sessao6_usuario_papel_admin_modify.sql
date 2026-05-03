-- ============================================================
-- CP-RBAC Sessao 6 / Bloco B: migra usuario_papel_admin_modify
--
-- Antes:
--   USING      fn_tem_papel('admin')
--   WITH CHECK fn_tem_papel('admin')
-- Depois:
--   USING      tem_permissao('usuario.atribuir_perfil')
--   WITH CHECK tem_permissao('usuario.atribuir_perfil')
--
-- IMPACTO: 'usuario.atribuir_perfil' eh exclusiva de super_admin no
-- seed da Sessao 1 -- admin (papel/perfil) PERDE escrita direta na
-- tabela usuario_papel via RLS. Coerente com a migracao da RPC
-- definir_papeis_usuario que ja foi removida na Sessao 5 (substituida
-- por atribuir_perfil_usuario, que tambem exige usuario.atribuir_perfil).
-- super_admin via bypass mantem acesso pra promover/revogar pares e
-- gerenciar papeis legacy.
-- ============================================================

DROP POLICY IF EXISTS usuario_papel_admin_modify ON public.usuario_papel;

CREATE POLICY usuario_papel_admin_modify ON public.usuario_papel
  FOR ALL TO authenticated
  USING      (public.tem_permissao(auth.uid(), 'usuario.atribuir_perfil'))
  WITH CHECK (public.tem_permissao(auth.uid(), 'usuario.atribuir_perfil'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'usuario_papel' AND policyname = 'usuario_papel_admin_modify'
  ) THEN
    RAISE EXCEPTION 'usuario_papel_admin_modify nao foi recriada';
  END IF;
END$$;
