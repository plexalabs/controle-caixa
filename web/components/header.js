// header.js — barra superior compartilhada por dashboard, caixa, etc.
// Desenha logo + nav (Hoje, Pendências, Configurações) + avatar com nome.

import { sair } from '../app/auth.js';
import { navegar } from '../app/router.js';
import { pegarSessao } from '../app/supabase.js';

export async function renderHeader(rotaAtiva) {
  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const nome   = (meta.nome || sessao?.user?.email?.split('@')[0] || '').trim();
  const inicial = (meta.nome?.[0] || sessao?.user?.email?.[0] || '?').toUpperCase();

  const link = (href, rotulo, chave) =>
    `<a href="${href}" data-link class="app-nav-link" ${rotaAtiva === chave ? 'aria-current="page"' : ''}>${rotulo}</a>`;

  return `
    <header class="app-header">
      <div class="app-header-inner">
        <a href="/dashboard" data-link class="flex items-center gap-2 no-underline" aria-label="Caixa Boti — início">
          ${logoSvg()}
          <span class="h-display text-lg" style="font-style:normal;font-weight:500;color:var(--c-tinta)">Caixa Boti</span>
        </a>

        <nav class="app-nav" aria-label="Navegação principal">
          ${link('/caixa/hoje',     'Hoje',          'caixa')}
          ${link('/pendencias',     'Pendências',    'pendencias')}
          ${link('/configuracoes',  'Configurações', 'config')}
        </nav>

        <div class="app-user">
          <span class="hidden sm:inline">${esc(nome) || 'Operador'}</span>
          <span class="app-user-avatar" aria-hidden="true">${esc(inicial)}</span>
          <button id="btn-sair" class="btn-link" style="font-size:0.85rem">Sair</button>
        </div>
      </div>
    </header>
  `;
}

// Vincula o botão "Sair" depois do innerHTML estar pronto.
export function ligarHeader() {
  const btn = document.querySelector('#btn-sair');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await sair();
    navegar('/login');
  });
}

function logoSvg() {
  return `
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.5" style="color:var(--c-musgo)"/>
      <path d="M8 22 L24 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="color:var(--c-musgo)"/>
      <circle cx="11" cy="13" r="1.5" fill="currentColor" style="color:var(--c-ambar)"/>
      <circle cx="21" cy="19" r="1.5" fill="currentColor" style="color:var(--c-ambar)"/>
    </svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
