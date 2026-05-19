// topbar.js — Barra superior global do app autenticado.
// Renderizada pelo shell.js logo apos a sidebar. Mostra search
// global + bell + botao Novo lancamento. Sticky no topo, blur de
// fundo coerente com o resto do visual v2.
//
// Busca: por enquanto e visual (sem backend). Submit do form
// (Enter) navega pra uma rota futura /buscar?q= que ainda nao
// existe — o componente esta pronto, faltam as queries do lado
// servidor. Tecla / focar input. Esc limpa.

import { navegar } from '../app/router.js';

export function renderTopbar() {
  return `
    <header class="tb" role="banner">
      <form class="tb-search" id="tb-search" role="search" autocomplete="off">
        <span class="tb-search-icon" aria-hidden="true">${svgSearch()}</span>
        <input type="search" id="tb-search-input"
               placeholder="Buscar NF, pedido, cliente, valor…"
               aria-label="Busca global" />
        <kbd class="tb-search-kbd">/</kbd>
      </form>

      <div class="tb-actions">
        <a href="/notificacoes" data-link class="tb-icon" id="tb-bell"
           aria-label="Notificações">
          ${svgBell()}
          <span class="tb-icon-dot" id="tb-bell-dot" hidden></span>
        </a>
        <a href="/caixa/hoje" data-link class="tb-btn tb-btn--primary">
          ${svgPlus()} Novo lançamento
        </a>
      </div>
    </header>
  `;
}

export function ligarTopbar() {
  const form  = document.querySelector('#tb-search');
  const input = document.querySelector('#tb-search-input');
  if (!form || !input) return;

  // Tecla "/" foca a busca (fora de inputs)
  document.addEventListener('keydown', onSlash);

  // Esc limpa + tira foco
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    // Rota /buscar ainda nao implementada — por enquanto, vai pra
    // /pendencias com o query string. Quando a busca global existir,
    // troca por /buscar?q=
    navegar(`/pendencias?busca=${encodeURIComponent(q)}`);
  });
}

function onSlash(e) {
  if (e.key !== '/') return;
  const ativo = document.activeElement;
  const dentroInput = ativo && (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA');
  if (dentroInput) return;
  e.preventDefault();
  document.querySelector('#tb-search-input')?.focus();
}

export function desmontarTopbar() {
  document.removeEventListener('keydown', onSlash);
}

// ─── SVGs ───────────────────────────────────────────────────────────
const A = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
function svgSearch() { return `<svg ${A}><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>`; }
function svgBell()   { return `<svg ${A} stroke-width="1.5"><path d="M3 6a5 5 0 0 1 10 0v3l1.5 2H1.5L3 9V6Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`; }
function svgPlus()   { return `<svg ${A} stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>`; }
