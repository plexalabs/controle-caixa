-- CP-NOTIF-PUSH (Fase 3a): tabela de subscriptions Web Push.
--
-- Cada usuário pode registrar 1+ devices (browser/notebook/celular).
-- Usamos `endpoint` como chave única (já é único globalmente — é a
-- URL que o push service do navegador devolve). `p256dh`/`auth` são
-- as chaves criptográficas necessárias pra encriptar o payload do
-- web-push (RFC 8291).
--
-- Soft-delete via `removida_em` (consistente com o resto do schema).

CREATE TABLE IF NOT EXISTS public.push_subscription (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL UNIQUE,
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  user_agent    text,
  criada_em     timestamptz NOT NULL DEFAULT now(),
  ultima_em     timestamptz NOT NULL DEFAULT now(),  -- ultima vez que tentou enviar push
  removida_em   timestamptz                          -- soft-delete (push expirou ou usuario revogou)
);

CREATE INDEX IF NOT EXISTS ix_push_sub_usuario_ativa
  ON public.push_subscription (usuario_id)
  WHERE removida_em IS NULL;

ALTER TABLE public.push_subscription ENABLE ROW LEVEL SECURITY;

-- RLS: usuário só vê / mexe nas próprias subscriptions.
DROP POLICY IF EXISTS push_sub_select ON public.push_subscription;
CREATE POLICY push_sub_select
  ON public.push_subscription FOR SELECT
  USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS push_sub_insert ON public.push_subscription;
CREATE POLICY push_sub_insert
  ON public.push_subscription FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS push_sub_update ON public.push_subscription;
CREATE POLICY push_sub_update
  ON public.push_subscription FOR UPDATE
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS push_sub_delete ON public.push_subscription;
CREATE POLICY push_sub_delete
  ON public.push_subscription FOR DELETE
  USING (auth.uid() = usuario_id);

COMMENT ON TABLE public.push_subscription IS
  'Web Push subscriptions por usuário/device. Endpoint é único global. Soft-delete via removida_em.';
