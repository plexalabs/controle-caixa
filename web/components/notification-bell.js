// notification-bell.js — Sino de notificações do topo.
//
// Responsabilidades:
//  1. Contagem realtime de não-lidas → pinta o badge da sidebar
//     (#sidebar-bell-badge) e o pontinho do sino na topbar (#tb-bell-dot).
//  2. Popup do sino: clicar em #tb-bell abre um painel ancorado no sino,
//     com as notificações recentes em lista rolável + atalho "ver todas".
//  3. Fase 2 do push: em INSERT via realtime, se a aba está em background
//     e há permissão, dispara uma Notification do sistema operacional.
//
// API preservada: montarSino() / desmontarSino() — a sidebar chama estes.

import { supabase, pegarSessao } from '../app/supabase.js';
import { navegar } from '../app/router.js';
import { destinoNotificacao, enriquecerNotificacoes } from '../app/notificacao-router.js';

let canalBell = null;
let uidAtual  = null;
let popAberto = false;
let itensPop  = [];
let escListener = null;
let foraListener = null;

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_SINO = `<svg ${SVG}><path d="M3 6a5 5 0 0 1 10 0v3l1.5 2H1.5L3 9V6Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`;

export async function montarSino(opcoes = {}) {
  void opcoes;
  fecharPop();
  const sessao = await pegarSessao();
  uidAtual = sessao?.user?.id || null;
  await atualizarContagem();
  ligarRealtime();

  // Liga o sino da topbar — clicar abre/fecha o popup.
  const bell = document.querySelector('#tb-bell');
  if (bell && !bell.dataset.ligado) {
    bell.dataset.ligado = '1';
    bell.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePop();
    });
  }
}

export function desmontarSino() {
  fecharPop();
  if (canalBell) {
    supabase.removeChannel(canalBell).catch(() => {});
    canalBell = null;
  }
  uidAtual = null;
}

// ─── Contagem ────────────────────────────────────────────────────────
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
  if (error) { console.warn('[bell] contagem falhou:', error.message); return; }
  pintar(count ?? 0);
}

function pintar(n) {
  const badge = document.querySelector('#sidebar-bell-badge');
  if (badge) {
    badge.dataset.zero = n === 0 ? 'true' : 'false';
    badge.textContent = n > 99 ? '99+' : String(n);
  }
  const dot = document.querySelector('#tb-bell-dot');
  if (dot) dot.hidden = n === 0;
}

function ligarRealtime() {
  if (canalBell) return;
  canalBell = supabase.channel('sidebar-bell')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacao' },
        (payload) => {
          atualizarContagem();
          if (popAberto) carregarItensPop();
          if (payload.eventType === 'INSERT') tentarDispararNotificacaoSO(payload.new);
        })
    .subscribe();
}

// ─── Popup do sino ───────────────────────────────────────────────────
function togglePop() {
  if (popAberto) fecharPop();
  else abrirPop();
}

function abrirPop() {
  const bell = document.querySelector('#tb-bell');
  if (!bell || popAberto) return;

  const pop = document.createElement('div');
  pop.className = 'bellpop';
  pop.id = 'bellpop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Notificações');
  pop.innerHTML = `
    <header class="bellpop-head">
      <span class="bellpop-titulo">Notificações</span>
    </header>
    <div class="bellpop-lista" id="bellpop-lista">
      <div class="bellpop-vazio">Carregando…</div>
    </div>
    <a href="/notificacoes" data-link class="bellpop-rodape" id="bellpop-todas">
      Ver todas as notificações
      <svg ${SVG}><path d="M3 8h9M9 4l4 4-4 4"/></svg>
    </a>`;

  document.body.appendChild(pop);
  posicionarPop(pop, bell);
  popAberto = true;
  bell.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => pop.classList.add('is-open'));

  pop.querySelector('#bellpop-todas')?.addEventListener('click', () => fecharPop());

  escListener = (e) => { if (e.key === 'Escape') fecharPop(); };
  foraListener = (e) => {
    if (!pop.contains(e.target) && !bell.contains(e.target)) fecharPop();
  };
  document.addEventListener('keydown', escListener);
  setTimeout(() => document.addEventListener('mousedown', foraListener), 0);
  window.addEventListener('resize', fecharPop, { once: true });

  carregarItensPop();
}

function fecharPop() {
  const pop = document.querySelector('#bellpop');
  popAberto = false;
  document.querySelector('#tb-bell')?.setAttribute('aria-expanded', 'false');
  if (escListener) { document.removeEventListener('keydown', escListener); escListener = null; }
  if (foraListener) { document.removeEventListener('mousedown', foraListener); foraListener = null; }
  if (!pop) return;
  pop.classList.remove('is-open');
  pop.classList.add('is-closing');
  setTimeout(() => pop.remove(), 160);
}

function posicionarPop(pop, bell) {
  const r = bell.getBoundingClientRect();
  const W = 340;
  const margem = 10;
  let left = r.right - W;                 // alinha a borda direita ao sino
  left = Math.max(margem, Math.min(left, window.innerWidth - W - margem));
  pop.style.left = `${left}px`;
  pop.style.top  = `${r.bottom + 8}px`;
}

async function carregarItensPop() {
  const lista = document.querySelector('#bellpop-lista');
  if (!lista) return;
  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) { lista.innerHTML = `<div class="bellpop-vazio">Sessão inválida.</div>`; return; }

  const { data, error } = await supabase
    .from('notificacao')
    .select('id, tipo, severidade, titulo, mensagem, lancamento_id, caixa_id, lida_em, criada_em')
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`)
    .is('descartada_em', null)
    .order('criada_em', { ascending: false })
    .limit(12);

  if (error) { lista.innerHTML = `<div class="bellpop-vazio">Não foi possível carregar.</div>`; return; }
  if (!data || !data.length) {
    lista.innerHTML = `
      <div class="bellpop-vazio">
        <span class="bellpop-vazio-icone" aria-hidden="true">${ICON_SINO}</span>
        Nenhuma notificação por aqui.
      </div>`;
    return;
  }

  itensPop = await enriquecerNotificacoes(data, supabase);
  lista.innerHTML = itensPop.map(itemHtml).join('');
  lista.querySelectorAll('[data-bell-id]').forEach(el => {
    el.addEventListener('click', () => abrirItem(el.dataset.bellId));
  });
}

function itemHtml(n) {
  const lida = !!n.lida_em;
  const tom = n.severidade === 'urgente' ? 'danger'
            : n.severidade === 'aviso'   ? 'warn'
            : 'info';
  return `
    <button type="button" class="bellpop-item" data-bell-id="${esc(n.id)}" data-lida="${lida}">
      <span class="bellpop-item-dot" data-tom="${tom}" aria-hidden="true"></span>
      <span class="bellpop-item-corpo">
        <span class="bellpop-item-topo">
          <span class="bellpop-item-titulo">${esc(n.titulo)}</span>
          <time class="bellpop-item-tempo">${tempoRel(n.criada_em)}</time>
        </span>
        <span class="bellpop-item-msg">${esc(n.mensagem)}</span>
      </span>
    </button>`;
}

async function abrirItem(id) {
  const n = itensPop.find(x => x.id === id);
  if (!n) return;
  if (!n.lida_em) {
    supabase.from('notificacao')
      .update({ lida_em: new Date().toISOString() })
      .eq('id', id)
      .then(() => atualizarContagem());
  }
  fecharPop();
  const { url, motivo } = destinoNotificacao(n);
  navegar(motivo === 'ok' && url ? url : '/notificacoes');
}

// ─── Notification API do SO (push fase 2) ────────────────────────────
function tentarDispararNotificacaoSO(notif) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  if (notif.usuario_destino && notif.usuario_destino !== uidAtual) return;

  try {
    const n = new Notification(notif.titulo || 'Caixa Boti', {
      body: notif.mensagem || '',
      icon: '/assets/logo.svg',
      badge: '/assets/logo.svg',
      tag:  `notif-${notif.tipo || 'geral'}`,
      requireInteraction: (notif.severidade || 'info') === 'urgente',
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

// ─── Helpers ─────────────────────────────────────────────────────────
function tempoRel(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d} d`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
