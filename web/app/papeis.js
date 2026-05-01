// papeis.js — helper centralizado para descobrir os papéis do usuário logado.
// Cacheia o resultado por sessão (em memória apenas — limpo ao logout).
//
// Uso:
//   const papeis = await pegarPapeis();   // ['admin','operador'] | ['operador'] | []
//   await temPapel('admin');              // boolean
//   limparCachePapeis();                  // chamado no logout

import { supabase, pegarSessao } from './supabase.js';

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
    .eq('usuario_id', uid);

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
