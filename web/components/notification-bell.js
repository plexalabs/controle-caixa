// notification-bell.js — Badge de notificações não-lidas (CP5-FIX).
// Agora é só um contador realtime: lê de `notificacao` filtrando por
// usuário (ou broadcast), atualiza o elemento-slot e re-faz a contagem
// em INSERT/UPDATE/DELETE. O drawer antigo foi descontinuado — cliques
// em "Notificações" da sidebar levam para /notificacoes (tela paginada
// completa). Mantemos `montarSino` / `desmontarSino` na API pois a
// sidebar chama estes nomes.
//
// CP-NOTIF-PUSH (Fase 2): em INSERT que chega via realtime, se o
// browser tem permission concedida E a aba não está visível, dispara
// uma notification do sistema operacional (Notifications API). Click
// na notification foca a aba e leva pra /notificacoes (router resolve).

import { supabase, pegarSessao } from '../app/supabase.js';

let canalBell = null;
let slotSel   = '#sidebar-bell-badge';
let uidAtual  = null;

export async function montarSino(opcoes = {}) {
  if (opcoes.slotBadge) slotSel = opcoes.slotBadge;
  const sessao = await pegarSessao();
  uidAtual = sessao?.user?.id || null;
  await atualizarContagem();
  ligarRealtime();
}

export function desmontarSino() {
  if (canalBell) {
    supabase.removeChannel(canalBell).catch(() => {});
    canalBell = null;
  }
  uidAtual = null;
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
        (payload) => {
          atualizarContagem();
          // Em INSERT, considera disparar Notification do SO
          if (payload.eventType === 'INSERT') {
            tentarDispararNotificacaoSO(payload.new);
          }
        })
    .subscribe();
}

/**
 * Dispara `new Notification()` se:
 *  - Notifications API suportada
 *  - Permission === 'granted'
 *  - Aba está em background (document.visibilityState !== 'visible')
 *  - Notificação é pro usuário atual ou broadcast (usuario_destino IS NULL)
 *
 * Click na notificação OS foca a aba e abre /notificacoes (a tela
 * resolve o destino baseado na notificação clicada).
 */
function tentarDispararNotificacaoSO(notif) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  // Filtra por destino (mesma lógica das queries do feed)
  if (notif.usuario_destino && notif.usuario_destino !== uidAtual) return;

  const titulo = notif.titulo || 'Caixa Boti';
  const corpo = notif.mensagem || '';
  const sev = notif.severidade || 'info';

  try {
    const n = new Notification(titulo, {
      body: corpo,
      icon: '/assets/logo.svg',
      badge: '/assets/logo.svg',
      tag:  `notif-${notif.tipo || 'geral'}`,  // mesmo tipo se substitui (não acumula)
      requireInteraction: sev === 'urgente',
      silent: false,
      data: { url: '/notificacoes', notifId: notif.id },
    });
    n.onclick = () => {
      window.focus();
      try {
        window.history.pushState(null, '', '/notificacoes');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (_) { window.location.href = '/notificacoes'; }
      n.close();
    };
  } catch (e) {
    console.warn('[bell] notification SO falhou:', e.message);
  }
}
