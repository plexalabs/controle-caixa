// papeis.js — helper centralizado para descobrir os papéis do usuário logado.
// Cacheia o resultado por sessão (em memória apenas — limpo ao logout).
//
// Uso:
//   const papeis = await pegarPapeis();   // ['admin','operador'] | ['operador'] | []
//   await temPapel('admin');              // boolean
//   await temPermissao('caixa.abrir');    // boolean (RBAC novo, Sessao 1)
//   limparCachePapeis();                  // chamado no logout

import { supabase, pegarSessao } from './supabase.js';
import { log }                   from './log.js';

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

/**
 * Verifica se o usuario atual tem uma permissao especifica do RBAC.
 * Chama a RPC public.tem_permissao() (SECURITY DEFINER) que considera:
 *   1. Bypass total se papel='super_admin' ativo
 *   2. Permissao via perfil principal (usuario_perfil -> perfil_permissao)
 *   3. Permissao via override pontual (usuario_permissao_extra)
 *
 * IMPORTANTE: hoje (Sessao 1 do RBAC) esta funcao existe mas NAO eh
 * usada em lugar nenhum. As checagens atuais continuam usando
 * temPapel('admin'). Adocao gradual nas Sessoes 2 e 3 do RBAC.
 *
 * Fail-closed: qualquer erro de rede/RPC -> false (nega).
 */
export async function temPermissao(codigo) {
  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase.rpc('tem_permissao', {
    p_usuario_id: uid,
    p_codigo:     codigo,
  });

  if (error) {
    log.erro('tem_permissao falhou', error, { codigo });
    return false;
  }
  return data === true;
}

export function limparCachePapeis() {
  cache = null;
  cacheUid = null;
}

// Listener: invalida cache em logout/login para evitar dados de sessão antiga.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT' || evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
    limparCachePapeis();
  }
});
