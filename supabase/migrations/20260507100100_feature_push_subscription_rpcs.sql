-- CP-NOTIF-PUSH (Fase 3a): RPCs para registrar / remover push subscription.
--
-- O frontend chama `salvar_push_subscription(p_endpoint, p_p256dh, p_auth)`
-- depois de `pushManager.subscribe()`. Idempotente: se o endpoint já
-- existe pra outro usuário (ex: mesmo device, login diferente),
-- atualiza o usuario_id; se já existe pro mesmo usuário, só atualiza
-- ultima_em.

CREATE OR REPLACE FUNCTION public.salvar_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() nulo' USING ERRCODE = '28000';
  END IF;
  IF p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL THEN
    RAISE EXCEPTION 'endpoint, p256dh e auth são obrigatórios' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_subscription
    (usuario_id, endpoint, p256dh, auth, user_agent)
  VALUES
    (v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET usuario_id  = EXCLUDED.usuario_id,
        p256dh      = EXCLUDED.p256dh,
        auth        = EXCLUDED.auth,
        user_agent  = EXCLUDED.user_agent,
        ultima_em   = now(),
        removida_em = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_push_subscription(text, text, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.salvar_push_subscription(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remover_push_subscription(p_endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() nulo' USING ERRCODE = '28000';
  END IF;

  UPDATE public.push_subscription
     SET removida_em = now()
   WHERE endpoint = p_endpoint
     AND usuario_id = v_uid
     AND removida_em IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.remover_push_subscription(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.remover_push_subscription(text) TO authenticated;
