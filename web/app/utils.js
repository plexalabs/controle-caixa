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

// ─── Formatadores de NF / pedido / cliente ──────────────────────────
// Regras espelham a tela de novo lançamento: dados ficam crus no banco
// (digitos puros, case original) e os formatadores aplicam a forma
// visual em todo render. Idempotentes — colocar pontos num valor que
// ja tem pontos nao quebra nada.

export function soDigitos(s) {
  return String(s ?? '').replace(/\D/g, '');
}

// NF: ate 5 digitos, formato XX.XXX
export function formatarNumeroNF(s) {
  const d = soDigitos(s).slice(0, 5);
  if (!d) return String(s ?? '');   // preserva entradas legadas nao-numericas
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}.${d.slice(2)}`;
}

// Pedido: ate 9 digitos, formato XXX.XXX.XXX
export function formatarCodigoPedido(s) {
  const d = soDigitos(s).slice(0, 9);
  if (!d) return String(s ?? '');
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

// Conectivos pt-BR que ficam minusculos no meio do nome.
const CONECTIVOS_NOME = new Set([
  'da', 'de', 'di', 'do', 'du',
  'das', 'des', 'dos', 'dus',
  'e', 'y', 'o',
  'la', 'le', 'lo', 'del',
  'van', 'von',
]);

// Cliente: se vier TUDO em caixa alta, vira title case com conectivos
// em minusculo. Caso contrario, devolve como esta (preserva "iPhone",
// "McDonald's", "Joao Silva" ja correto, etc).
export function formatarNomeCliente(s) {
  const v = String(s ?? '').trim();
  if (!v) return v;
  const ehCaps = v === v.toUpperCase() && /[A-ZÀ-Ý]/.test(v);
  if (!ehCaps) return v;
  const lower = v.toLowerCase();
  return lower.replace(/\S+/g, (palavra, offset) => {
    const antes = lower.slice(0, offset);
    const ehPrimeira = !/\S/.test(antes);
    if (!ehPrimeira && CONECTIVOS_NOME.has(palavra)) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  });
}

// ─── Mascaras de input pra formularios ──────────────────────────────
// Aplica os formatadores acima como input-handlers em qualquer form,
// preservando posicao do cursor mesmo apos a re-formatacao (ponto
// inserido empurra o cursor 1 char a frente, e vice-versa). Use em
// qualquer tela que tenha campos de NF, codigo de pedido ou cliente.
//
// Uso:
//   instalarMascarasFormulario(form, {
//     idNF: 'ed-numero_nf', idPedido: 'ed-codigo_pedido', idCliente: 'ed-cliente_nome'
//   });
//
// Ids podem ser omitidos quando o form nao tem aquele campo.
export function instalarMascarasFormulario(formOuContainer, ids = {}) {
  if (!formOuContainer) return;
  const { idNF, idPedido, idCliente } = ids;

  if (idNF) {
    const el = formOuContainer.querySelector('#' + idNF);
    if (el && !el.readOnly && !el.disabled) {
      el.addEventListener('input', criarMascara(formatarNumeroNF, [2]));
      // Forca formatacao tambem ao colar valor cru
      el.addEventListener('blur', (e) => { e.target.value = formatarNumeroNF(e.target.value); });
    }
  }
  if (idPedido) {
    const el = formOuContainer.querySelector('#' + idPedido);
    if (el && !el.readOnly && !el.disabled) {
      el.addEventListener('input', criarMascara(formatarCodigoPedido, [3, 6]));
      el.addEventListener('blur', (e) => { e.target.value = formatarCodigoPedido(e.target.value); });
    }
  }
  if (idCliente) {
    const el = formOuContainer.querySelector('#' + idCliente);
    if (el && !el.disabled) {
      el.addEventListener('blur', (e) => { e.target.value = formatarNomeCliente(e.target.value); });
    }
  }
}

// Cursor-preserving input handler: chama fnFormatar e ajusta o cursor
// somando 1 char pra cada posicao de digito que ja passou (cada ponto
// inserido pelo formatador empurra o cursor a frente).
function criarMascara(fnFormatar, posicoesPontosEmDigitos) {
  return (e) => {
    const cursorAntes = e.target.selectionStart || 0;
    const valorAntes  = e.target.value;
    const digitosAteCursor = soDigitos(valorAntes.slice(0, cursorAntes)).length;
    const formatado = fnFormatar(valorAntes);
    if (formatado === valorAntes) return;
    e.target.value = formatado;
    let novoCursor = digitosAteCursor;
    for (const pos of posicoesPontosEmDigitos) {
      if (digitosAteCursor > pos) novoCursor += 1;
    }
    novoCursor = Math.min(novoCursor, formatado.length);
    try { e.target.setSelectionRange(novoCursor, novoCursor); } catch (_) {}
  };
}
