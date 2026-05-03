-- ==========================================================================
-- Migration: reset operacional completo
-- Data: 2026-05-03
-- Contexto: Operador validou deploy, quer começar do zero pra operação real.
--
-- APAGA:
--   - Dados operacionais (lancamento, lancamento_observacao,
--     lancamento_arquivado, caixa, notificacao)
--   - Dados de identidade (vendedora, usuario_papel, auth.users)
--
-- MANTÉM:
--   - Dados de seed (config, feriado) — esqueleto do sistema
--   - Schema, triggers, RPCs, edge functions
--
-- IRREVERSÍVEL. Confere counts antes/depois via RAISE NOTICE.
-- ==========================================================================

-- Sanity check antes
DO $$
DECLARE
  v_msg text;
BEGIN
  v_msg := format(
    'Antes do reset: %s users, %s caixas, %s lancamentos, %s observacoes, %s notif, %s vendedoras',
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.caixa),
    (SELECT count(*) FROM public.lancamento),
    (SELECT count(*) FROM public.lancamento_observacao),
    (SELECT count(*) FROM public.notificacao),
    (SELECT count(*) FROM public.vendedora)
  );
  RAISE NOTICE '%', v_msg;
END$$;

-- ==== DADOS OPERACIONAIS ====
-- Ordem importa por causa de FKs:
--   lancamento_observacao -> lancamento (ON DELETE RESTRICT)
--   lancamento -> caixa
--   lancamento -> vendedora
--   notificacao -> caixa, lancamento, vendedora

-- trg_lanc_obs_no_delete bloqueia DELETE em lancamento_observacao
-- (regra "observações são imutáveis"). Reset é exceção controlada
-- explicitamente autorizada pelo Operador.
-- Usamos DISABLE TRIGGER USER (não ALL) porque o postgres da Supabase
-- via MCP não tem permissão de superuser para mexer em triggers de
-- system constraint (RI_ConstraintTrigger). USER cobre só os triggers
-- definidos pelo usuário, que é o que precisamos. As FKs continuam
-- ativas — a ordem de DELETE já respeita as constraints.
ALTER TABLE public.lancamento_observacao DISABLE TRIGGER USER;
DELETE FROM public.lancamento_observacao;
ALTER TABLE public.lancamento_observacao ENABLE TRIGGER USER;

-- lancamento_arquivado herda triggers de lancamento via LIKE INCLUDING ALL.
-- Trigger trg_lancamento_travar_pos_categoria pode bloquear DELETE.
ALTER TABLE public.lancamento_arquivado DISABLE TRIGGER USER;
DELETE FROM public.lancamento_arquivado;
ALTER TABLE public.lancamento_arquivado ENABLE TRIGGER USER;

-- Triggers em lancamento (recalcular_caixa, validar_dados, audit, etc.)
-- não bloqueiam DELETE diretamente, mas DISABLE evita ruído de
-- side-effects (audit_log, recalculo de saldo) durante o reset.
ALTER TABLE public.lancamento DISABLE TRIGGER USER;
DELETE FROM public.lancamento;
ALTER TABLE public.lancamento ENABLE TRIGGER USER;

DELETE FROM public.notificacao;
DELETE FROM public.caixa;

-- ==== DADOS DE IDENTIDADE ====

DELETE FROM public.usuario_papel;
DELETE FROM public.vendedora;

-- auth.users requer service_role / superuser. Migration roda como
-- postgres (owner do schema public, com permissão em auth via Supabase),
-- então o DELETE funciona. Se executar via supabase CLI sem service
-- role, falha com "permission denied for table users" — nesse caso
-- aplicar pelo Dashboard do Supabase (Authentication → Users → Delete).
DELETE FROM auth.users;

-- ==== SANITY FINAL ====

DO $$
DECLARE
  v_msg     text;
  v_config  integer;
  v_feriado integer;
BEGIN
  v_msg := format(
    'Apos reset: %s users, %s caixas, %s lancamentos, %s observacoes, %s notif, %s vendedoras',
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.caixa),
    (SELECT count(*) FROM public.lancamento),
    (SELECT count(*) FROM public.lancamento_observacao),
    (SELECT count(*) FROM public.notificacao),
    (SELECT count(*) FROM public.vendedora)
  );
  RAISE NOTICE '%', v_msg;

  SELECT count(*) INTO v_config  FROM public.config;
  SELECT count(*) INTO v_feriado FROM public.feriado WHERE ativo = true;

  IF v_config < 9 THEN
    RAISE EXCEPTION 'Config foi truncado (%). Esperado >=9. Reverta!', v_config;
  END IF;

  IF v_feriado < 14 THEN
    RAISE EXCEPTION 'Feriados foram afetados (% ativos). Esperado >=14. Reverta!', v_feriado;
  END IF;

  RAISE NOTICE '[OK] Config (% chaves) e feriados (% ativos) intactos.',
    v_config, v_feriado;
END$$;
