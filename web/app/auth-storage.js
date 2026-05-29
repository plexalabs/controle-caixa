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
//
// MIGRACAO LEDO: o DB foi renomeado de `caixa-boti-auth` pra `ledo-auth`
// na Fase 3 (rename pra Ledo). Antes de operar no novo, copiamos
// silenciosamente os dados do antigo se existir — operador nao e
// deslogado nem precisa fazer nada.

const DB_NAME     = 'ledo-auth';
const DB_LEGADO   = 'caixa-boti-auth';
const DB_VERSAO   = 1;
const STORE_NAME  = 'sessao';
const FLAG_MIGRACAO = '__migrado_de_caixa_boti';

let cacheDb = null;
let cacheMemoria = new Map();
let pronto = false;

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

// Tenta detectar se DB antigo existe sem abri-lo (evita auto-criar).
async function dbExiste(nome) {
  if (typeof indexedDB.databases !== 'function') {
    // Safari < 18 e Firefox antigos: nao expoem .databases().
    // Fallback: abre o DB — se nao existia, sera criado vazio (idempotente).
    return true;
  }
  try {
    const dbs = await indexedDB.databases();
    return dbs.some(d => d.name === nome);
  } catch {
    return false;
  }
}

// Migracao silenciosa: copia todas as chaves do DB legado pro novo,
// uma unica vez. Marca o novo com FLAG_MIGRACAO pra evitar retentar.
// Em caso de qualquer falha, segue sem migracao (operador relogga 1x).
async function migrarDeLegadoSeNecessario() {
  const novoDb = await abrirDb(DB_NAME);

  // Ja migrou? Sai.
  const jaMigrado = await new Promise((resolve) => {
    const tx = novoDb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(FLAG_MIGRACAO);
    req.onsuccess = () => resolve(!!req.result);
    req.onerror   = () => resolve(false);
  });
  if (jaMigrado) return novoDb;

  // Verifica se DB legado existe — sem ele, e instalacao fresh.
  const legadoExiste = await dbExiste(DB_LEGADO);
  if (!legadoExiste) {
    // Marca como fresh-install pra nao reverificar a cada boot.
    await new Promise((resolve) => {
      const tx = novoDb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ chave: FLAG_MIGRACAO, valor: 'fresh-install' });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    return novoDb;
  }

  // Copia tudo do legado pro novo.
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
    // Marca migrado. DB legado FICA intocado por seguranca (rollback).
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
    console.warn('[auth-storage] migracao do DB legado falhou:', e);
    // Mesmo em falha, marca pra nao retentar infinitamente.
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
  cacheDb = await migrarDeLegadoSeNecessario();
  return cacheDb;
}

/**
 * Pré-carrega TODAS as chaves do IndexedDB para o Map em memória.
 * Deve ser chamada NO BOOT, antes do supabase.auth.getSession().
 *
 * Sem isso, a primeira chamada do supabase ao adapter síncrono retorna
 * vazio e o cliente decide que não há sessão — o operador é mandado pra
 * /login mesmo tendo dado F5 com sessão válida no IndexedDB.
 */
// Prefixos antigo/novo do storageKey do supabase-js. As chaves
// individuais podem ser exatamente o prefixo ('caixa-boti-auth') ou
// com sufixos ('caixa-boti-auth-token', '.code-verifier' etc).
// Migracao silenciosa: ao carregar do DB pra memoria, renomeia o
// prefixo + persiste com a chave nova; o DB antigo (chave-antiga)
// continua no IndexedDB ate o operador fazer logout, mas nao e mais
// lido. Sem deslogar, sem perder o token de refresh.
const PREFIXO_LEGADO = 'caixa-boti-auth';
const PREFIXO_NOVO   = 'ledo-auth';

function renomearChaveSeNecessario(chaveAntiga) {
  if (chaveAntiga === PREFIXO_LEGADO) return PREFIXO_NOVO;
  if (chaveAntiga.startsWith(PREFIXO_LEGADO + '-') ||
      chaveAntiga.startsWith(PREFIXO_LEGADO + '.')) {
    return PREFIXO_NOVO + chaveAntiga.slice(PREFIXO_LEGADO.length);
  }
  return chaveAntiga;
}

export async function prepararAuthStorage() {
  if (pronto) return;
  try {
    const db = await obterDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const renomeadas = [];
        for (const item of req.result || []) {
          if (item.chave === FLAG_MIGRACAO) continue;
          const chaveFinal = renomearChaveSeNecessario(item.chave);
          cacheMemoria.set(chaveFinal, item.valor);
          if (chaveFinal !== item.chave) {
            renomeadas.push({ antiga: item.chave, nova: chaveFinal, valor: item.valor });
          }
        }
        // Persiste as chaves renomeadas no DB novo (background).
        // Mantem as antigas — proximo logout limpa, ou ficam la sem
        // efeito (so o `cacheMemoria` e fonte da verdade pro adapter).
        for (const r of renomeadas) persistir(r.nova, r.valor);
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
  obterDb().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ chave, valor });
  }).catch(e => console.warn('[auth-storage] persistência falhou:', e));
}

function remover(chave) {
  obterDb().then(db => {
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
    const db = await obterDb();
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
