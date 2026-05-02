// auth.js — helpers de autenticação que envolvem supabase-js.
// Cada função retorna `{ ok: bool, dados?, mensagem? }` para a UI consumir
// sem precisar interpretar mensagens cruas do Supabase.

import { supabase } from './supabase.js';
import { comRetry } from './supabase-wrapper.js';

// Mapa de mensagens de erro do Supabase para textos pt-BR claros que o
// Operador entenderia sem saber o que é "rate limit" ou "invalid grant".
function traduzirErro(error) {
  if (!error) return 'Erro desconhecido. Tente novamente.';
  const msg = (error.message ?? '').toLowerCase();
  const code = error.code ?? error.error_code ?? '';

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'EMAIL_NAO_CONFIRMADO';
  if (msg.includes('invalid login credentials'))
    return 'Email ou senha incorretos.';
  if (code === 'user_already_exists' || msg.includes('user already registered'))
    return 'Já existe uma conta com esse email. Faça login ou recupere a senha.';
  if (msg.includes('password should be at least'))
    return 'Senha precisa ter no mínimo 8 caracteres.';
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (code === 'otp_expired' || msg.includes('token has expired'))
    return 'O código expirou. Clique em "Reenviar código".';
  if (code === 'otp_invalid' || msg.includes('invalid token'))
    return 'Código inválido. Verifique os dígitos e tente de novo.';
  if (msg.includes('email link is invalid'))
    return 'Link inválido ou já usado. Solicite um novo código.';
  if (msg.includes('network'))
    return 'Sem conexão com o servidor. Verifique sua internet.';

  return error.message ?? 'Erro inesperado.';
}

// ─── Login com email e senha ──────────────────────────────────────────────
// Envolvido em comRetry: tolera 1-2 falhas de rede antes de mostrar erro
// ao operador. Senha incorreta NÃO é retentada (auth.js retorna error com
// status 400, fora da lista de recuperáveis do wrapper).
export async function entrarComSenha(email, senha) {
  const { data, error } = await comRetry(
    () => supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    }),
    'login'
  );
  if (error) return { ok: false, mensagem: traduzirErro(error), code: error.code };
  return { ok: true, dados: data };
}

// ─── Cadastro ─────────────────────────────────────────────────────────────
// Dispara email com OTP de 6 dígitos via Resend (configurado no Supabase Auth).
export async function cadastrar(email, senha, perfil = {}) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: senha,
    options: { data: perfil },  // perfil = { nome, sobrenome }
  });
  if (error) return { ok: false, mensagem: traduzirErro(error) };
  return { ok: true, dados: data };
}

// ─── Verificação de OTP (signup ou recovery) ──────────────────────────────
export async function verificarCodigo(email, token, tipo = 'signup') {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token,
    type: tipo,  // 'signup' | 'recovery' | 'email'
  });
  if (error) return { ok: false, mensagem: traduzirErro(error) };
  return { ok: true, dados: data };
}

// ─── Reenviar código ──────────────────────────────────────────────────────
export async function reenviarCodigo(email, tipo = 'signup') {
  const { error } = await supabase.auth.resend({
    type: tipo,
    email: email.trim().toLowerCase(),
  });
  if (error) return { ok: false, mensagem: traduzirErro(error) };
  return { ok: true };
}

// ─── Reset de senha (envia OTP recovery) ──────────────────────────────────
export async function pedirRecuperacao(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
  );
  if (error) return { ok: false, mensagem: traduzirErro(error) };
  return { ok: true };
}

// ─── Atualizar senha (após verificar OTP de recovery) ─────────────────────
export async function atualizarSenha(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) return { ok: false, mensagem: traduzirErro(error) };
  return { ok: true };
}

// ─── Sair ─────────────────────────────────────────────────────────────────
export async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, mensagem: traduzirErro(error) };
  return { ok: true };
}
