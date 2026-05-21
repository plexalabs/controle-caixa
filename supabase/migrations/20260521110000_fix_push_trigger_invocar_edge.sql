-- ============================================================
-- FIX-PUSH: trigger de Web Push passa a usar app.invocar_edge
--
-- Sintoma: as notificações nunca chegavam no desktop — nem com a
-- aba aberta, nem (principalmente) com a aba fechada. O Web Push
-- depende da edge function `enviar_push_web` ser chamada a cada
-- INSERT em public.notificacao.
--
-- Causa raiz (confirmada em produção em 2026-05-20):
--   fn_notificacao_push() lia 'supabase_functions_url' e
--   'supabase_service_role_key' de public.config. As DUAS linhas
--   estavam VAZIAS — então a função caía no `RETURN NEW` silencioso
--   e nenhum push era disparado.
--
--   Elas estavam vazias por um bom motivo: a policy `config_select`
--   libera SELECT de TODA a tabela config para qualquer usuário
--   autenticado (USING true). Colocar a service_role_key ali a
--   exporia ao frontend — vazamento crítico. O operador, certo,
--   nunca preencheu a linha. Resultado: push quebrado por design.
--
-- Correção:
--   1. fn_notificacao_push() passa a chamar app.invocar_edge(), que
--      lê a service_role_key do Vault (vault.decrypted_secrets) —
--      nunca de uma tabela legível pelo cliente — valida o formato
--      do JWT e registra a chamada em app.edge_invocation_log. É o
--      MESMO caminho que os cron jobs já usam com sucesso.
--   2. Remove as linhas 'supabase_service_role_key' (armadilha de
--      segurança) e 'supabase_functions_url' (órfã — invocar_edge
--      já tem a URL) de public.config. Nenhum outro código as lê.
--
-- PRÉ-REQUISITOS pra push funcionar de ponta a ponta (fora desta
-- migration — ação do operador):
--   * A edge function `enviar_push_web` precisa estar DEPLOYADA.
--     Hoje NÃO está (só cria_caixa_diario, disparar_notificacoes,
--     arquivar_ano e backup_semanal estão no projeto). Deploy:
--       supabase functions deploy enviar_push_web
--   * O secret VAPID_PRIVATE_KEY precisa existir no ambiente das
--     edge functions, pareado com push_vapid_public_key (config):
--       supabase secrets set VAPID_PRIVATE_KEY=<chave-privada>
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_notificacao_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Dispara o Web Push de forma assíncrona (pg_net, por dentro de
  -- invocar_edge). Best-effort: o push jamais pode derrubar a
  -- transação que criou a notificação.
  PERFORM app.invocar_edge(
    'enviar_push_web',
    jsonb_build_object('notificacao_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_notificacao_push falhou (%): %', SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notificacao_push() IS
  'Dispara a edge function enviar_push_web via app.invocar_edge (token lido do Vault) em INSERT de notificacao. Best-effort, não bloqueia a tx.';

-- O trigger não muda, mas recriamos por idempotência.
DROP TRIGGER IF EXISTS trg_notificacao_push ON public.notificacao;
CREATE TRIGGER trg_notificacao_push
  AFTER INSERT ON public.notificacao
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notificacao_push();

-- Cleanup de segurança: a service_role_key jamais deve morar em
-- public.config (legível por authenticated via config_select).
-- A URL das functions ficou órfã — invocar_edge tem a URL fixa.
DELETE FROM public.config
 WHERE chave IN ('supabase_service_role_key', 'supabase_functions_url');
