// sidebar.js — navegação lateral colapsável (CP5-FIX 2).
// Substitui o header horizontal antigo. Estado (expandida/colapsada)
// persiste em IndexedDB. Em mobile (<768px) vira off-canvas com hamburguer.
//
// API:
//   await renderSidebar(rotaAtiva)  → string HTML para <aside>
//   ligarSidebar()                  → ata listeners (toggle, nav, hamburguer, user-menu)
//   atualizarBadgeSidebar(n)        → muda contagem do bell na sidebar (chamado pelo bell)

import { pegarSessao } from '../app/supabase.js';
import { sair } from '../app/auth.js';
import { navegar } from '../app/router.js';
import { lerPref, gravarPref } from '../app/ui-prefs.js';
import { abrirUserMenu } from './user-menu.js';
import { montarSino, desmontarSino } from './notification-bell.js';

const URL_LOGO = '/assets/logo.svg';
const PREF_ESTADO = 'ui_sidebar_estado';
const BREAKPOINT_MOBILE = 768;

// ─── Render ─────────────────────────────────────────────────────────
export async function renderSidebar(rotaAtiva) {
  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const nome   = (meta.nome || sessao?.user?.email?.split('@')[0] || 'Operador').trim();
  const inicial = (meta.nome?.[0] || sessao?.user?.email?.[0] || '?').toUpperCase();
  const email = sessao?.user?.email || '';

  // Estado inicial: pref persistida ou default por viewport.
  const persistido = await lerPref(PREF_ESTADO, null);
  const ehMobile = window.innerWidth < BREAKPOINT_MOBILE;
  const estado = ehMobile
    ? 'mobile-fechado'
    : (persistido || 'expandida');

  return `
    <aside class="app-sidebar" data-estado="${estado}" role="navigation" aria-label="Menu principal">
      <div class="sidebar-topo">
        <a href="/dashboard" data-link class="sidebar-logo" aria-label="Caixa Boti — início">
          <span class="sidebar-logo-marca" aria-hidden="true"
                style="-webkit-mask:url(${URL_LOGO}) no-repeat center / contain; mask:url(${URL_LOGO}) no-repeat center / contain"></span>
          <span class="sidebar-logo-texto">Caixa Boti</span>
        </a>
        <button id="sidebar-toggle" type="button" class="sidebar-toggle"
                aria-label="${estado === 'colapsada' ? 'Expandir menu' : 'Colapsar menu'}"
                title="${estado === 'colapsada' ? 'Expandir' : 'Colapsar'}">
          ${svgChevron()}
        </button>
      </div>

      <nav class="sidebar-nav" aria-label="Seções">
        ${linkSidebar('caixas',        '/caixas',         'Caixas',       svgCaixa(), rotaAtiva)}
        ${linkSidebar('pendencias',    '/pendencias',     'Pendências',   svgRelogio(), rotaAtiva)}
        ${linkSidebar('notificacoes',  '/notificacoes',   'Notificações', svgSino(), rotaAtiva, { bellSlot: true })}
      </nav>

      <div class="sidebar-rodape">
        <button id="sidebar-user" type="button" class="sidebar-user"
                aria-haspopup="menu" aria-expanded="false"
                aria-label="Menu do usuário ${nome}">
          <span class="sidebar-user-avatar" aria-hidden="true">${esc(inicial)}</span>
          <span class="sidebar-user-texto">
            <span class="sidebar-user-nome">${esc(nome)}</span>
            <span class="sidebar-user-email">${esc(email)}</span>
          </span>
          <span class="sidebar-user-caret" aria-hidden="true">${svgPontos()}</span>
        </button>
      </div>
    </aside>

    <button id="app-mobile-toggle" type="button" class="app-mobile-toggle"
            aria-label="Abrir menu" aria-expanded="false">
      ${svgHamburguer()}
    </button>
    <div id="app-mobile-overlay" class="app-mobile-overlay" hidden></div>
  `;
}

function linkSidebar(chave, href, label, icone, rotaAtiva, opcoes = {}) {
  const ativo = rotaAtiva === chave;
  return `
    <a href="${href}" data-link class="sidebar-link"
       data-rota="${chave}"
       ${ativo ? 'aria-current="page"' : ''}
       data-tooltip="${esc(label)}">
      <span class="sidebar-link-icone" aria-hidden="true">${icone}</span>
      <span class="sidebar-link-texto">${esc(label)}</span>
      ${opcoes.bellSlot
        ? '<span id="sidebar-bell-badge" class="sidebar-link-badge" data-zero="true" aria-hidden="true">0</span>'
        : ''}
    </a>`;
}

// ─── Listeners ──────────────────────────────────────────────────────
export function ligarSidebar() {
  const aside = document.querySelector('.app-sidebar');
  if (!aside) return;

  // Toggle (desktop colapsa/expande, mobile fecha o off-canvas)
  document.querySelector('#sidebar-toggle')?.addEventListener('click', () => {
    const ehMobile = window.innerWidth < BREAKPOINT_MOBILE;
    if (ehMobile) {
      definirEstado('mobile-fechado');
    } else {
      const atual = aside.dataset.estado;
      const novo = atual === 'colapsada' ? 'expandida' : 'colapsada';
      definirEstado(novo);
      gravarPref(PREF_ESTADO, novo);
    }
  });

  // Hamburguer mobile
  document.querySelector('#app-mobile-toggle')?.addEventListener('click', () => {
    const atual = aside.dataset.estado;
    definirEstado(atual === 'mobile-aberto' ? 'mobile-fechado' : 'mobile-aberto');
  });

  // Click no overlay fecha o off-canvas
  document.querySelector('#app-mobile-overlay')?.addEventListener('click', () => {
    definirEstado('mobile-fechado');
  });

  // ESC fecha o off-canvas se aberto
  document.addEventListener('keydown', escFechaMobile);

  // Click em link mobile fecha o off-canvas
  aside.querySelectorAll('.sidebar-link').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth < BREAKPOINT_MOBILE) definirEstado('mobile-fechado');
    });
  });

  // User-menu
  document.querySelector('#sidebar-user')?.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirUserMenu({
      onSair: async () => {
        desmontarSino();
        await sair();
        navegar('/login');
      },
    });
  });

  // Bell na sidebar — montar (atualiza o badge específico do sidebar)
  montarSino({ slotBadge: '#sidebar-bell-badge' }).catch(e =>
    console.warn('[sidebar] bell falhou:', e));

  // Resize: troca default de mobile pra desktop e vice-versa
  window.addEventListener('resize', onResize);
}

function escFechaMobile(e) {
  if (e.key !== 'Escape') return;
  const aside = document.querySelector('.app-sidebar');
  if (!aside) return;
  if (aside.dataset.estado === 'mobile-aberto') definirEstado('mobile-fechado');
}

function onResize() {
  const aside = document.querySelector('.app-sidebar');
  if (!aside) return;
  const ehMobile = window.innerWidth < BREAKPOINT_MOBILE;
  const atual = aside.dataset.estado;
  if (ehMobile && atual !== 'mobile-aberto' && atual !== 'mobile-fechado') {
    definirEstado('mobile-fechado');
  } else if (!ehMobile && (atual === 'mobile-aberto' || atual === 'mobile-fechado')) {
    // volta ao estado persistido ou default
    lerPref(PREF_ESTADO, 'expandida').then(p => definirEstado(p || 'expandida'));
  }
}

function definirEstado(novo) {
  const aside = document.querySelector('.app-sidebar');
  const overlay = document.querySelector('#app-mobile-overlay');
  const tog = document.querySelector('#sidebar-toggle');
  const ham = document.querySelector('#app-mobile-toggle');
  if (!aside) return;
  aside.dataset.estado = novo;

  // Overlay só aparece no mobile-aberto
  if (overlay) overlay.hidden = (novo !== 'mobile-aberto');

  // Atualiza aria-labels
  if (tog) {
    const lbl = novo === 'colapsada' ? 'Expandir menu' : 'Colapsar menu';
    tog.setAttribute('aria-label', lbl);
    tog.setAttribute('title', novo === 'colapsada' ? 'Expandir' : 'Colapsar');
  }
  if (ham) {
    ham.setAttribute('aria-expanded', String(novo === 'mobile-aberto'));
    ham.setAttribute('aria-label', novo === 'mobile-aberto' ? 'Fechar menu' : 'Abrir menu');
  }
}

export function desmontarSidebar() {
  desmontarSino();
  document.removeEventListener('keydown', escFechaMobile);
  window.removeEventListener('resize', onResize);
}

// ─── SVGs ───────────────────────────────────────────────────────────
// Lucide-inspired strokes 1.5px, currentColor.

function svgChevron() {
  return `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 12 L6 8 L10 4" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function svgCaixa() {
  // Pasta/gaveta com 3 linhas internas representando páginas.
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M7 9 H17 M7 12.5 H14 M7 16 H12" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
}

function svgRelogio() {
  // Relógio com ponteiros — pendências = atraso.
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12 7.5 V12 L15 14" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function svgSino() {
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5 C9 3.5 7 5.5 7 8.5 V11.5 L5.5 14 H18.5 L17 11.5 V8.5 C17 5.5 15 3.5 12 3.5 Z"
            stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M10.5 17 C10.5 18 11.2 18.5 12 18.5 C12.8 18.5 13.5 18 13.5 17"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
}

function svgHamburguer() {
  return `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="currentColor"
            stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
}

function svgPontos() {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="3" cy="7" r="1.4"/>
      <circle cx="7" cy="7" r="1.4"/>
      <circle cx="11" cy="7" r="1.4"/>
    </svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
