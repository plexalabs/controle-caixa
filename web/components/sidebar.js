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
import { abrirUserMenu } from './user-menu.js';
import { montarSino, desmontarSino } from './notification-bell.js';

const BREAKPOINT_MOBILE = 768;

// ─── Render ─────────────────────────────────────────────────────────
export async function renderSidebar(rotaAtiva) {
  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const email  = sessao?.user?.email || '';
  const nome   = (meta.nome || email.split('@')[0] || 'Operador').trim();
  const nomeCompleto = [meta.nome, meta.sobrenome].filter(Boolean).join(' ').trim() || nome;
  const inicial = ((meta.nome?.[0] || email?.[0]) || '?').toUpperCase();
  const cargo = await pegarCargo(sessao?.user?.id);

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

        <div class="sb-nav-group">
          <p class="sb-nav-group-label">Análise</p>
          ${navItem('relatorios', '/relatorios', 'Relatórios', svgRelatorio(), rotaAtiva)}
        </div>

        <div class="sb-nav-group">
          <p class="sb-nav-group-label">Sistema</p>
          ${navItem('config', '/configuracoes', 'Configurações', svgGear(), rotaAtiva)}
        </div>
      </nav>

      <div class="sb-foot">
        <button id="sb-user" type="button" class="sb-user"
                aria-haspopup="menu" aria-expanded="false"
                aria-label="Abrir menu de ${esc(nomeCompleto)}"
                data-nome="${esc(nomeCompleto)}"
                data-email="${esc(email)}">
          <span class="sb-user-avatar" aria-hidden="true">${esc(inicial)}</span>
          <span class="sb-user-meta">
            <span class="sb-user-name">${esc(nome)}</span>
            <span class="sb-user-role">${esc(cargo)}</span>
          </span>
          <span class="sb-user-dots" aria-hidden="true">${svgDots()}</span>
        </button>
      </div>
    </aside>

    <button id="sb-mobile-toggle" type="button" class="sb-mobile-toggle"
            aria-label="Abrir menu" aria-expanded="false">
      ${svgHamburguer()}
    </button>
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
       data-rota="${chave}"
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

  document.querySelector('#sb-mobile-toggle')?.addEventListener('click', () => {
    const atual = aside.dataset.mobile;
    setMobile(atual === 'aberto' ? 'fechado' : 'aberto');
  });

  document.querySelector('#sb-mobile-overlay')?.addEventListener('click', () => {
    setMobile('fechado');
  });

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

  montarSino({ slotBadge: '#sidebar-bell-badge' }).catch(e =>
    console.warn('[sb] bell falhou:', e));
}

function escFechaMobile(e) {
  if (e.key !== 'Escape') return;
  const aside = document.querySelector('.sb');
  if (aside?.dataset.mobile === 'aberto') setMobile('fechado');
}

function setMobile(novo) {
  const aside = document.querySelector('.sb');
  const overlay = document.querySelector('#sb-mobile-overlay');
  const tog = document.querySelector('#sb-mobile-toggle');
  if (!aside) return;
  aside.dataset.mobile = novo;
  if (overlay) overlay.hidden = (novo !== 'aberto');
  if (tog) {
    tog.setAttribute('aria-expanded', String(novo === 'aberto'));
    tog.setAttribute('aria-label', novo === 'aberto' ? 'Fechar menu' : 'Abrir menu');
  }
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
function svgHamburguer() {
  return `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7 H18 M4 11 H18 M4 15 H18"/></svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
