// sidebar.js — navegação lateral v2 (refator "Clean Profissional").
// Sidebar fixa 248px no desktop, off-canvas no mobile (<768px).
// Sem estado colapsada — visual mais simples e previsível.
//
// API preservada (chamadores nao precisam mudar):
//   await renderSidebar(rotaAtiva)  -> HTML
//   ligarSidebar()                  -> ata listeners
//   desmontarSidebar()              -> remove listeners + bell
//
// Classes novas: namespace .sb-* (sidebar v2). Os legados .sidebar-*
// ficam orphans no components.css e podem ser removidos depois.

import { supabase, pegarSessao } from '../app/supabase.js';
import { sair } from '../app/auth.js';
import { navegar } from '../app/router.js';
import { carregarPermissoes, temPermissaoSync } from '../app/papeis.js';
import { abrirUserMenu } from './user-menu.js';
import { montarSino, desmontarSino } from './notification-bell.js';

const BREAKPOINT_MOBILE = 768;
const COLLAPSE_KEY = 'sb-collapsed';

// Boot: aplica o estado recolhido salvo ANTES de qualquer render. Fica
// no <html> — sobrevive às trocas de innerHTML do #app, então nunca
// pisca. (Roda no carregamento do módulo, antes do primeiro despacho.)
if (typeof localStorage !== 'undefined' && localStorage.getItem(COLLAPSE_KEY) === '1') {
  document.documentElement.dataset.sbCollapsed = '1';
}

// ─── Render ─────────────────────────────────────────────────────────
export async function renderSidebar(rotaAtiva) {
  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const email  = sessao?.user?.email || '';
  const nome   = (meta.nome || email.split('@')[0] || 'Operador').trim();
  const nomeCompleto = [meta.nome, meta.sobrenome].filter(Boolean).join(' ').trim() || nome;
  const inicial = ((meta.nome?.[0] || email?.[0]) || '?').toUpperCase();
  const avatarUrl = meta.avatar_url || '';
  const cargo = await pegarCargo(sessao?.user?.id);
  const recolhido = document.documentElement.dataset.sbCollapsed === '1';
  await carregarPermissoes();
  const podeAuditoria = temPermissaoSync('auditoria.visualizar');
  const podeLixeira   = temPermissaoSync('lixeira.visualizar');

  return `
    <aside class="sb" data-mobile="fechado" role="navigation" aria-label="Menu principal">
      <div class="sb-brand">
        <a href="/dashboard" data-link class="sb-brand-link" aria-label="Caixa Boti — início">
          <span class="sb-brand-mark" aria-hidden="true">B</span>
          <span class="sb-brand-meta">
            <span class="sb-brand-name">Caixa Boti</span>
            <span class="sb-brand-tag">Auditoria diária</span>
          </span>
        </a>
      </div>

      <nav class="sb-nav" aria-label="Seções">
        <div class="sb-nav-group">
          <p class="sb-nav-group-label">Operação</p>
          ${navItem('dashboard',    '/dashboard',    'Painel',       svgPainel(),  rotaAtiva)}
          ${navItem('caixas',       '/caixas',       'Caixas',       svgCaixa(),   rotaAtiva)}
          ${navItem('pendencias',   '/pendencias',   'Pendências',   svgRelogio(), rotaAtiva)}
          ${navItem('notificacoes', '/notificacoes', 'Notificações', svgSino(),    rotaAtiva, { bellSlot: true })}
        </div>

        <div class="sb-nav-group" data-grupo="analise">
          <p class="sb-nav-group-label">Análise</p>
          ${navItem('relatorios', '/relatorios', 'Relatórios', svgRelatorio(), rotaAtiva)}
          ${podeAuditoria
            ? navItem('auditoria', '/configuracoes/auditoria', 'Auditoria', svgAuditoria(), rotaAtiva)
            : ''}
          ${podeLixeira
            ? navItem('lixeira', '/configuracoes/lixeira', 'Lixeira', svgLixeira(), rotaAtiva)
            : ''}
        </div>
      </nav>

      <div class="sb-foot">
        <button id="sb-collapse" type="button" class="sb-collapse"
                aria-label="${recolhido ? 'Expandir menu' : 'Recolher menu'}">
          <span class="sb-collapse-icon" aria-hidden="true">${svgChevronDuplo()}</span>
          <span class="sb-collapse-label">Recolher menu</span>
        </button>
        <button id="sb-user" type="button" class="sb-user"
                aria-haspopup="menu" aria-expanded="false"
                aria-label="Abrir menu de ${esc(nomeCompleto)}"
                data-nome="${esc(nomeCompleto)}"
                data-email="${esc(email)}">
          <span class="sb-user-avatar" aria-hidden="true">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="" />` : esc(inicial)}</span>
          <span class="sb-user-meta">
            <span class="sb-user-name">${esc(nome)}</span>
            <span class="sb-user-role">${esc(cargo)}</span>
          </span>
          <span class="sb-user-dots" aria-hidden="true">${svgDots()}</span>
        </button>
      </div>

      <!-- Grip do pull-down (mobile): fechado, só esta barra aparece no
           topo da tela; arrastando-a pra baixo o menu desce. -->
      <button type="button" class="sb-grip" id="sb-grip"
              aria-label="Puxar para abrir o menu" aria-expanded="false">
        <span class="sb-grip-pill" aria-hidden="true"></span>
      </button>
    </aside>

    <div id="sb-mobile-overlay" class="sb-mobile-overlay" hidden></div>
  `;
}

async function pegarCargo(uid) {
  if (!uid) return '—';
  try {
    const { data } = await supabase
      .from('usuario_perfil')
      .select('perfil:perfil_id(nome)')
      .eq('usuario_id', uid)
      .maybeSingle();
    return data?.perfil?.nome || '—';
  } catch { return '—'; }
}

function navItem(chave, href, label, icone, rotaAtiva, opcoes = {}) {
  const ativo = rotaAtiva === chave;
  const badge = opcoes.bellSlot
    ? `<span id="sidebar-bell-badge" class="sb-nav-badge" data-zero="true">0</span>`
    : '';
  return `
    <a href="${href}" data-link class="sb-nav-item"
       data-rota="${chave}" title="${esc(label)}"
       ${ativo ? 'aria-current="page"' : ''}>
      <span class="sb-nav-icon" aria-hidden="true">${icone}</span>
      <span class="sb-nav-label">${esc(label)}</span>
      ${badge}
    </a>`;
}

// ─── Listeners ──────────────────────────────────────────────────────
export function ligarSidebar() {
  const aside = document.querySelector('.sb');
  if (!aside) return;

  document.querySelector('#sb-mobile-overlay')?.addEventListener('click', () => {
    setMobile('fechado');
  });

  ligarGrip();

  document.addEventListener('keydown', escFechaMobile);

  aside.querySelectorAll('.sb-nav-item').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth < BREAKPOINT_MOBILE) setMobile('fechado');
    });
  });

  document.querySelector('#sb-user')?.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirUserMenu({
      onSair: async () => {
        desmontarSino();
        await sair();
        navegar('/login');
      },
    });
  });

  document.querySelector('#sb-collapse')?.addEventListener('click', alternarRecolhido);

  montarSino({ slotBadge: '#sidebar-bell-badge' }).catch(e =>
    console.warn('[sb] bell falhou:', e));
}

// Alterna o estado recolhido. O atributo vive no <html> (sobrevive à
// troca de tela) e é persistido em localStorage (sobrevive ao reload).
function alternarRecolhido() {
  const html = document.documentElement;
  const recolhido = html.dataset.sbCollapsed === '1';
  if (recolhido) {
    delete html.dataset.sbCollapsed;
    try { localStorage.removeItem(COLLAPSE_KEY); } catch (_) {}
  } else {
    html.dataset.sbCollapsed = '1';
    try { localStorage.setItem(COLLAPSE_KEY, '1'); } catch (_) {}
  }
  document.querySelector('#sb-collapse')?.setAttribute(
    'aria-label', html.dataset.sbCollapsed === '1' ? 'Expandir menu' : 'Recolher menu');
}

function escFechaMobile(e) {
  if (e.key !== 'Escape') return;
  const aside = document.querySelector('.sb');
  if (aside?.dataset.mobile === 'aberto') setMobile('fechado');
}

function setMobile(novo) {
  const aside = document.querySelector('.sb');
  const overlay = document.querySelector('#sb-mobile-overlay');
  const grip = document.querySelector('#sb-grip');
  if (!aside) return;
  aside.dataset.mobile = novo;
  if (overlay) overlay.hidden = (novo !== 'aberto');
  if (grip) grip.setAttribute('aria-expanded', String(novo === 'aberto'));
}

// ─── Pull-down (mobile) ─────────────────────────────────────────────
// A sidebar mobile abre arrastando o grip pra baixo — ou tocando nele.
// Substitui o antigo botão hamburguer. O grip é a borda de baixo do
// painel; fechado, é a única parte visível (no topo da tela).
function ligarGrip() {
  const sheet = document.querySelector('.sb');
  const grip  = document.querySelector('#sb-grip');
  if (!sheet || !grip) return;

  let dragging = false, startY = 0, lastDy = 0, sheetH = 0, gripH = 44, eraAberto = false;
  let ultimoToque = 0;
  const baseFechado = () => -(sheetH - gripH);

  function inicio(clientY) {
    dragging = true;
    startY = clientY;
    lastDy = 0;
    sheetH = sheet.offsetHeight;
    gripH  = grip.offsetHeight || 44;
    eraAberto = sheet.dataset.mobile === 'aberto';
    sheet.style.transition = 'none';
  }
  function mover(clientY) {
    if (!dragging) return;
    lastDy = clientY - startY;
    const base = eraAberto ? 0 : baseFechado();
    const t = Math.max(baseFechado(), Math.min(0, base + lastDy));
    sheet.style.transform = `translateY(${t}px)`;
  }
  function fim() {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    const dy = lastDy;
    // Toque (mexeu < 10px) → alterna na hora — sem exigir arraste.
    // Arraste de ~48px no sentido certo → abre/fecha. Arraste curto
    // demais → volta ao estado anterior.
    if (Math.abs(dy) < 10) {
      setMobile(eraAberto ? 'fechado' : 'aberto');
    } else if (!eraAberto && dy > 48) {
      setMobile('aberto');
    } else if (eraAberto && dy < -48) {
      setMobile('fechado');
    } else {
      setMobile(eraAberto ? 'aberto' : 'fechado');
    }
  }

  grip.addEventListener('touchstart', e => inicio(e.touches[0].clientY), { passive: true });
  grip.addEventListener('touchmove',  e => mover(e.touches[0].clientY),  { passive: true });
  grip.addEventListener('touchend', e => {
    ultimoToque = Date.now();
    e.preventDefault();
    fim();
  }, { passive: false });
  grip.addEventListener('touchcancel', fim);
  // Teclado / mouse. Ignora o ghost-click que o navegador dispara logo
  // depois de um toque — senão o toggle aconteceria duas vezes (abre
  // e fecha no mesmo gesto, e o menu parecia não responder).
  grip.addEventListener('click', () => {
    if (Date.now() - ultimoToque < 600) return;
    setMobile(sheet.dataset.mobile === 'aberto' ? 'fechado' : 'aberto');
  });
}

export function desmontarSidebar() {
  desmontarSino();
  document.removeEventListener('keydown', escFechaMobile);
}

// ─── SVGs ───────────────────────────────────────────────────────────
// Lucide-style 1.5 stroke, 16x16 — matching demo-visual aesthetic.

const SVG_ATTRS = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

function svgPainel() {
  return `<svg ${SVG_ATTRS}><rect x="2" y="2" width="5.5" height="6" rx="1"/><rect x="2" y="9.5" width="5.5" height="4.5" rx="1"/><rect x="8.5" y="2" width="5.5" height="4.5" rx="1"/><rect x="8.5" y="8" width="5.5" height="6" rx="1"/></svg>`;
}
function svgCaixa() {
  return `<svg ${SVG_ATTRS}><path d="M2 4.5 8 2l6 2.5v7L8 14l-6-2.5v-7Z"/><path d="M2 4.5 8 7l6-2.5"/><path d="M8 7v7"/></svg>`;
}
function svgRelogio() {
  return `<svg ${SVG_ATTRS}><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>`;
}
function svgSino() {
  return `<svg ${SVG_ATTRS}><path d="M3 6a5 5 0 0 1 10 0v3l1.5 2H1.5L3 9V6Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`;
}
function svgRelatorio() {
  return `<svg ${SVG_ATTRS}><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 10V7M8 10V5M11 10V8"/></svg>`;
}
function svgGear() {
  return `<svg ${SVG_ATTRS}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.4M8 13.1v1.4M3.4 3.4l1 1M11.6 11.6l1 1M1.5 8h1.4M13.1 8h1.4M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>`;
}
function svgDots() {
  return `<svg ${SVG_ATTRS} stroke-width="1.7"><circle cx="3" cy="8" r="0.8" fill="currentColor"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><circle cx="13" cy="8" r="0.8" fill="currentColor"/></svg>`;
}
function svgChevronDuplo() {
  return `<svg ${SVG_ATTRS}><path d="M8.5 3.5 4 8l4.5 4.5M13 3.5 8.5 8l4.5 4.5"/></svg>`;
}
function svgAuditoria() {
  return `<svg ${SVG_ATTRS}><rect x="3" y="2.8" width="10" height="11.2" rx="1.6"/><rect x="5.6" y="1.5" width="4.8" height="2.6" rx="0.8"/><path d="M5.7 8.4 7.2 9.9 10.5 6.6"/></svg>`;
}
function svgLixeira() {
  return `<svg ${SVG_ATTRS}><path d="M2.5 4.3h11M6 4.3V2.8h4v1.5M3.8 4.3l.7 9.2a1 1 0 0 0 1 .9h4.9a1 1 0 0 0 1-.9l.7-9.2"/><path d="M6.6 7v4.4M9.4 7v4.4"/></svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
