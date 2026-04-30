// utils.js — helpers de formatação e UX que muitas páginas reutilizam.

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(v) {
  if (v == null || isNaN(Number(v))) return '—';
  return fmtBRL.format(Number(v));
}

const fmtDataLonga = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long',
});
export function formatDataLonga(d) {
  return fmtDataLonga.format(d instanceof Date ? d : new Date(d));
}

const fmtDataCurta = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});
export function formatDataCurta(d) {
  return fmtDataCurta.format(d instanceof Date ? d : new Date(d));
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Validação de senha segundo a regra Supabase + nossa: mín. 8, ≥1 letra, ≥1 número.
export function validarSenha(senha) {
  if (!senha || senha.length < 8) return 'Senha precisa ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(senha))    return 'Senha precisa ter pelo menos 1 letra.';
  if (!/\d/.test(senha))          return 'Senha precisa ter pelo menos 1 número.';
  return null;  // ok
}

export function validarEmail(email) {
  // Regex pragmática (não-RFC-completa, mas pega 99% dos casos reais).
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return 'Email com formato inválido.';
  return null;
}
