-- CP-NOTIF-PUSH (Fase 3c): trigger AFTER INSERT em `notificacao` que
-- chama a edge function `enviar_push_web` via pg_net (HTTP POST async).
--
-- Como não bloqueia a transação (pg_net.http_post é fire-and-forget,
-- enfileira numa worker pool), inserts em notificacao continuam
-- baratos mesmo com push ativo.
--
-- Pré-req: extensão `pg_net` habilitada (vault gerencia o token interno).
-- Configs lidas:
--   * supabase_functions_url   — base URL das edge functions (ex: https://<ref>.supabase.co/functions/v1)
--   * supabase_service_role_key — service role pra autenticar a chamada
--                                 (alternativa: gerar JWT específico, mas pra
--                                  função privada interna, service role é OK)
--
-- Essas duas chaves ficam em `public.config` (já tem padrão no projeto)
-- e NÃO podem ser commitadas com valores reais — preencher via psql/UI.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Configs auxiliares (valores de exemplo — operador preenche manualmente)
INSERT INTO public.config (chave, valor, tipo, descricao)
VALUES
  ('supabase_functions_url', '', 'text',
   'Base URL das edge functions (ex: https://<ref>.functions.supabase.co). Necessária pro trigger de push.'),
  ('supabase_service_role_key', '', 'text',
   'Service role key — usada APENAS pelo trigger fn_notificacao_push pra chamar enviar_push_web. NUNCA expor pro frontend.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_notificacao_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url   text;
  v_key   text;
  v_full  text;
BEGIN
  SELECT valor INTO v_url FROM public.config WHERE chave = 'supabase_functions_url';
  SELECT valor INTO v_key FROM public.config WHERE chave = 'supabase_service_role_key';

  -- Sem config: silencia (pg_net erro travaria a tx)
  IF v_url IS NULL OR v_url = '' OR v_key IS NULL OR v_key = '' THEN
    RETURN NEW;
  END IF;

  v_full := rtrim(v_url, '/') || '/enviar_push_web';

  PERFORM net.http_post(
    url     := v_full,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('notificacao_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Push é best-effort: jamais derruba a transação que criou a notificação
  RAISE WARNING 'fn_notificacao_push falhou (%): %', SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificacao_push ON public.notificacao;
CREATE TRIGGER trg_notificacao_push
  AFTER INSERT ON public.notificacao
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notificacao_push();

COMMENT ON FUNCTION public.fn_notificacao_push() IS
  'Dispara edge function enviar_push_web via pg_net em INSERT de notificacao. Best-effort, não bloqueia tx.';
