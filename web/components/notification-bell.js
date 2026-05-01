// notification-bell.js — Sino com badge no header (CP5.3).
// Mostra contagem de notificações não-lidas (filtradas pelo usuário ou
// broadcast — usuario_destino = uid OR null). Click abre drawer lateral
// com últimas 20 + "Marcar todas como lidas" + "Ver todas".
// Realtime atualiza badge ao vivo. Atalho Alt+N abre o drawer.

import { supabase, pegarSessao } from '../app/supabase.js';
import { abrirModal, fecharModal } from './modal.js';
import { navegar } from '../app/router.js';
import { mostrarToast } from '../app/notifications.js';

let canalBell = null;
let contagemAtual = 0;
let atalhoLigado = false;

export async function montarSino() {
  const wrap = document.querySelector('#bell-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <button id="bell-btn" type="button" class="bell-btn"
            aria-label="Notificações" aria-haspopup="dialog" aria-expanded="false"
            title="Notificações (Alt+N)">
      ${svgSino()}
      <span id="bell-badge" class="bell-badge" data-zero="true" aria-hidden="true">0</span>
    </button>
  `;

  document.querySelector('#bell-btn').addEventListener('click', abrirDrawer);
  if (!atalhoLigado) {
    document.addEventListener('keydown', atalhoTeclado);
    atalhoLigado = true;
  }

  await atualizarContagem();
  ligarRealtime();
}

export function desmontarSino() {
  if (canalBell) {
    supabase.removeChannel(canalBell).catch(() => {});
    canalBell = null;
  }
}

function atalhoTeclado(e) {
  if (e.altKey && (e.key === 'n' || e.key === 'N')) {
    if (!document.querySelector('#bell-btn')) return;
    e.preventDefault();
    abrirDrawer();
  }
}

// ─── Contagem ───────────────────────────────────────────────────────
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
    console.warn('[bell] erro ao contar notificacoes:', error.message);
    return;
  }

  contagemAtual = count ?? 0;
  pintarBadge();
}

function pintarBadge() {
  const badge = document.querySelector('#bell-badge');
  if (!badge) return;
  badge.dataset.zero = contagemAtual === 0 ? 'true' : 'false';
  badge.textContent = contagemAtual > 99 ? '99+' : String(contagemAtual);
}

// ─── Drawer ─────────────────────────────────────────────────────────
async function abrirDrawer() {
  const btn = document.querySelector('#bell-btn');
  if (btn) btn.setAttribute('aria-expanded', 'true');

  abrirModal({
    lateral: true,
    eyebrow: 'Avisos',
    titulo:  contagemAtual > 0
              ? `${contagemAtual} ${contagemAtual === 1 ? 'aviso não lido' : 'avisos não lidos'}.`
              : 'Sem avisos pendentes.',
    conteudo: `<div id="bell-conteudo"><div class="space-y-2">
                  ${[1,2,3].map(() => `<div class="skel" style="height:3.5rem;border-radius:8px"></div>`).join('')}
                </div></div>`,
    rodape: `
      <div class="notif-rodape">
        <button type="button" id="bell-marcar-todas" class="btn-link" disabled>
          Marcar todas como lidas
        </button>
        <a href="/notificacoes" data-link class="btn-link" id="bell-ver-todas">Ver todas →</a>
      </div>`,
  });

  // Quando o drawer fecha (via botão X / ESC / click fora), reseta aria-expanded.
  const overlay = document.querySelector('.overlay-fundo');
  if (overlay) {
    const obs = new MutationObserver(() => {
      if (!document.body.contains(overlay) && btn) {
        btn.setAttribute('aria-expanded', 'false');
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Click no link "Ver todas" — drawer fecha junto.
  document.querySelector('#bell-ver-todas')?.addEventListener('click', () => {
    setTimeout(() => fecharModal(true), 60);
  });

  await carregarLista();
}

async function carregarLista() {
  const conteudo = document.querySelector('#bell-conteudo');
  if (!conteudo) return;

  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;

  const { data, error } = await supabase
    .from('notificacao')
    .select('id, tipo, severidade, titulo, mensagem, lancamento_id, caixa_id, criada_em, lida_em')
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`)
    .is('descartada_em', null)
    .order('criada_em', { ascending: false })
    .limit(20);

  if (error) {
    conteudo.innerHTML = `<p class="alert">Não conseguimos carregar os avisos. ${esc(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    conteudo.innerHTML = `
      <div class="vazio" style="padding:2rem 1rem">
        <div class="vazio-num" style="font-size:2.4rem">○</div>
        <p class="vazio-titulo" style="font-size:1.05rem">Caixa de avisos limpa.</p>
        <p class="vazio-desc">Quando algo precisar da sua atenção, aparece aqui.</p>
      </div>`;
    return;
  }

  conteudo.innerHTML = `
    <ul class="notif-lista" role="list">
      ${data.map(itemHtml).join('')}
    </ul>`;

  // Click em item → marca lida + navega.
  conteudo.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-acao]')) return;
      const id    = el.dataset.notifId;
      const alvo  = el.dataset.alvo;
      const lida  = el.dataset.lida === 'true';
      if (!lida) marcarLida(id);
      fecharModal(true);
      if (alvo && alvo !== 'none') navegar(alvo);
    });
  });

  conteudo.querySelectorAll('[data-acao="marcar-lida"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.closest('[data-notif-id]')?.dataset.notifId;
      if (!id) return;
      await marcarLida(id);
      await carregarLista();
      await atualizarContagem();
    });
  });

  // "Marcar todas" — só se houver ao menos 1 não-lida.
  const naoLidas = data.filter(n => !n.lida_em);
  const btnTodas = document.querySelector('#bell-marcar-todas');
  if (btnTodas) {
    btnTodas.disabled = naoLidas.length === 0;
    btnTodas.onclick = async () => {
      if (naoLidas.length === 0) return;
      btnTodas.disabled = true;
      const ids = naoLidas.map(n => n.id);
      const { error: e } = await supabase
        .from('notificacao')
        .update({ lida_em: new Date().toISOString() })
        .in('id', ids);
      if (e) {
        mostrarToast('Não foi possível marcar tudo como lido: ' + e.message, 'erro', 4000);
        btnTodas.disabled = false;
        return;
      }
      mostrarToast(`${ids.length} ${ids.length === 1 ? 'aviso marcado' : 'avisos marcados'} como lido${ids.length === 1 ? '' : 's'}.`, 'ok', 2000);
      await carregarLista();
      await atualizarContagem();
    };
  }
}

function itemHtml(n) {
  const lida = !!n.lida_em;
  let alvo = 'none';
  if (n.caixa_id)       alvo = `/caixa/${n.caixa_id}`;
  else if (n.lancamento_id) alvo = '/pendencias';

  return `
    <li>
      <button class="notif-item" data-notif-id="${esc(n.id)}" data-alvo="${esc(alvo)}"
              data-severidade="${esc(n.severidade)}" data-lida="${lida}">
        <div class="notif-item-cabec">
          <strong class="notif-item-titulo">${esc(n.titulo)}</strong>
          <time class="notif-item-tempo">${tempoRelativo(n.criada_em)}</time>
        </div>
        <p class="notif-item-mensagem">${esc(n.mensagem)}</p>
        ${!lida ? '<button type="button" class="notif-item-acao" data-acao="marcar-lida">Marcar como lida</button>' : ''}
      </button>
    </li>`;
}

async function marcarLida(id) {
  const { error } = await supabase
    .from('notificacao')
    .update({ lida_em: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.warn('[bell] erro ao marcar lida:', error.message);
  }
  await atualizarContagem();
}

// ─── Realtime ───────────────────────────────────────────────────────
function ligarRealtime() {
  if (canalBell) return;
  canalBell = supabase.channel('header-bell')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacao' },
        () => atualizarContagem())
    .subscribe();
}

// ─── Helpers ─────────────────────────────────────────────────────────
function svgSino() {
  return `
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 3 C7.5 3 5 5.5 5 9 V12 L3.5 14.5 H18.5 L17 12 V9 C17 5.5 14.5 3 11 3 Z"
            stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
      <path d="M9 17 C9 18.1 9.9 19 11 19 C12.1 19 13 18.1 13 17"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    </svg>`;
}

function tempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'agora';
  if (min < 60)  return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? 's' : ''}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
