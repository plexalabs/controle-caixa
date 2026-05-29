// erro-404.js — Tela editorial para rotas inexistentes.
// Padrao v2 unificado: fundo topografico animado + card centralizado
// com simbolo Ledo + hierarquia editorial (eyebrow + titulo + texto +
// acoes). Mesmo estilo do /fora-do-horario, /login etc.

import { navegar } from '../router.js';
import { iniciarTopografia } from '../topo-bg.js';

// Simbolo Ledo inline (cores fixas musgo+palido, mesmo do sidebar)
const SIMBOLO_LEDO = `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">` +
  `<path fill="#2D4A2E" d="M128,40 L180,40 C180,40 210,70 210,130 C210,190 180,220 128,220 L76,220 C76,220 50,190 50,130 C50,70 80,40 128,40 Z"/>` +
  `<path fill="#E8F0E5" d="M128,40 L160,40 C160,40 175,55 175,85 C175,115 160,130 128,130 C100,130 85,115 85,85 C85,55 100,40 128,40 Z"/>` +
  `</svg>`;

export function renderErro404() {
  document.querySelector('#app').innerHTML = `
    <main id="main" class="erro-shell" role="main">
      <canvas id="erro-topo-canvas" class="erro-topo-canvas" aria-hidden="true"></canvas>

      <article class="erro-card">
        <header class="erro-cabec">
          <span class="erro-cabec-simbolo" aria-hidden="true">${SIMBOLO_LEDO}</span>
          <div class="erro-cabec-meta">
            <span class="erro-cabec-codigo">Erro 404</span>
            <span class="erro-cabec-app">Ledo · página não encontrada</span>
          </div>
        </header>

        <h1 class="erro-titulo">
          Esta página <em>não existe</em>.
        </h1>

        <p class="erro-texto">
          O endereço pedido pode ter sido movido, removido ou nunca ter
          existido. Confira o link e tente de novo, ou volte para o início
          do sistema.
        </p>

        <div class="erro-acoes">
          <a href="/dashboard" data-link class="btn-primary">Voltar ao início</a>
          <button type="button" id="btn-voltar" class="btn-link">← Página anterior</button>
        </div>
      </article>
    </main>
  `;

  // Fundo topografico animado (mesmo padrao de /login, /fora-do-horario)
  const topo = iniciarTopografia(document.querySelector('#erro-topo-canvas'), {
    escala: 0.004, vel: 0.00036, niveis: 14,
  });
  window.addEventListener('popstate', () => topo.stop(), { once: true });

  document.querySelector('#btn-voltar')?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navegar('/dashboard');
    }
  });
}
