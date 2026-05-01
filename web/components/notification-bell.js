// notification-bell.js — Badge de notificações não-lidas (CP5-FIX).
// Agora é só um contador realtime: lê de `notificacao` filtrando por
// usuário (ou broadcast), atualiza o elemento-slot e re-faz a contagem
// em INSERT/UPDATE/DELETE. O drawer antigo foi descontinuado — cliques
// em "Notificações" da sidebar levam para /notificacoes (tela paginada
// completa). Mantemos `montarSino` / `desmontarSino` na API pois a
// sidebar chama estes nomes.

import { supabase, pegarSessao } from '../app/supabase.js';

let canalBell = null;
let slotSel   = '#sidebar-bell-badge';

export async function montarSino(opcoes = {}) {
  if (opcoes.slotBadge) slotSel = opcoes.slotBadge;
  await atualizarContagem();
  ligarRealtime();
}

export function desmontarSino() {
  if (canalBell) {
    supabase.removeChannel(canalBell).catch(() => {});
    canalBell = null;
  }
}

async function atualizarContagem() {
  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) return;

  const { count, error } = await supabase
    .from('notificacao')
    .select('id', { count: 'exact', head: true })
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`)
    .is('lida_em', null)
    .is('descartada_em', null);

  if (error) {
    console.warn('[bell] contagem falhou:', error.message);
    return;
  }

  pintar(count ?? 0);
}

function pintar(n) {
  const slot = document.querySelector(slotSel);
  if (!slot) return;
  slot.dataset.zero = n === 0 ? 'true' : 'false';
  slot.textContent = n > 99 ? '99+' : String(n);
}

function ligarRealtime() {
  if (canalBell) return;
  canalBell = supabase.channel('sidebar-bell')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacao' },
        () => atualizarContagem())
    .subscribe();
}
