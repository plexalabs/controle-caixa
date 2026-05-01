// store.js — estado reativo simples baseado em Map de listeners.
// Substitui Redux/Zustand. Suficiente até a Fase 2 inteira.

const estado    = {};
const ouvintes  = new Map();  // chave → Set<callback>

export function obter(chave) {
  return estado[chave];
}

export function definir(chave, valor) {
  estado[chave] = valor;
  const listeners = ouvintes.get(chave);
  if (!listeners) return;
  for (const cb of listeners) {
    try { cb(valor); } catch (e) { console.error('[store] listener falhou:', e); }
  }
}

export function assinar(chave, callback) {
  if (!ouvintes.has(chave)) ouvintes.set(chave, new Set());
  ouvintes.get(chave).add(callback);
  return () => ouvintes.get(chave).delete(callback);
}
