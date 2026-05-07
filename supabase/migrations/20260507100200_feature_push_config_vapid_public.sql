-- CP-NOTIF-PUSH (Fase 3a): config com a VAPID public key.
--
-- A pública pode (e deve) ficar visível ao frontend — é ela que a
-- API `pushManager.subscribe()` precisa pra registrar a inscrição
-- no push service do navegador.
--
-- A PRIVATE key fica APENAS como secret na edge function
-- (`supabase secrets set VAPID_PRIVATE_KEY=...`) — NUNCA aqui.
--
-- VAPID gerada localmente em 2026-05-07 (P-256 ECDSA, uncompressed).

INSERT INTO public.config (chave, valor, tipo, descricao)
VALUES (
  'push_vapid_public_key',
  'BPvJJ2ZgsplU0fQVffnXz00Hy_OgcqZlFvOWhxvhfGbvJ6bCrk2wWLH7eRh1ST7_E8puclFb8gBl5onDpsKLLpg',
  'text',
  'Chave pública VAPID (ECDSA P-256, uncompressed, base64url) — usada pelo frontend em pushManager.subscribe(). A privada fica como secret na edge function enviar_push_web.'
)
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao;

INSERT INTO public.config (chave, valor, tipo, descricao)
VALUES (
  'push_vapid_subject',
  'mailto:joaonora.nb@gmail.com',
  'text',
  'VAPID "sub" claim — identifica quem opera o push service (mailto: ou https:). Aparece nos logs dos push services para contato em caso de abuso.'
)
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao;
