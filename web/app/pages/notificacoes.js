// notificacoes.js — Tela /notificacoes (refator v2 "Clean Profissional").
// Lista paginada (20/página) dos avisos do usuário, com resumo lateral
// fixo, filtros próprios v2 e paginação numerada estilo Google. Cada
// TIPO de notificação tem cor, ícone e rótulo próprios. Namespace .ntf-*.

import { supabase, pegarSessao } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';
import { destinoNotificacao, enriquecerNotificacoes } from '../notificacao-router.js';
import { log } from '../log.js';
import { debounce } from '../utils.js';
import { estadoPush, ativarPush, desativarPush, inscritoAtualmente } from '../push.js';

const POR_PAGINA = 20;
let canalNotif = null;
let paginaAtual = 1;
let totalAtual = 0;
let filtros = { estado: '', sev: '', busca: '', tipo: '' };

// ─── Ícones SVG (stroke currentColor, viewBox 16) ────────────────────
const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_DOC    = `<svg ${SVG}><path d="M9 1.7H4.6a1 1 0 0 0-1 1v10.6a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V5.2Z"/><path d="M9 1.7v3.5h3.4"/><path d="M6 8.7h4M6 11h2.6"/></svg>`;
const ICON_ALERTA = `<svg ${SVG}><path d="M8 1.7 1.2 13.8h13.6Z"/><path d="M8 6.3v3.4M8 11.7h.01"/></svg>`;
const ICON_CAIXA  = `<svg ${SVG}><path d="M2 8.4 4.2 3h7.6L14 8.4"/><path d="M2 8.4h3.6l1 1.9h2.8l1-1.9H14v4.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/></svg>`;
const ICON_SOL    = `<svg ${SVG}><circle cx="8" cy="8" r="3.1"/><path d="M8 1.6v1.5M8 12.9v1.5M3.2 3.2l1 1M11.8 11.8l1 1M1.6 8h1.5M12.9 8h1.5M3.2 12.8l1-1M11.8 4.2l1-1"/></svg>`;
const ICON_SINO   = `<svg ${SVG}><path d="M8 2.2a3.6 3.6 0 0 0-3.6 3.6v2.3L3 10.4h10L11.6 8.1V5.8A3.6 3.6 0 0 0 8 2.2Z"/><path d="M6.6 12.5a1.6 1.6 0 0 0 2.8 0"/></svg>`;
const ICON_BUSCA  = `<svg width="14" height="14" ${SVG}><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>`;
const ICON_SINO_OFF = `<svg ${SVG}><path d="M2 2l12 12"/><path d="M5 5.6v.2L3 10.4h8"/><path d="M11.5 8.6V5.8A3.6 3.6 0 0 0 6.4 2.6"/><path d="M6.6 12.5a1.6 1.6 0 0 0 2.8 0"/></svg>`;
const ICON_SINO_OK  = `<svg ${SVG}><path d="M8 2.2a3.6 3.6 0 0 0-3.6 3.6v2.3L3 10.4h10L11.6 8.1V5.8A3.6 3.6 0 0 0 8 2.2Z"/><path d="M6.6 12.5a1.6 1.6 0 0 0 2.8 0"/><path d="m9.8 4.4 1.4 1.4L14 3"/></svg>`;

// ─── Catálogo de tipos — cada tipo tem cor (tom), ícone e rótulo ─────
const TIPOS = {
  pendencia_aberta:   { rotulo: 'Pendência aberta',   tom: 'info',   icone: ICON_DOC },
  pendencia_atrasada: { rotulo: 'Pendência atrasada', tom: 'danger', icone: ICON_ALERTA },
  caixa_nao_fechado:  { rotulo: 'Caixa em aberto',    tom: 'warn',   icone: ICON_CAIXA },
  bom_dia_resumo:     { rotulo: 'Resumo do dia',      tom: 'accent', icone: ICON_SOL },
};

// Resolve a aparência de uma notificação. Tipos desconhecidos caem num
// fallback: o tom vem da severidade e o rótulo é o tipo cru legível.
function metaTipo(tipo, severidade) {
  const t = TIPOS[tipo];
  if (t) return t;
  const tom = severidade === 'urgente' ? 'danger'
            : severidade === 'aviso'   ? 'warn'
            : 'info';
  const rotulo = (tipo || 'aviso').replace(/_/g, ' ');
  return { rotulo, tom, icone: ICON_SINO };
}

export async function renderNotificacoes() {
  desmontar();

  // Estado inicial vem da URL — filtros e página bookmarkáveis.
  const sp = new URLSearchParams(location.search);
  filtros.estado = sp.get('estado') || '';
  filtros.sev    = sp.get('sev') || '';
  filtros.busca  = (sp.get('busca') || '').trim();
  filtros.tipo   = sp.get('tipo') || '';
  paginaAtual = Math.max(1, parseInt(sp.get('p') || '1', 10) || 1);

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'notificacoes',
    conteudo: `
    <main id="main" class="ntf">
      <header class="ntf-header">
        <p class="ntf-eyebrow">Histórico</p>
        <h1 class="ntf-title">Avisos</h1>
        <p class="ntf-sub">
          Tudo que apareceu — lidas, não lidas e descartadas. Cada tipo
          de aviso tem sua cor; o resumo ao lado mostra o panorama.
        </p>
      </header>

      <section id="ntf-push" class="ntf-push" aria-live="polite"></section>

      <div class="ntf-layout">
        <div class="ntf-main">
          <section class="ntf-filtros">
            <div class="ntf-chips" role="group" aria-label="Filtrar por estado">
              <button type="button" class="ntf-chip" data-estado="" aria-pressed="true">Todas</button>
              <button type="button" class="ntf-chip" data-estado="nao_lida">
                <span class="ntf-chip-dot" aria-hidden="true"></span>
                Não lidas
                <span class="ntf-chip-count" id="ntf-chip-naolida" data-zero="true">0</span>
              </button>
              <button type="button" class="ntf-chip" data-estado="lida">Lidas</button>
              <button type="button" class="ntf-chip" data-estado="descartada">Descartadas</button>
            </div>

            <div class="ntf-search-wrap">
              <span class="ntf-search-icon" aria-hidden="true">${ICON_BUSCA}</span>
              <input type="search" id="ntf-busca" class="ntf-search-input"
                     placeholder="Buscar título ou mensagem…" autocomplete="off"
                     value="${esc(filtros.busca)}" />
            </div>

            <select id="ntf-sev" class="ntf-select" aria-label="Filtrar por severidade">
              <option value="">Todas severidades</option>
              <option value="urgente">Urgente</option>
              <option value="aviso">Aviso</option>
              <option value="info">Info</option>
            </select>
          </section>

          <section id="ntf-lista" aria-live="polite"></section>
          <nav id="ntf-pag" class="ntf-pag" aria-label="Paginação"></nav>
        </div>

        <aside class="ntf-resumo">
          <p class="ntf-resumo-eyebrow">Resumo</p>
          <button type="button" class="ntf-resumo-destaque" id="ntf-resumo-destaque"
                  data-tone="ok" aria-pressed="false" aria-label="Filtrar avisos não lidos">
            <span class="ntf-resumo-num">—</span>
            <span class="ntf-resumo-lab">não lidas</span>
          </button>
          <div class="ntf-resumo-mini">
            <div class="ntf-resumo-mini-item">
              <span>No histórico</span><strong id="ntf-resumo-total">—</strong>
            </div>
            <div class="ntf-resumo-mini-item">
              <span>Descartadas</span><strong id="ntf-resumo-descartadas">—</strong>
            </div>
          </div>
          <div class="ntf-resumo-sec">
            <p class="ntf-resumo-sec-titulo">Por tipo</p>
            <ul class="ntf-resumo-tipos" id="ntf-resumo-tipos">
              <li class="ntf-resumo-tipo">
                <span class="ntf-resumo-tipo-nome" style="color:var(--ui-ink-3)">Carregando…</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  `,
  });

  ligarShell();
  ligarFiltros();

  await carregar();
  await carregarResumo();
  ligarRealtime();
  await renderBannerPush();
}

// ─── Filtros ─────────────────────────────────────────────────────────
function ligarFiltros() {
  document.querySelectorAll('.ntf-chip').forEach(c => {
    c.addEventListener('click', () => {
      filtros.estado = c.dataset.estado || '';
      aplicarFiltro();
    });
  });

  // Destaque do resumo — atalho que liga/desliga o filtro de não-lidas.
  document.querySelector('#ntf-resumo-destaque')?.addEventListener('click', () => {
    filtros.estado = filtros.estado === 'nao_lida' ? '' : 'nao_lida';
    aplicarFiltro();
  });

  const sev = document.querySelector('#ntf-sev');
  if (sev) {
    sev.value = filtros.sev;
    sev.addEventListener('change', () => {
      filtros.sev = sev.value;
      aplicarFiltro();
    });
  }

  const busca = document.querySelector('#ntf-busca');
  if (busca) {
    busca.addEventListener('input', debounce(() => {
      filtros.busca = busca.value.trim();
      aplicarFiltro();
    }, 280));
    busca.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        busca.value = '';
        filtros.busca = '';
        aplicarFiltro();
      }
    });
  }

  refletirFiltros();
}

// Aplica os filtros: volta pra página 1, espelha na URL, sincroniza os
// controles (chips + resumo) e recarrega a lista.
function aplicarFiltro() {
  paginaAtual = 1;
  escreverUrl();
  refletirFiltros();
  carregar();
}

// Sincroniza o estado visual dos controles a partir de `filtros`:
// chips, destaque do resumo e linhas de tipo marcam o filtro ativo.
function refletirFiltros() {
  document.querySelectorAll('.ntf-chip').forEach(c =>
    c.setAttribute('aria-pressed', String((c.dataset.estado || '') === filtros.estado)));
  const dest = document.querySelector('#ntf-resumo-destaque');
  if (dest) dest.setAttribute('aria-pressed', String(filtros.estado === 'nao_lida'));
  document.querySelectorAll('.ntf-resumo-tipo').forEach(b =>
    b.setAttribute('aria-pressed', String((b.dataset.tipo || '') === filtros.tipo)));
}

function escreverUrl() {
  const p = new URLSearchParams();
  if (filtros.estado)  p.set('estado', filtros.estado);
  if (filtros.sev)     p.set('sev', filtros.sev);
  if (filtros.busca)   p.set('busca', filtros.busca);
  if (filtros.tipo)    p.set('tipo', filtros.tipo);
  if (paginaAtual > 1) p.set('p', String(paginaAtual));
  const qs = p.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : ''));
}

// ─── Banner de push ──────────────────────────────────────────────────
function cardPush({ tom, icone, titulo, desc, botaoId, botaoLabel, botaoAccent }) {
  return `
    <div class="ntf-push-card" data-tom="${tom}">
      <span class="ntf-push-icone" aria-hidden="true">${icone}</span>
      <div class="ntf-push-texto">
        <p class="ntf-push-titulo">${titulo}</p>
        ${desc ? `<p class="ntf-push-desc">${desc}</p>` : ''}
      </div>
      ${botaoId ? `<button type="button" id="${botaoId}" class="ntf-btn${botaoAccent ? ' ntf-btn--accent' : ''}">${botaoLabel}</button>` : ''}
    </div>`;
}

async function renderBannerPush() {
  const slot = document.querySelector('#ntf-push');
  if (!slot) return;
  const e = estadoPush();
  if (!e.suporte_notif) { slot.innerHTML = ''; return; }

  const inscrito = await inscritoAtualmente();

  if (e.permission === 'denied') {
    slot.innerHTML = cardPush({
      tom: 'info', icone: ICON_SINO_OFF,
      titulo: 'Notificações bloqueadas pelo navegador',
      desc: 'Para reativar, abra as configurações deste site no navegador e permita "Notificações".',
    });
    return;
  }

  if (e.permission === 'granted' && inscrito) {
    slot.innerHTML = cardPush({
      tom: 'accent', icone: ICON_SINO_OK,
      titulo: 'Avisos no desktop ativos',
      desc: 'Você recebe os avisos neste dispositivo, mesmo com a aba fechada.',
      botaoId: 'push-desativar', botaoLabel: 'Desativar',
    });
    document.querySelector('#push-desativar')?.addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      ev.target.textContent = 'Desativando…';
      const r = await desativarPush();
      if (r.ok) mostrarToast('Avisos no desktop desativados.', 'ok', 2200);
      else mostrarToast('Não consegui desativar.', 'erro', 3000);
      await renderBannerPush();
    });
    return;
  }

  slot.innerHTML = cardPush({
    tom: 'accent', icone: ICON_SINO,
    titulo: 'Receba avisos no desktop',
    desc: e.suporte_push
      ? 'Seja avisado mesmo com a aba fechada.'
      : 'Seu navegador notifica apenas enquanto a aba estiver aberta.',
    botaoId: 'push-ativar', botaoLabel: 'Ativar', botaoAccent: true,
  });
  document.querySelector('#push-ativar')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = 'Ativando…';
    const r = await ativarPush();
    if (r.ok) {
      mostrarToast(
        r.modo === 'push' ? 'Avisos no desktop ativos!' : 'Notificações ativas (apenas com aba aberta).',
        'ok', 2400,
      );
    } else {
      mostrarToast(`Não consegui ativar: ${r.motivo}`, 'erro', 4000);
    }
    await renderBannerPush();
  });
}

// ─── Resumo lateral ──────────────────────────────────────────────────
async function carregarResumo() {
  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) return;

  // Busca leve (4 colunas) de todos os avisos do usuário pra agregar.
  const { data, error } = await supabase
    .from('notificacao')
    .select('tipo, severidade, lida_em, descartada_em')
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`)
    .limit(2000);
  if (error || !data) return;

  const total       = data.length;
  const descartadas = data.filter(n => n.descartada_em).length;
  const naoLidas    = data.filter(n => !n.lida_em && !n.descartada_em).length;

  // Contagem por tipo — só dos avisos ativos (não descartados).
  // Guarda total e não-lidas: alimentam o badge e o realce de cada tipo.
  const porTipo = {};
  for (const n of data) {
    if (n.descartada_em || !n.tipo) continue;
    const e = porTipo[n.tipo] || (porTipo[n.tipo] = { total: 0, naoLida: 0 });
    e.total++;
    if (!n.lida_em) e.naoLida++;
  }

  const dest = document.querySelector('#ntf-resumo-destaque');
  if (dest) {
    dest.dataset.tone = naoLidas > 0 ? 'warn' : 'ok';
    const num = dest.querySelector('.ntf-resumo-num');
    if (num) num.textContent = String(naoLidas);
  }
  const totalEl = document.querySelector('#ntf-resumo-total');
  const descEl  = document.querySelector('#ntf-resumo-descartadas');
  if (totalEl) totalEl.textContent = String(total);
  if (descEl)  descEl.textContent  = String(descartadas);

  const ul = document.querySelector('#ntf-resumo-tipos');
  if (ul) {
    const linhas = Object.entries(porTipo).sort((a, b) => b[1].total - a[1].total);
    if (!linhas.length) {
      ul.innerHTML = '<li><p class="ntf-resumo-vazio">Nenhum aviso ativo.</p></li>';
    } else {
      ul.innerHTML = linhas.map(([tipo, info]) => {
        const meta = metaTipo(tipo, null);
        const ativo = tipo === filtros.tipo;
        const tt = `${meta.rotulo}${info.naoLida ? ` · ${info.naoLida} não lida${info.naoLida > 1 ? 's' : ''}` : ''} · filtrar`;
        return `
          <li>
            <button type="button" class="ntf-resumo-tipo" data-tipo="${esc(tipo)}"
                    data-tom="${meta.tom}" aria-pressed="${ativo}" title="${esc(tt)}">
              <span class="ntf-resumo-tipo-dot" aria-hidden="true"></span>
              <span class="ntf-resumo-tipo-nome">${esc(meta.rotulo)}</span>
              ${info.naoLida > 0 ? `<span class="ntf-resumo-tipo-nova">${info.naoLida}</span>` : ''}
              <span class="ntf-resumo-tipo-num">${info.total}</span>
            </button>
          </li>`;
      }).join('');
      // Clicar numa linha de tipo liga/desliga o filtro daquele tipo.
      ul.querySelectorAll('.ntf-resumo-tipo').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = btn.dataset.tipo || '';
          filtros.tipo = (filtros.tipo === t) ? '' : t;
          aplicarFiltro();
        });
      });
    }
  }

  // Chip de não-lidas no filtro.
  const chip = document.querySelector('#ntf-chip-naolida');
  if (chip) {
    chip.textContent = String(naoLidas);
    chip.dataset.zero = String(naoLidas === 0);
  }
}

// ─── Carga + render da lista ─────────────────────────────────────────
async function carregar() {
  const lista = document.querySelector('#ntf-lista');
  const pag   = document.querySelector('#ntf-pag');
  if (!lista || !pag) return;

  lista.innerHTML = `
    <div class="ntf-skel-lista">
      ${[1,2,3,4,5].map(() => `<div class="ntf-skel"></div>`).join('')}
    </div>`;
  pag.innerHTML = '';

  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) {
    lista.innerHTML = `<p class="ntf-erro">Sessão inválida — refaça o login.</p>`;
    return;
  }

  const ini = (paginaAtual - 1) * POR_PAGINA;
  const fim = ini + POR_PAGINA - 1;

  let q = supabase
    .from('notificacao')
    .select('id, tipo, severidade, titulo, mensagem, lancamento_id, caixa_id, lida_em, descartada_em, criada_em', { count: 'exact' })
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`);

  if (filtros.estado === 'nao_lida') {
    q = q.is('lida_em', null).is('descartada_em', null);
  } else if (filtros.estado === 'lida') {
    q = q.not('lida_em', 'is', null).is('descartada_em', null);
  } else if (filtros.estado === 'descartada') {
    q = q.not('descartada_em', 'is', null);
  } else {
    q = q.is('descartada_em', null);
  }

  if (filtros.sev)  q = q.eq('severidade', filtros.sev);
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
  if (filtros.busca) {
    const t = filtros.busca.replace(/[%_]/g, m => `\\${m}`);
    q = q.or(`titulo.ilike.%${t}%,mensagem.ilike.%${t}%`);
  }

  q = q.order('criada_em', { ascending: false }).range(ini, fim);

  const { data, error, count } = await q;

  if (error) {
    lista.innerHTML = `<p class="ntf-erro">Não foi possível carregar. ${esc(error.message)}</p>`;
    return;
  }

  totalAtual = count ?? 0;

  if (!data || data.length === 0) {
    lista.innerHTML = `
      <div class="ntf-empty">
        <div class="ntf-empty-icone" aria-hidden="true">${ICON_SINO}</div>
        <p class="ntf-empty-title">Nada por aqui.</p>
        <p class="ntf-empty-msg">
          ${temFiltro()
            ? 'Nenhum aviso com esses filtros. Ajuste os filtros acima ou limpe a busca.'
            : 'Avisos aparecem aqui quando algo precisa da sua atenção.'}
        </p>
      </div>`;
    return;
  }

  const enriquecidas = await enriquecerNotificacoes(data, supabase);

  lista.innerHTML = `
    <ul class="ntf-lista" role="list">
      ${enriquecidas.map((n, i) => itemHtml(n, i)).join('')}
    </ul>`;

  const navegarParaItem = async (el) => {
    const id = el.dataset.notifId;
    const notif = enriquecidas.find(n => n.id === id);
    if (!notif) return;
    if (el.dataset.lida === 'false') marcarLida(id);

    const { url, motivo, erro } = destinoNotificacao(notif);
    if (motivo === 'ok') {
      navegar(url);
    } else if (motivo === 'invalida') {
      log.warn(`notificação ${id} (${notif.tipo}) com payload inválido`,
               { tipo: notif.tipo, caixa_id: notif.caixa_id, lancamento_id: notif.lancamento_id, erro });
      mostrarToast('Esta notificação não tem destino válido.', 'erro', 3500);
    } else {
      mostrarToast('Aviso informativo, sem ação direta.', 'info', 2200);
    }
  };

  lista.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-acao]')) return;
      navegarParaItem(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.target.closest('[data-acao]')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navegarParaItem(el);
      }
    });
  });

  lista.querySelectorAll('[data-acao="marcar-lida"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.ntf-item');
      const id = item?.dataset.notifId;
      if (!id) return;
      btn.disabled = true;
      const ok = await marcarLida(id);
      if (!ok) { btn.disabled = false; return; }
      // Sob o filtro "não lidas" o item deixa de pertencer à lista;
      // nos demais filtros ele continua, só muda pro estado lido.
      if (filtros.estado === 'nao_lida') sairDaLista(item.closest('li'));
      else                               marcarItemLido(item);
      carregarResumo();
    });
  });
  lista.querySelectorAll('[data-acao="descartar"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.ntf-item');
      const id = item?.dataset.notifId;
      if (!id) return;
      btn.disabled = true;
      const ok = await descartar(id);
      if (!ok) { btn.disabled = false; return; }
      // Descartado não aparece nas visões padrão — sai da lista.
      sairDaLista(item.closest('li'));
      carregarResumo();
    });
  });

  renderPaginacao();
}

function temFiltro() {
  return !!(filtros.estado || filtros.sev || filtros.busca || filtros.tipo);
}

function itemHtml(n, i) {
  const lida = !!n.lida_em;
  const descartada = !!n.descartada_em;
  const meta = metaTipo(n.tipo, n.severidade);
  const delay = `style="animation-delay:${Math.min(i * 26, 260)}ms"`;
  // Item raiz é div role=button (NÃO <button>): <button> dentro de
  // <button> é HTML inválido.
  return `
    <li>
      <div class="ntf-item" data-notif-id="${esc(n.id)}" data-tipo="${esc(n.tipo || '')}"
           data-tom="${meta.tom}" data-lida="${lida}" role="button" tabindex="0" ${delay}>
        <span class="ntf-item-icone" aria-hidden="true">${meta.icone}</span>
        <div class="ntf-item-corpo">
          <div class="ntf-item-head">
            <span class="ntf-item-tag">${esc(meta.rotulo)}</span>
            <time class="ntf-item-tempo" title="${esc(n.criada_em)}">${tempoRelativo(n.criada_em)}</time>
          </div>
          <p class="ntf-item-titulo">
            ${!lida && !descartada ? '<span class="ntf-item-dot" aria-hidden="true"></span>' : ''}
            <span>${esc(n.titulo)}</span>
          </p>
          <p class="ntf-item-msg">${esc(n.mensagem)}</p>
          <div class="ntf-item-acoes">
            ${!lida && !descartada
              ? '<button type="button" class="ntf-item-acao" data-acao="marcar-lida">Marcar como lida</button>'
              : ''}
            ${!descartada
              ? '<button type="button" class="ntf-item-acao ntf-item-acao--danger" data-acao="descartar">Descartar</button>'
              : '<span class="ntf-item-acao ntf-item-acao--estatico">descartada</span>'}
          </div>
        </div>
      </div>
    </li>`;
}

// ─── Paginação numerada (estilo Google) ──────────────────────────────
// Sempre mostra a 1ª e a última; a atual e suas vizinhas; "…" nos vãos.
function listaPaginas(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, atual, atual - 1, atual + 1]);
  const arr = [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of arr) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function renderPaginacao() {
  const pag = document.querySelector('#ntf-pag');
  if (!pag) return;
  const totalPaginas = Math.max(1, Math.ceil(totalAtual / POR_PAGINA));
  if (totalPaginas <= 1) { pag.innerHTML = ''; return; }

  const nums = listaPaginas(paginaAtual, totalPaginas).map(p =>
    p === '…'
      ? '<span class="ntf-pag-ell" aria-hidden="true">…</span>'
      : `<button type="button" class="ntf-pag-num${p === paginaAtual ? ' is-atual' : ''}"
           data-pg="${p}" ${p === paginaAtual ? 'aria-current="page"' : ''}>${p}</button>`
  ).join('');

  pag.innerHTML = `
    <span class="ntf-pag-resumo">
      <strong>${totalAtual}</strong> ${totalAtual === 1 ? 'aviso' : 'avisos'}
      · página <strong>${paginaAtual}</strong> de <strong>${totalPaginas}</strong>
    </span>
    <div class="ntf-pag-nums">
      <button type="button" class="ntf-pag-seta" data-pg="prev"
              ${paginaAtual <= 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
      ${nums}
      <button type="button" class="ntf-pag-seta" data-pg="next"
              ${paginaAtual >= totalPaginas ? 'disabled' : ''} aria-label="Próxima página">›</button>
    </div>`;

  pag.querySelectorAll('[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.pg;
      if (v === 'prev')      mudarPagina(paginaAtual - 1);
      else if (v === 'next') mudarPagina(paginaAtual + 1);
      else                   mudarPagina(parseInt(v, 10));
    });
  });
}

function mudarPagina(n) {
  const totalPaginas = Math.max(1, Math.ceil(totalAtual / POR_PAGINA));
  const alvo = Math.min(totalPaginas, Math.max(1, n || 1));
  if (alvo === paginaAtual) return;
  paginaAtual = alvo;
  escreverUrl();
  carregar();
  document.querySelector('#main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Ações ───────────────────────────────────────────────────────────
async function marcarLida(id) {
  const { error } = await supabase
    .from('notificacao')
    .update({ lida_em: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    mostrarToast('Erro: ' + error.message, 'erro', 4000);
    return false;
  }
  return true;
}

async function descartar(id) {
  const { error } = await supabase
    .from('notificacao')
    .update({ descartada_em: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    mostrarToast('Erro ao descartar: ' + error.message, 'erro', 4000);
    return false;
  }
  mostrarToast('Aviso descartado.', 'ok', 1800);
  return true;
}

// ─── Atualização in-place — sem recarregar a lista ───────────────────
// Mantém o scroll e a posição do operador: só o item afetado muda.

// Marca o item como lido sem tirá-lo da lista (filtros que não sejam
// "não lidas"): recolhe a ênfase e remove o botão de marcar.
function marcarItemLido(item) {
  if (!item) return;
  item.dataset.lida = 'true';
  item.querySelector('.ntf-item-dot')?.remove();
  item.querySelector('[data-acao="marcar-lida"]')?.remove();
}

// Tira o item da lista com animação e colapsa o espaço que ele ocupava.
function sairDaLista(li) {
  if (!li) return;
  li.querySelector('.ntf-item')?.classList.add('ntf-item--saindo');
  li.style.height = `${li.offsetHeight}px`;
  li.classList.add('ntf-li--saindo');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    li.style.height = '0';
    li.style.marginBottom = '0';
  }));
  setTimeout(() => { li.remove(); aposRemocao(); }, 320);
}

// Após remover um item: ajusta a contagem, a paginação e — se a página
// esvaziou — mostra o estado vazio (sem recarregar nada).
function aposRemocao() {
  totalAtual = Math.max(0, totalAtual - 1);
  const ul = document.querySelector('.ntf-lista');
  if (ul && !ul.querySelector('li')) {
    const alvo = document.querySelector('#ntf-lista');
    if (alvo) {
      alvo.innerHTML = `
        <div class="ntf-empty">
          <div class="ntf-empty-icone" aria-hidden="true">${ICON_SINO}</div>
          <p class="ntf-empty-title">Tudo tratado por aqui.</p>
          <p class="ntf-empty-msg">Você cuidou de todos os avisos desta página.</p>
        </div>`;
    }
  }
  renderPaginacao();
}

// ─── Realtime ────────────────────────────────────────────────────────
// Mudanças (inclusive os próprios marcar-lida/descartar) atualizam só o
// RESUMO lateral — a lista NÃO é recarregada, pra não tirar o operador
// do lugar. A lista só recarrega em navegação explícita (filtro/página).
function ligarRealtime() {
  canalNotif = supabase.channel('notif-feed')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacao' },
        () => { carregarResumo(); })
    .subscribe();
}

function desmontar() {
  if (canalNotif) {
    supabase.removeChannel(canalNotif).catch(() => {});
    canalNotif = null;
  }
  paginaAtual = 1;
  totalAtual = 0;
  filtros = { estado: '', sev: '', busca: '', tipo: '' };
}

// ─── Helpers ─────────────────────────────────────────────────────────
function tempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'agora';
  if (min < 60)  return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30)    return `${d} dia${d > 1 ? 's' : ''}`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
