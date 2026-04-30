// i18n.js — esqueleto para internacionalização futura.
// MVP é pt-BR puro. Esta função fica como referência para eventual i18n
// completa (CP4 — Configurações pode adicionar trocador de idioma).

const strings = {
  // CP1: hoje strings ficam inline nos componentes. Quando começar a duplicar,
  // mover para cá com chaves como 'login.titulo'.
};

export function t(chave, vars = {}) {
  let s = chave.split('.').reduce((acc, k) => acc?.[k], strings) ?? chave;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, v);
  }
  return s;
}
