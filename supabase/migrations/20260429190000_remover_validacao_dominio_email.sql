-- Migration 190: remove a restrição de domínio @vdboti.com.br no signup.
--
-- Motivo: decisão revisada do Operador (2026-04-29). Auth passa a ser
-- email + senha + OTP de 6 dígitos via Resend, com cadastro aberto a
-- qualquer email. A defesa de acesso passa a ser:
--   - Confirmação obrigatória de email (OTP)
--   - RLS por papel (admin/operador) controlado pelo primeiro admin do sistema
--
-- Antes: trigger BEFORE INSERT em auth.users rejeitava emails fora do
-- dominio configurado em config.auth.dominio_permitido.
-- Depois: trigger removido. Qualquer email pode se cadastrar; quem nao
-- recebe papel via fn_auto_papel_inicial fica sem acesso a dados (RLS).

DROP TRIGGER IF EXISTS trg_auth_users_validar_dominio ON auth.users;
DROP FUNCTION IF EXISTS public.fn_validar_dominio_email();

-- Remove configuração obsoleta.
DELETE FROM public.config WHERE chave = 'auth.dominio_permitido';
