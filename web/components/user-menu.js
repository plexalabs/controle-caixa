// user-menu.js — Popover do usuário (CP5-FIX 3).
// Trigger: avatar+nome no rodapé da sidebar. Click abre popover acima ou
// à direita do trigger (alinhado de modo que sai "para fora" da sidebar).
// Fecha em ESC, click fora, ou click em qualquer item de navegação.
// Itens admin-only renderizam só se papel = admin.

import { pegarSessao } from '../app/supabase.js';
import { navegar } from '../app/router.js';
import { carregarPermissoes, temPermissaoSync } from '../app/papeis.js';

let popoverAtual = null;
let escListener  = null;
let cliqueForaListener = null;

export async function abrirUserMenu({ onSair } = {}) {
  if (popoverAtual) { fecharUserMenu(); return; }

  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const nome   = (meta.nome || sessao?.user?.email?.split('@')[0] || 'Operador').trim();
  const email  = sessao?.user?.email || '';
  // RBAC Sessao 3: "Painel admin" mostra pra quem tem acesso a alguma
  // area admin. usuario.visualizar eh proxy estavel (admin/gerente tem;
  // super_admin via bypass). Pra menus mais granulares no futuro, dividir
  // em itens individuais com sua propria permissao.
  await carregarPermissoes();
  const ehAdmin = temPermissaoSync('usuario.visualizar');

  const trigger = document.querySelector('#sidebar-user');
  if (!trigger) return;
  trigger.setAttribute('aria-expanded', 'true');

  const pop = document.createElement('div');
  pop.className = 'user-menu';
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', 'Menu do usuário');
  pop.innerHTML = `
    <header class="user-menu-header">
      <p class="user-menu-nome">${esc(nome)}</p>
      <p class="user-menu-email" title="${esc(email)}">${esc(email)}</p>
    </header>

    <ul class="user-menu-lista" role="none">
      ${ehAdmin
        ? itemMenu({ rotulo: 'Painel admin', icone: svgEscudo(), href: '/configuracoes' })
        : itemMenu({ rotulo: 'Configurações', icone: svgEngrenagem(), href: '/configuracoes' })}
      ${itemMenu({ rotulo: 'Seu perfil', icone: svgUsuario(), href: '/perfil' })}
    </ul>

    <ul class="user-menu-lista" role="none">
      ${itemMenu({ rotulo: 'Receber ajuda', icone: svgCirculoInterrogacao(), placeholder: 'Em breve' })}
    </ul>

    <ul class="user-menu-lista user-menu-lista--final" role="none">
      ${itemMenu({ rotulo: 'Sair', icone: svgSair(), acao: 'sair', tom: 'alerta' })}
    </ul>
  `;

  document.body.appendChild(pop);
  popoverAtual = pop;
  posicionar(pop, trigger);

  // Fade-up de entrada
  requestAnimationFrame(() => pop.classList.add('is-aberto'));

  // Listeners de fechamento
  escListener = (e) => {
    if (e.key === 'Escape') { fecharUserMenu(); }
  };
  cliqueForaListener = (e) => {
    if (!pop.contains(e.target) && !trigger.contains(e.target)) fecharUserMenu();
  };
  document.addEventListener('keydown', escListener);
  // setTimeout pra evitar capturar o próprio click que abriu o menu
  setTimeout(() => document.addEventListener('mousedown', cliqueForaListener), 0);

  // Click em itens
  pop.querySelectorAll('[data-href]').forEach(el => {
    el.addEventListener('click', () => {
      const href = el.dataset.href;
      fecharUserMenu();
      if (href) navegar(href);
    });
  });
  pop.querySelectorAll('[data-acao="sair"]').forEach(el => {
    el.addEventListener('click', async () => {
      fecharUserMenu();
      if (typeof onSair === 'function') await onSair();
    });
  });
  // Item placeholder
  pop.querySelectorAll('[data-placeholder]').forEach(el => {
    el.addEventListener('click', (e) => e.preventDefault());
  });

  window.addEventListener('resize', fecharUserMenu, { once: true });
}

function fecharUserMenu() {
  if (!popoverAtual) return;
  const pop = popoverAtual;
  popoverAtual = null;
  pop.classList.remove('is-aberto');
  pop.classList.add('is-fechando');
  setTimeout(() => pop.remove(), 180);

  document.removeEventListener('keydown', escListener);
  document.removeEventListener('mousedown', cliqueForaListener);
  escListener = null;
  cliqueForaListener = null;

  document.querySelector('#sidebar-user')?.setAttribute('aria-expanded', 'false');
}

function posicionar(pop, trigger) {
  const r = trigger.getBoundingClientRect();
  const popW = 280;
  const margem = 8;
  const aside = document.querySelector('.app-sidebar');
  const estado = aside?.dataset.estado || 'expandida';
  const ehMobile = window.innerWidth < 768;

  // Sidebar EXPANDIDA: popover sobe alinhado à esquerda do trigger
  // (topo do popover toca o topo do trigger).
  // Sidebar COLAPSADA: popover sai para a direita, alinhado pelo bottom
  // do trigger (canto inferior coincide).
  // Mobile: igual à expandida — popover sobe.
  const expandida = (estado === 'expandida' || estado === 'mobile-aberto' || ehMobile);

  let left;
  let top;

  if (expandida) {
    // Sai PARA CIMA, mesmo eixo X que o trigger
    left = Math.max(margem, r.left);
    // se não couber à esquerda do viewport, joga pra direita do trigger
    if (left + popW > window.innerWidth - margem) {
      left = Math.max(margem, window.innerWidth - popW - margem);
    }
    top = r.top - margem;
    pop.classList.add('user-menu--acima');
  } else {
    // Sai PARA A DIREITA, alinhado pelo bottom do trigger
    left = r.right + margem;
    if (left + popW > window.innerWidth - margem) {
      // Sem espaço à direita — joga acima do trigger
      left = Math.max(margem, r.left);
      top = r.top - margem;
      pop.classList.add('user-menu--acima');
    } else {
      top = r.bottom;
      pop.classList.add('user-menu--lateral');
    }
  }

  pop.style.left = `${left}px`;
  pop.style.top  = `${top}px`;
}

function itemMenu({ rotulo, icone, href, acao, tom, placeholder }) {
  const attrs = [];
  if (href)        attrs.push(`data-href="${esc(href)}"`);
  if (acao)        attrs.push(`data-acao="${esc(acao)}"`);
  if (placeholder) attrs.push(`data-placeholder="1"`);
  if (tom)         attrs.push(`data-tom="${esc(tom)}"`);
  return `
    <li role="none">
      <button type="button" class="user-menu-item" role="menuitem" ${attrs.join(' ')}>
        <span class="user-menu-item-icone" aria-hidden="true">${icone}</span>
        <span class="user-menu-item-rotulo">${esc(rotulo)}</span>
        ${placeholder ? `<span class="user-menu-item-tag">${esc(placeholder)}</span>` : ''}
      </button>
    </li>`;
}

// ─── Ícones ─────────────────────────────────────────────────────────
function svgEscudo() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z"
          stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M9 12 L11 14 L15 10" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
function svgEngrenagem() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
    <path d="M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M4.9 4.9 L6.3 6.3 M17.7 17.7 L19.1 19.1 M4.9 19.1 L6.3 17.7 M17.7 6.3 L19.1 4.9"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}
function svgUsuario() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
    <path d="M4 21 C4 16.5 7.5 13.5 12 13.5 C16.5 13.5 20 16.5 20 21"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}
function svgCirculoInterrogacao() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
    <path d="M9.5 9.2 C9.5 7.8 10.7 6.7 12.1 6.7 C13.5 6.7 14.6 7.8 14.6 9.2 C14.6 10.5 13.7 11 12.7 11.6 C11.9 12 11.5 12.5 11.5 13.5"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="17" r="0.7" fill="currentColor"/>
  </svg>`;
}
function svgSair() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M14 4 H17 C18.1 4 19 4.9 19 6 V18 C19 19.1 18.1 20 17 20 H14"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M10 8 L14 12 L10 16 M14 12 H4"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
