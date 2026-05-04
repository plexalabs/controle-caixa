-- ============================================================
-- CLEANUP PRÉ-PRODUÇÃO
--
-- Apaga todos os dados operacionais de teste e remove os 2
-- usuários de teste, deixando apenas o super_admin
-- (joaopedro.botucatu@vdboti.com.br) + estrutura RBAC + dados
-- mestre (feriado, config, permissao, perfil).
--
-- session_replication_role=replica desabilita triggers durante
-- a transação (sem isso, fn_lanc_obs_imutavel e fn_audit_log_imutavel
-- bloqueiam DELETEs por design).
-- ============================================================

SET LOCAL session_replication_role = 'replica';

-- 1) Dados operacionais (ordem respeita FKs)
DELETE FROM public.lancamento_observacao;
DELETE FROM public.lancamento;
DELETE FROM public.caixa;
DELETE FROM public.cliente_cache;
DELETE FROM public.vendedora;
DELETE FROM public.audit_log;

-- 2) RBAC dos 2 usuarios de teste
DELETE FROM public.usuario_permissao_extra
  WHERE usuario_id IN (
    'b662c032-ba07-4df3-861e-c20e537f726d',  -- joaopedro@plexalabs.com
    'c83abd22-dfe3-4fb3-acdd-034a60f78a25'   -- test@plexalabs.com
  );
DELETE FROM public.usuario_perfil
  WHERE usuario_id IN (
    'b662c032-ba07-4df3-861e-c20e537f726d',
    'c83abd22-dfe3-4fb3-acdd-034a60f78a25'
  );
DELETE FROM public.usuario_papel
  WHERE usuario_id IN (
    'b662c032-ba07-4df3-861e-c20e537f726d',
    'c83abd22-dfe3-4fb3-acdd-034a60f78a25'
  );

-- 3) Auth users (schema auth, requer service_role)
DELETE FROM auth.users
  WHERE id IN (
    'b662c032-ba07-4df3-861e-c20e537f726d',
    'c83abd22-dfe3-4fb3-acdd-034a60f78a25'
  );

-- (session_replication_role volta automaticamente ao fim da
-- transação por causa do SET LOCAL)
