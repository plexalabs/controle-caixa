-- ============================================================
-- CP-RBAC Sessao 6 / Bloco B: migra config_update
--
-- Antes:
--   USING      (fn_tem_papel('admin') AND editavel = true)
--   WITH CHECK (fn_tem_papel('admin') AND editavel = true)
-- Depois:
--   USING      (tem_permissao('config.editar_sistema') AND editavel = true)
--   WITH CHECK (tem_permissao('config.editar_sistema') AND editavel = true)
--
-- IMPACTO: 'config.editar_sistema' eh exclusiva de super_admin no seed
-- da Sessao 1 -- admin (papel/perfil) PERDE permissao via RLS direta.
-- Coerente com a migracao da RPC atualizar_config (Sessao 2). super_admin
-- via bypass mantem acesso.
-- ============================================================

DROP POLICY IF EXISTS config_update ON public.config;

CREATE POLICY config_update ON public.config
  FOR UPDATE TO authenticated
  USING      (public.tem_permissao(auth.uid(), 'config.editar_sistema') AND editavel = true)
  WITH CHECK (public.tem_permissao(auth.uid(), 'config.editar_sistema') AND editavel = true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config' AND policyname = 'config_update'
  ) THEN
    RAISE EXCEPTION 'config_update nao foi recriada';
  END IF;
END$$;
