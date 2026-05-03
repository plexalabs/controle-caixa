// papeis.js — helper centralizado para descobrir os papéis do usuário logado.
// Cacheia o resultado por sessão (em memória apenas — limpo ao logout).
//
// Uso:
//   const papeis = await pegarPapeis();   // ['admin','operador'] | ['operador'] | []
//   await temPapel('admin');              // boolean
//   await temPermissao('caixa.abrir');    // boolean (RBAC novo, Sessao 1)
//   limparCachePapeis();                  // chamado no logout
//
// Backward-compat super_admin (CP-RBAC Sessao 1): se o usuario tem
// papel 'super_admin' ativo, pegarPapeis() injeta 'admin' na lista
// retornada (caso ja nao esteja). Razao: super_admin eh estritamente
// mais poderoso que admin (decisao arquitetural), e o sistema atual
// tem 8 call sites fazendo `papeis.includes('admin')` direto. Sem
// essa expansao, super_admins perderiam acesso a /configuracoes,
// /usuarios, /relatorios etc. ate as Sessoes 2/3 do RBAC trocarem
// para temPermissao(). A expansao acontece DEPOIS do cache pra que
// limparCachePapeis() continue funcionando normalmente.

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

  const papeisDoBanco = (data || []).map(r => r.papel);

  // Expansao de super_admin -> admin (ver header do arquivo).
  if (papeisDoBanco.includes('super_admin') && !papeisDoBanco.includes('admin')) {
    papeisDoBanco.push('admin');
  }

  cache = papeisDoBanco;
  cacheUid = uid;
  return cache;
}

export async function temPapel(papel) {
  const lista = await pegarPapeis();
  // Defesa em profundidade: super_admin satisfaz qualquer checagem de
  // papel (caso pegarPapeis() seja substituido no futuro e a expansao
  // acima saia, temPapel continua coerente).
  if (lista.includes('super_admin')) return true;
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
