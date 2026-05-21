// sidebar-config.js — sidebar dedicada da área de Configurações.
// Aparece em /perfil e /configuracoes/* (exceto auditoria/lixeira, que
// são itens da sidebar principal). Nunca recolhe. Grupos "Usuários e
// Permissões" e "Sistema" são dropdowns que abrem os sub-itens.
//
// API: renderSidebarConfig() -> HTML · ligarSidebarConfig() -> listeners.

import { supabase, pegarSessao } from '../app/supabase.js';
import { sair } from '../app/auth.js';
import { navegar } from '../app/router.js';
import { carregarPermissoes, temPermissaoSync } from '../app/papeis.js';
import { abrirUserMenu } from './user-menu.js';
import { montarSino, desmontarSino } from './notification-bell.js';

const BREAKPOINT = 768;

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;

// Grupos de parâmetros — cada um é uma tela própria. Mantenha em sincronia
// com GRUPOS de configuracoes-sistema.js.
const SISTEMA_SUBS = [
  { h: 'caixa',       rotulo: 'Caixas' },
  { h: 'janela',      rotulo: 'Janela operacional' },
  { h: 'notificacao', rotulo: 'Notificações' },
  { h: 'lancamento',  rotulo: 'Lançamentos e pendências' },
  { h: 'dados',       rotulo: 'Sincronização e dados' },
  { h: 'acesso',      rotulo: 'Acesso' },
];

export async function renderSidebarConfig() {
  await carregarPermissoes();
  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const email  = sessao?.user?.email || '';
  const nome   = (meta.nome || email.split('@')[0] || 'Operador').trim();
  const inicial = ((meta.nome?.[0] || email?.[0]) || '?').toUpperCase();
  const avatarUrl = meta.avatar_url || '';
  const cargo  = await pegarCargo(sessao?.user?.id);

  const path = location.pathname;

  const podeUsuarios = temPermissaoSync('usuario.visualizar');
  const podePerfis   = temPermissaoSync('perfil.visualizar');
  const podeFeriados = temPermissaoSync('config.gerenciar_feriados');
  const podeSistema  = temPermissaoSync('config.editar_sistema');

  const grpUsuarios = path === '/configuracoes/usuarios' || path === '/configuracoes/permissoes';
  const grpSistema  = path.startsWith('/configuracoes/sistema');

  return `
    <aside class="sbc" data-mobile="fechado" role="navigation" aria-label="Configurações">
      <div class="sbc-brand">
        <a href="/configuracoes" data-link class="sbc-brand-link" aria-label="Configurações — visão geral">
          <span class="sbc-brand-mark" aria-hidden="true">${svgGear()}</span>
          <span>
            <span class="sbc-brand-name">Configurações</span>
            <span class="sbc-brand-tag">Painel administrativo</span>
          </span>
        </a>
      </div>

      <nav class="sbc-nav" aria-label="Seções de configuração">
        <p class="sbc-nav-rotulo">Conta</p>
        ${itemLink('/perfil', 'Seu perfil', svgPerfil(), path)}

        <p class="sbc-nav-rotulo">Administração</p>
        ${itemLink('/configuracoes/vendedoras', 'Vendedoras', svgVendedoras(), path)}
        ${(podeUsuarios || podePerfis) ? grupo(
          'Usuários e Permissões', svgEscudo(), grpUsuarios,
          [
            podeUsuarios ? subLink('/configuracoes/usuarios', 'Usuários', path) : '',
            podePerfis   ? subLink('/configuracoes/permissoes', 'Permissões', path) : '',
          ].join('')
        ) : ''}
        ${podeFeriados ? itemLink('/configuracoes/feriados', 'Feriados', svgCalendario(), path) : ''}
        ${podeSistema ? grupo('Sistema', svgSliders(), grpSistema,
          SISTEMA_SUBS.map(s => `
            <a href="/configuracoes/sistema/${s.h}" data-link class="sbc-sub"
               ${path === '/configuracoes/sistema/' + s.h ? 'aria-current="page"' : ''}>${esc(s.rotulo)}</a>`).join('')
        ) : ''}
      </nav>

      <div class="sbc-foot">
        <a href="/dashboard" data-link class="sbc-voltar">${svgVoltar()} Voltar ao painel</a>
        <button id="sbc-user" type="button" class="sbc-user"
                aria-haspopup="menu" aria-expanded="false"
                aria-label="Abrir menu de ${esc(nome)}">
          <span class="sbc-user-avatar" aria-hidden="true">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="" />` : esc(inicial)}</span>
          <span class="sbc-user-meta">
            <span class="sbc-user-name">${esc(nome)}</span>
            <span class="sbc-user-role">${esc(cargo)}</span>
          </span>
          <span class="sbc-user-dots" aria-hidden="true">${svgDots()}</span>
        </button>
      </div>
    </aside>

    <button id="sbc-mobile-toggle" type="button" class="sbc-mobile-toggle"
            aria-label="Abrir menu" aria-expanded="false">${svgHamburguer()}</button>
    <div id="sbc-mobile-overlay" class="sbc-mobile-overlay" hidden></div>
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

function itemLink(href, label, icone, path) {
  const ativo = path === href;
  return `
    <a href="${href}" data-link class="sbc-item" ${ativo ? 'aria-current="page"' : ''}>
      <span class="sbc-item-icone" aria-hidden="true">${icone}</span>${esc(label)}
    </a>`;
}

function subLink(href, label, path) {
  const ativo = path === href;
  return `<a href="${href}" data-link class="sbc-sub" ${ativo ? 'aria-current="page"' : ''}>${esc(label)}</a>`;
}

function grupo(rotulo, icone, aberto, subsHtml) {
  return `
    <div class="sbc-grupo" data-aberto="${aberto ? '1' : '0'}" data-ativo="${aberto ? '1' : '0'}">
      <button type="button" class="sbc-grupo-cabec" aria-expanded="${aberto}">
        <span class="sbc-item-icone" aria-hidden="true">${icone}</span>
        <span class="sbc-grupo-rotulo">${esc(rotulo)}</span>
        <span class="sbc-grupo-chevron" aria-hidden="true">${svgChevron()}</span>
      </button>
      <div class="sbc-grupo-sub">
        <div class="sbc-grupo-sub-inner">
          <div class="sbc-sub-lista">${subsHtml}</div>
        </div>
      </div>
    </div>`;
}

// ─── Listeners ──────────────────────────────────────────────────────
export function ligarSidebarConfig() {
  const aside = document.querySelector('.sbc');
  if (!aside) return;

  aside.querySelectorAll('.sbc-grupo-cabec').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.closest('.sbc-grupo');
      const novo = g.dataset.aberto === '1' ? '0' : '1';
      g.dataset.aberto = novo;
      btn.setAttribute('aria-expanded', String(novo === '1'));
    });
  });

  document.querySelector('#sbc-mobile-toggle')?.addEventListener('click', () => {
    setMobile(aside.dataset.mobile === 'aberto' ? 'fechado' : 'aberto');
  });
  document.querySelector('#sbc-mobile-overlay')?.addEventListener('click', () => setMobile('fechado'));
  document.addEventListener('keydown', escFechaMobile);
  aside.querySelectorAll('a[data-link]').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth < BREAKPOINT) setMobile('fechado');
    });
  });

  document.querySelector('#sbc-user')?.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirUserMenu({
      onSair: async () => {
        desmontarSino();
        await sair();
        navegar('/login');
      },
    });
  });

  montarSino().catch(e => console.warn('[sbc] bell falhou:', e));
}

function escFechaMobile(e) {
  if (e.key !== 'Escape') return;
  const aside = document.querySelector('.sbc');
  if (aside?.dataset.mobile === 'aberto') setMobile('fechado');
}

function setMobile(novo) {
  const aside = document.querySelector('.sbc');
  const overlay = document.querySelector('#sbc-mobile-overlay');
  const tog = document.querySelector('#sbc-mobile-toggle');
  if (!aside) return;
  aside.dataset.mobile = novo;
  if (overlay) overlay.hidden = (novo !== 'aberto');
  if (tog) {
    tog.setAttribute('aria-expanded', String(novo === 'aberto'));
    tog.setAttribute('aria-label', novo === 'aberto' ? 'Fechar menu' : 'Abrir menu');
  }
}

// ─── SVGs ───────────────────────────────────────────────────────────
function svgGear() {
  return `<svg ${SVG}><circle cx="8" cy="8" r="2.3"/><path d="M8 1.4v1.6M8 13v1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M1.4 8h1.6M13 8h1.6M3.3 12.7l1.1-1.1M11.6 4.4l1.1-1.1"/></svg>`;
}
function svgSliders() {
  return `<svg ${SVG}><path d="M3 4.5h10M3 8h10M3 11.5h10"/><circle cx="6" cy="4.5" r="1.7" fill="currentColor" stroke="none"/><circle cx="10.5" cy="8" r="1.7" fill="currentColor" stroke="none"/><circle cx="5.5" cy="11.5" r="1.7" fill="currentColor" stroke="none"/></svg>`;
}
function svgPerfil() {
  return `<svg ${SVG}><circle cx="8" cy="5.4" r="2.7"/><path d="M3 13.6c0-2.7 2.2-4.6 5-4.6s5 1.9 5 4.6"/></svg>`;
}
function svgVendedoras() {
  return `<svg ${SVG}><circle cx="6" cy="5.4" r="2.4"/><path d="M1.6 13.4c0-2.5 2-4.1 4.4-4.1s4.4 1.6 4.4 4.1"/><path d="M10.5 3.4a2.3 2.3 0 0 1 0 4.3M11.6 9.5c1.9.4 2.9 1.9 2.9 3.9"/></svg>`;
}
function svgEscudo() {
  return `<svg ${SVG}><path d="M8 1.6 3 3.5v4c0 3.3 2 5.7 5 7 3-1.3 5-3.7 5-7v-4Z"/><path d="M5.9 7.9 7.4 9.4 10.3 6.2"/></svg>`;
}
function svgCalendario() {
  return `<svg ${SVG}><rect x="2.2" y="3" width="11.6" height="10.8" rx="1.6"/><path d="M2.2 6.3h11.6M5.4 1.6v2.6M10.6 1.6v2.6"/></svg>`;
}
function svgVoltar() {
  return `<svg ${SVG}><path d="M9.5 3.5 5 8l4.5 4.5M5 8h9"/></svg>`;
}
function svgChevron() {
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function svgDots() {
  return `<svg ${SVG} stroke-width="1.7"><circle cx="3" cy="8" r="0.8" fill="currentColor"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><circle cx="13" cy="8" r="0.8" fill="currentColor"/></svg>`;
}
function svgHamburguer() {
  return `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7H18M4 11H18M4 15H18"/></svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
