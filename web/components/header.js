// header.js — barra superior compartilhada por dashboard, caixa, etc.
// Desenha logo + nav (Caixas, Pendências, Configurações) + avatar com nome.

import { sair } from '../app/auth.js';
import { navegar } from '../app/router.js';
import { pegarSessao } from '../app/supabase.js';
import { renderLogo } from './logo.js';

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
          ${renderLogo({ size: 28, cor: 'var(--c-musgo)' })}
          <span class="h-display text-lg" style="font-style:normal;font-weight:500;color:var(--c-tinta)">Caixa Boti</span>
        </a>

        <nav class="app-nav" aria-label="Navegação principal">
          ${link('/caixas',         'Caixas',        'caixas')}
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
