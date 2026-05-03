// papeis.js — papéis (legacy) + permissões (RBAC) do usuário logado.
// Cache em memória, invalidado em logout/login/USER_UPDATED.
//
// API pública:
//   const papeis = await pegarPapeis();      // ['admin','operador',...] (legacy)
//   await temPapel('admin');                 // boolean (legacy)
//   await carregarPermissoes();              // pré-carrega cache RBAC
//   temPermissaoSync('caixa.abrir');         // boolean síncrono (UI em loop)
//   await temPermissao('caixa.abrir');       // boolean async (handlers)
//   limparCachePapeis();                     // limpa tudo (papeis + permissoes)
//   invalidarCachePermissoes();              // limpa só permissoes
//
// Cache de permissões:
//   - 1 minuto de TTL (config inline em CACHE_PERMISSOES_TTL_MS)
//   - Wildcard '*' representa super_admin (bypass total)
//   - 1 query por refresh: lê papel super_admin → se sim, '*'; se não,
//     lê (perfil_permissao via usuario_perfil) UNION (usuario_permissao_extra)
//   - Invalidado pelo listener de auth e por chamadas explícitas após
//     mutações que afetam permissões (definir_papeis_usuario etc.)

import { supabase, pegarSessao } from './supabase.js';
import { log }                   from './log.js';

// ─── Cache de papéis (legacy) ────────────────────────────────────────────
let cache = null;
let cacheUid = null;

export async function pegarPapeis() {
  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) return [];

  if (cache && cacheUid === uid) return cache;

  const { data, error } = await supabase
    .from('usuario_papel')
    .select('papel')
    .eq('usuario_id', uid)
    .eq('ativo', true);

  if (error) {
    console.warn('[papeis] erro ao consultar usuario_papel:', error.message);
    return [];
  }

  cache = (data || []).map(r => r.papel);
  cacheUid = uid;
  return cache;
}

export async function temPapel(papel) {
  const lista = await pegarPapeis();
  return lista.includes(papel);
}

// ─── Cache de permissões (RBAC) ──────────────────────────────────────────
const CACHE_PERMISSOES_TTL_MS = 60_000;
let _permissoesCache = null;        // Set<string>; '*' = super_admin bypass
let _permissoesCacheTimestamp = 0;

/**
 * Carrega TODAS as permissões efetivas do usuário atual num único refresh.
 * Cacheada por CACHE_PERMISSOES_TTL_MS. Retorna o Set de códigos OU
 * Set(['*']) pra super_admin.
 *
 * Não é fail-fast: erros de RPC viram cache vazio (nega tudo).
 */
export async function carregarPermissoes() {
  const agora = Date.now();
  if (_permissoesCache && (agora - _permissoesCacheTimestamp) < CACHE_PERMISSOES_TTL_MS) {
    return _permissoesCache;
  }

  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) {
    _permissoesCache = new Set();
    _permissoesCacheTimestamp = agora;
    return _permissoesCache;
  }

  // 1. Super_admin? Bypass total via wildcard.
  const { data: papeis, error: erroPapeis } = await supabase
    .from('usuario_papel')
    .select('papel')
    .eq('usuario_id', uid)
    .eq('ativo', true);

  if (erroPapeis) {
    log.erro('carregarPermissoes: falha ao ler usuario_papel', erroPapeis);
    _permissoesCache = new Set();
    _permissoesCacheTimestamp = agora;
    return _permissoesCache;
  }

  if (papeis?.some(p => p.papel === 'super_admin')) {
    _permissoesCache = new Set(['*']);
    _permissoesCacheTimestamp = agora;
    return _permissoesCache;
  }

  // 2. Permissões do perfil principal (via JOIN aninhado de PostgREST).
  const { data: perfilRow, error: erroPerfil } = await supabase
    .from('usuario_perfil')
    .select('perfil:perfil_id ( perfil_permissao ( permissao_codigo ) )')
    .eq('usuario_id', uid)
    .maybeSingle();

  if (erroPerfil) {
    log.erro('carregarPermissoes: falha ao ler usuario_perfil', erroPerfil);
  }

  const fromPerfil = (perfilRow?.perfil?.perfil_permissao || [])
    .map(pp => pp.permissao_codigo);

  // 3. Permissões extras pontuais (override).
  const { data: extras, error: erroExtras } = await supabase
    .from('usuario_permissao_extra')
    .select('permissao_codigo')
    .eq('usuario_id', uid);

  if (erroExtras) {
    log.erro('carregarPermissoes: falha ao ler usuario_permissao_extra', erroExtras);
  }

  const fromExtras = (extras || []).map(e => e.permissao_codigo);

  _permissoesCache = new Set([...fromPerfil, ...fromExtras]);
  _permissoesCacheTimestamp = agora;
  return _permissoesCache;
}

/**
 * Síncrona: usa cache em memória. Se ainda não foi carregado retorna false
 * (fail-closed). Chame carregarPermissoes() no topo da render que vai
 * usar isto.
 */
export function temPermissaoSync(codigo) {
  if (!_permissoesCache) return false;
  return _permissoesCache.has('*') || _permissoesCache.has(codigo);
}

/**
 * Async: garante cache populado, retorna boolean. Use em handlers que
 * podem ser disparados antes do render principal terminar.
 *
 * Fail-closed: erro de rede/RPC -> false (nega).
 */
export async function temPermissao(codigo) {
  try {
    const perms = await carregarPermissoes();
    return perms.has('*') || perms.has(codigo);
  } catch (e) {
    log.erro('temPermissao falhou', e, { codigo });
    return false;
  }
}

/**
 * Força refresh do cache de permissões. Chame depois de operações que
 * mudam papéis/perfil/permissoes_extras do usuário atual.
 */
export function invalidarCachePermissoes() {
  _permissoesCache = null;
  _permissoesCacheTimestamp = 0;
}

/**
 * Lista TODAS as permissões catalogadas no banco, ordenadas por modulo
 * + codigo. Usada pela tela /configuracoes/permissoes pra renderizar
 * o checklist de permissoes (agrupado por modulo) no drawer de
 * criacao/edicao de perfil. NAO faz checagem de permissao (qualquer
 * authenticated pode listar o catalogo via RLS de leitura da Sessao 1).
 *
 * Retorna [{ codigo, modulo, descricao, destrutiva }] ou [] em erro.
 */
export async function listarTodasPermissoes() {
  const { data, error } = await supabase
    .from('permissao')
    .select('codigo, modulo, descricao, destrutiva')
    .order('modulo', { ascending: true })
    .order('codigo', { ascending: true });
  if (error) {
    log.erro('listarTodasPermissoes falhou', error);
    return [];
  }
  return data || [];
}

// ─── Limpeza geral ───────────────────────────────────────────────────────
export function limparCachePapeis() {
  cache = null;
  cacheUid = null;
  invalidarCachePermissoes();
}

// Listener: invalida tudo em logout/login/USER_UPDATED.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT' || evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
    limparCachePapeis();
  }
});
