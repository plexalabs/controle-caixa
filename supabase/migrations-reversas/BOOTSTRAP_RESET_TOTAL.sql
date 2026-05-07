-- ============================================================
-- BOOTSTRAP RESET TOTAL — destrutivo. Rodar manualmente apenas.
--
-- Apaga TODOS os dados do sistema, incluindo o super_admin atual.
-- Mantem so o catalogo (permissao, perfil, perfil_permissao, config).
-- Apos rodar, o PRIMEIRO usuario que se cadastrar via signup vira
-- super_admin automaticamente (trigger fn_promove_primeiro_admin
-- atualizado em 20260508100000).
--
-- session_replication_role=replica desabilita TODOS os triggers
-- durante a transacao — sem isso, fn_lanc_obs_imutavel,
-- fn_audit_log_imutavel e fn_audit_row bloqueariam DELETEs.
-- ============================================================

BEGIN;
SET LOCAL session_replication_role = 'replica';

-- 1) Auditoria nova (append-only, mas precisa limpar pra bootstrap)
DELETE FROM public.auditoria;

-- 2) Notificacoes + push
DELETE FROM public.notificacao;
DELETE FROM public.push_subscription;

-- 3) Operacional (ordem respeita FKs)
DELETE FROM public.lancamento_observacao;
DELETE FROM public.lancamento;
DELETE FROM public.caixa;
DELETE FROM public.cliente_cache;
DELETE FROM public.vendedora;
DELETE FROM public.feriado;

-- 4) Audit log legacy (se ainda existir)
DELETE FROM public.audit_log
  WHERE EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='audit_log');

-- 5) RBAC dos usuarios (mantem catalogo perfil/perfil_permissao/permissao)
DELETE FROM public.usuario_permissao_extra;
DELETE FROM public.usuario_perfil;
DELETE FROM public.usuario_papel;

-- 6) Auth users — CASCADE deleta sessions, identities, etc.
DELETE FROM auth.users;

-- 7) Reset de sequencia da auditoria (id volta pra 1)
ALTER SEQUENCE public.auditoria_id_seq RESTART WITH 1;

COMMIT;

-- Verificacao pos-reset
DO $$
DECLARE
  v_users   integer;
  v_lancs   integer;
  v_audits  integer;
BEGIN
  SELECT count(*) INTO v_users  FROM auth.users;
  SELECT count(*) INTO v_lancs  FROM public.lancamento;
  SELECT count(*) INTO v_audits FROM public.auditoria;
  RAISE NOTICE '[RESET] auth.users=%, lancamento=%, auditoria=%', v_users, v_lancs, v_audits;
  IF v_users > 0 OR v_lancs > 0 OR v_audits > 0 THEN
    RAISE WARNING '[RESET] Algum dado sobreviveu — verificar.';
  END IF;
END $$;
