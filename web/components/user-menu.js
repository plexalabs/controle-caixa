// user-menu.js — Popover do usuario v2 ("Clean Profissional").
// Trigger: o bloco .sb-user no rodape da sidebar (#sb-user).
// Click abre popover. Fecha em ESC, click fora, ou click em item.
//
// Header rico: avatar 44px verde + nome + cargo + email + badge
// 'super_admin' (se aplicavel). Itens em grupos com divisores.
// Posicionamento: desktop sai pra direita do trigger; mobile/estreito
// sobe alinhado sobre o trigger.

import { supabase, pegarSessao } from '../app/supabase.js';
import { navegar } from '../app/router.js';
import { pegarPapeis } from '../app/papeis.js';

let popoverAtual = null;
let escListener  = null;
let cliqueForaListener = null;

const ICONS = {
  perfil:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"/></svg>`,
  gear:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.4M8 13.1v1.4M3.4 3.4l1 1M11.6 11.6l1 1M1.5 8h1.4M13.1 8h1.4M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>`,
  shield:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 3 3.5v4c0 3.2 2 5.6 5 7 3-1.4 5-3.8 5-7v-4l-5-2Z"/><path d="M6 8l1.5 1.5L10.5 6.5"/></svg>`,
  audit:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2" width="11" height="12" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h4"/></svg>`,
  help:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9V10"/><circle cx="8" cy="12" r="0.6" fill="currentColor"/></svg>`,
  logout:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9"/><path d="M6 5l-3 3 3 3M3 8h7"/></svg>`,
  copy:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v2"/></svg>`,
  star:     `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l2 4.5 5 .5-3.7 3.4 1 4.9L8 12.4l-4.3 2.4 1-4.9L1 6.5l5-.5 2-4.5z"/></svg>`,
};

export async function abrirUserMenu({ onSair } = {}) {
  if (popoverAtual) { fecharUserMenu(); return; }

  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const email  = sessao?.user?.email || '';
  const nomeCompleto = [meta.nome, meta.sobrenome].filter(Boolean).join(' ').trim()
                    || meta.nome
                    || email.split('@')[0]
                    || 'Operador';
  const inicial = ((meta.nome?.[0] || email?.[0]) || '?').toUpperCase();
  const avatarUrl = meta.avatar_url || '';

  // Papel (para o selo super)
  const papeis = await pegarPapeis();
  const ehSuper = papeis?.includes('super_admin');

  // Cargo (nome do perfil RBAC) — best-effort
  let cargo = '—';
  if (sessao?.user?.id) {
    try {
      const { data } = await supabase
        .from('usuario_perfil')
        .select('perfil:perfil_id(nome)')
        .eq('usuario_id', sessao.user.id)
        .maybeSingle();
      cargo = data?.perfil?.nome || '—';
    } catch (_) {}
  }

  // Gatilho: botão do usuário da sidebar principal OU da sidebar de
  // configurações — o que estiver presente.
  const trigger = document.querySelector('#sb-user') || document.querySelector('#sbc-user');
  if (!trigger) return;
  trigger.setAttribute('aria-expanded', 'true');

  const pop = document.createElement('div');
  pop.className = 'um';
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', 'Menu do usuário');

  pop.innerHTML = `
    <header class="um-head">
      <div class="um-avatar" aria-hidden="true">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="" />` : esc(inicial)}</div>
      <div class="um-meta">
        <div class="um-nome">${esc(nomeCompleto)}</div>
        <div class="um-cargo">
          <span class="um-cargo-texto">${esc(cargo)}</span>
          ${ehSuper ? `<span class="um-badge" title="Super administrador">${ICONS.star} super</span>` : ''}
        </div>
      </div>
      <button type="button" class="um-email" data-acao="copiar-email" title="Copiar e-mail">
        <span class="um-email-texto">${esc(email)}</span>
        <span class="um-email-icone" aria-hidden="true">${ICONS.copy}</span>
      </button>
    </header>

    <div class="um-group" role="none">
      ${itemMenu({ rotulo: 'Seu perfil', icone: ICONS.perfil, href: '/perfil' })}
    </div>

    <div class="um-group" role="none">
      ${itemMenu({ rotulo: 'Ajuda', icone: ICONS.help, placeholder: 'em breve' })}
    </div>

    <div class="um-group um-group--final" role="none">
      ${itemMenu({ rotulo: 'Sair', icone: ICONS.logout, acao: 'sair', tom: 'danger' })}
    </div>
  `;

  document.body.appendChild(pop);
  popoverAtual = pop;
  posicionar(pop, trigger);

  requestAnimationFrame(() => pop.classList.add('is-open'));

  escListener = (e) => { if (e.key === 'Escape') fecharUserMenu(); };
  cliqueForaListener = (e) => {
    if (!pop.contains(e.target) && !trigger.contains(e.target)) fecharUserMenu();
  };
  document.addEventListener('keydown', escListener);
  setTimeout(() => document.addEventListener('mousedown', cliqueForaListener), 0);

  // Navegacao
  pop.querySelectorAll('[data-href]').forEach(el => {
    el.addEventListener('click', () => {
      const href = el.dataset.href;
      fecharUserMenu();
      if (href) navegar(href);
    });
  });
  // Sair
  pop.querySelectorAll('[data-acao="sair"]').forEach(el => {
    el.addEventListener('click', async () => {
      fecharUserMenu();
      if (typeof onSair === 'function') await onSair();
    });
  });
  // Copiar email
  pop.querySelectorAll('[data-acao="copiar-email"]').forEach(el => {
    el.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email);
        el.classList.add('is-copied');
        setTimeout(() => el.classList.remove('is-copied'), 1400);
      } catch (_) {}
    });
  });
  // Placeholder (em breve)
  pop.querySelectorAll('[data-placeholder]').forEach(el => {
    el.addEventListener('click', (e) => e.preventDefault());
  });

  window.addEventListener('resize', fecharUserMenu, { once: true });
}

function fecharUserMenu() {
  if (!popoverAtual) return;
  const pop = popoverAtual;
  popoverAtual = null;
  pop.classList.remove('is-open');
  pop.classList.add('is-closing');
  setTimeout(() => pop.remove(), 180);

  document.removeEventListener('keydown', escListener);
  document.removeEventListener('mousedown', cliqueForaListener);
  escListener = null;
  cliqueForaListener = null;

  document.querySelector('#sb-user, #sbc-user')?.setAttribute('aria-expanded', 'false');
}

// Posiciona o popover SUBINDO a partir do topo do trigger (que fica no
// rodapé da sidebar). Usa a propriedade `bottom`, então o popover cresce
// pra cima sem precisar medir a própria altura — e nunca estoura a parte
// de baixo da tela (que era o bug do posicionamento antigo).
function posicionar(pop, trigger) {
  const r = trigger.getBoundingClientRect();
  const popW = 300;
  const margem = 8;

  const left = Math.max(margem, Math.min(r.left, window.innerWidth - popW - margem));
  pop.style.left   = `${left}px`;
  pop.style.top    = 'auto';
  pop.style.bottom = `${Math.max(margem, window.innerHeight - r.top + margem)}px`;
}

function itemMenu({ rotulo, icone, href, acao, tom, placeholder }) {
  const attrs = [];
  if (href)        attrs.push(`data-href="${esc(href)}"`);
  if (acao)        attrs.push(`data-acao="${esc(acao)}"`);
  if (placeholder) attrs.push(`data-placeholder="1"`);
  if (tom)         attrs.push(`data-tom="${esc(tom)}"`);
  return `
    <button type="button" class="um-item" role="menuitem" ${attrs.join(' ')}>
      <span class="um-item-icon" aria-hidden="true">${icone}</span>
      <span class="um-item-label">${esc(rotulo)}</span>
      ${placeholder ? `<span class="um-item-tag">${esc(placeholder)}</span>` : ''}
    </button>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
