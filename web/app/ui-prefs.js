// ui-prefs.js — preferências de interface persistidas em IndexedDB.
// Regra inviolável do projeto: NUNCA localStorage/sessionStorage.
// Este arquivo é o único lugar que mexe na DB `ledo-ui` — todas
// as outras telas que precisarem persistir UI passam por aqui.
//
// MIGRACAO LEDO: o DB foi renomeado de `caixa-boti-ui` pra `ledo-ui`
// na Fase 3. Antes da 1ª operacao no novo, copia silenciosamente as
// preferencias do antigo — operador nao perde sidebar colapsada,
// tema escolhido, etc.

const DB_NAME    = 'ledo-ui';
const DB_LEGADO  = 'caixa-boti-ui';
const DB_VERSAO  = 1;
const STORE_NAME = 'preferencias';
const FLAG_MIGRACAO = '__migrado_de_caixa_boti';

let cacheDb = null;

function abrirDb(nome = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(nome, DB_VERSAO);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'chave' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbExiste(nome) {
  if (typeof indexedDB.databases !== 'function') return true;
  try {
    const dbs = await indexedDB.databases();
    return dbs.some(d => d.name === nome);
  } catch {
    return false;
  }
}

async function migrarSeNecessario() {
  const novoDb = await abrirDb(DB_NAME);
  const jaMigrado = await new Promise((resolve) => {
    const tx = novoDb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(FLAG_MIGRACAO);
    req.onsuccess = () => resolve(!!req.result);
    req.onerror   = () => resolve(false);
  });
  if (jaMigrado) return novoDb;

  const legadoExiste = await dbExiste(DB_LEGADO);
  if (!legadoExiste) {
    await new Promise((resolve) => {
      const tx = novoDb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ chave: FLAG_MIGRACAO, valor: 'fresh-install' });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    return novoDb;
  }

  try {
    const legadoDb = await abrirDb(DB_LEGADO);
    const itens = await new Promise((resolve, reject) => {
      const tx = legadoDb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
    if (itens.length > 0) {
      await new Promise((resolve, reject) => {
        const tx = novoDb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of itens) store.put(item);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    await new Promise((resolve) => {
      const tx = novoDb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        chave: FLAG_MIGRACAO,
        valor: `migrado-${new Date().toISOString()}-${itens.length}-itens`,
      });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    try { legadoDb.close(); } catch (_) {}
  } catch (e) {
    console.warn('[ui-prefs] migracao do DB legado falhou:', e);
    await new Promise((resolve) => {
      const tx = novoDb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ chave: FLAG_MIGRACAO, valor: `falhou-${new Date().toISOString()}` });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }
  return novoDb;
}

async function obterDb() {
  if (cacheDb) return cacheDb;
  cacheDb = await migrarSeNecessario();
  return cacheDb;
}

export async function lerPref(chave, padrao = null) {
  try {
    const db = await obterDb();
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
    const db = await obterDb();
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
