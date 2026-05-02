// auth-storage.js — Storage persistente para a sessão do supabase-js.
//
// Antes do CP-PRE-DEPLOY-1, a sessão vivia em `new Map()` em RAM:
// dar F5 limpava tudo e o operador caía em /login mesmo logado.
// Regra inviolável do projeto proíbe localStorage/sessionStorage.
//
// Solução: IndexedDB com cache síncrono em memória. O supabase-js
// espera uma API SÍNCRONA (getItem/setItem/removeItem retornam direto),
// então pré-carregamos o store inteiro do IndexedDB pra um Map antes
// do boot do app prosseguir; depois disso, leituras viram instantâneas
// do Map e escritas atualizam Map (síncrono) + IndexedDB (em background).

const DB_NAME    = 'caixa-boti-auth';
const DB_VERSAO  = 1;
const STORE_NAME = 'sessao';

let cacheDb = null;
let cacheMemoria = new Map();
let pronto = false;

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

/**
 * Pré-carrega TODAS as chaves do IndexedDB para o Map em memória.
 * Deve ser chamada NO BOOT, antes do supabase.auth.getSession().
 *
 * Sem isso, a primeira chamada do supabase ao adapter síncrono retorna
 * vazio e o cliente decide que não há sessão — o operador é mandado pra
 * /login mesmo tendo dado F5 com sessão válida no IndexedDB.
 */
export async function prepararAuthStorage() {
  if (pronto) return;
  try {
    const db = await abrirDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        for (const item of req.result || []) {
          cacheMemoria.set(item.chave, item.valor);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[auth-storage] preparação falhou (sem persistência nesta sessão):', e);
  } finally {
    pronto = true;
  }
}

// Escrita assíncrona em background — não bloqueia o setItem síncrono.
function persistir(chave, valor) {
  abrirDb().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ chave, valor });
  }).catch(e => console.warn('[auth-storage] persistência falhou:', e));
}

function remover(chave) {
  abrirDb().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(chave);
  }).catch(e => console.warn('[auth-storage] remoção falhou:', e));
}

/**
 * Adapter síncrono que o supabase-js consome. As chaves vêm do
 * cacheMemoria pré-carregado; mutações atualizam memória sincronamente
 * e disparam IndexedDB em background. Garante zero await na hot path
 * de auth (que o supabase-js precisa para rehydrate na inicialização).
 */
export const authStorageAdapter = {
  getItem(chave) {
    return cacheMemoria.get(chave) ?? null;
  },
  setItem(chave, valor) {
    cacheMemoria.set(chave, valor);
    persistir(chave, valor);
  },
  removeItem(chave) {
    cacheMemoria.delete(chave);
    remover(chave);
  },
};

/**
 * Limpa tudo (memoria + IndexedDB). Útil em logout completo.
 */
export async function limparAuthStorage() {
  cacheMemoria.clear();
  try {
    const db = await abrirDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[auth-storage] limpeza falhou:', e);
  }
}
