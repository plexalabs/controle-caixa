-- ============================================================
-- CP-RBAC Sessao 5 (FINAL): remove RPCs legacy
--
-- Auditoria pre-drop:
--   * grep no client (web/) -> zero call sites reais (so comentarios
--     documentando que foram migradas).
--   * grep em pg_proc do public -> zero funcoes referenciam
--     definir_papeis_usuario ou fn_tem_papel.
--
-- Funcao removida:
--   public.definir_papeis_usuario(uuid, text[])
--     - Substituida por: atribuir_perfil_usuario + promover/revogar_super_admin
--     - O workaround "AND papel != 'super_admin'" da Sessao 2-FIX
--       sai junto (estava DENTRO desta funcao).
--
-- Funcao PRESERVADA (apesar da intencao original de remover):
--   public.fn_tem_papel(varchar)
--     - Bloqueado por DEPENDENCIA: 17 RLS policies em tabelas criticas
--       (caixa, lancamento, vendedora, feriado, config, audit_log,
--       sync_log, usuario_papel + 3 em storage.objects) ainda usam
--       fn_tem_papel('admin') diretamente nas USING/WITH CHECK.
--     - Uma sessao futura (RBAC Sessao 6 ou hotfix dedicado) tem que
--       migrar essas 17 policies pra tem_permissao() ANTES de poder
--       dropar fn_tem_papel.
--     - Manter ate la. Sem prejuizo: ninguem mais chama fn_tem_papel
--       de codigo (so as policies, que ainda funcionam corretamente).
-- ============================================================

DROP FUNCTION IF EXISTS public.definir_papeis_usuario(uuid, text[]);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'definir_papeis_usuario';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'definir_papeis_usuario ainda existe. Reverter migration.';
  END IF;
  RAISE NOTICE '[OK] definir_papeis_usuario removida. fn_tem_papel preservada (RLS deps).';
END$$;
