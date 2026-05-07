-- ============================================================
-- JANELA-2: Trigger generico que aplica assert_janela_operacional()
-- como defesa de profundidade — pega INSERT/UPDATE/DELETE direto
-- (RPC, painel Supabase, qualquer cliente) sem precisar editar
-- cada RPC manualmente.
--
-- session_replication_role='replica' (usado em wipes/resets)
-- pula triggers — entao operacoes de manutencao ainda funcionam.
--
-- NAO anexamos em:
--   auditoria       — gravacao automatica deve passar sempre
--   config          — admin pode mexer kill-switch fora do horario
--   permissao,perfil,perfil_permissao — catalogo, raro mexer
--
-- Tabelas protegidas: lancamento, lancamento_observacao, caixa,
-- vendedora, feriado, notificacao, push_subscription, usuario_perfil,
-- usuario_permissao_extra, usuario_papel.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_check_janela_operacional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_janela_operacional();
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.fn_check_janela_operacional() IS
  'JANELA-2: Trigger BEFORE que bloqueia DML fora da janela operacional. session_replication_role=replica bypassa.';


-- Helper macro-like via DO block — anexa em todas as tabelas listadas
DO $$
DECLARE
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY[
    'lancamento', 'lancamento_observacao', 'caixa',
    'vendedora', 'feriado',
    'notificacao', 'push_subscription',
    'usuario_perfil', 'usuario_permissao_extra', 'usuario_papel'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_janela_op ON public.%I;', v_tabela
    );
    EXECUTE format(
      'CREATE TRIGGER trg_janela_op
         BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_check_janela_operacional();',
      v_tabela
    );
  END LOOP;
END $$;
