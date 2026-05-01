// ui-prefs.js — preferências de interface persistidas em IndexedDB.
// Regra inviolável do projeto: NUNCA localStorage/sessionStorage.
// Este arquivo é o único lugar que mexe na DB `caixa-boti-ui` — todas
// as outras telas que precisarem persistir UI passam por aqui.

const DB_NAME    = 'caixa-boti-ui';
const DB_VERSAO  = 1;
const STORE_NAME = 'preferencias';

let cacheDb = null;

function abrirDb() {
  if (cacheDb) return Promise.resolve(cacheDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSAO);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'chave' });
      }
    };
    req.onsuccess = () => { cacheDb = req.result; resolve(cacheDb); };
    req.onerror   = () => reject(req.error);
  });
}

export async function lerPref(chave, padrao = null) {
  try {
    const db = await abrirDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(chave);
      req.onsuccess = () => resolve(req.result ? req.result.valor : padrao);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[ui-prefs] leitura falhou para', chave, e);
    return padrao;
  }
}

export async function gravarPref(chave, valor) {
  try {
    const db = await abrirDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ chave, valor });
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[ui-prefs] gravação falhou para', chave, e);
    return false;
  }
}
