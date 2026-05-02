// erro-404.js — Tela editorial para rotas inexistentes (CP-PRE-DEPLOY-1).
// Catch-all do router cai aqui. Layout: etiqueta lateral âmbar com "404"
// vertical + título Fraunces + texto editorial + ações (voltar / início).

import { navegar } from '../router.js';

export function renderErro404() {
  document.querySelector('#app').innerHTML = `
    <main id="main" class="erro-shell" role="main">
      <aside class="erro-etiqueta" aria-hidden="true">404</aside>

      <section class="erro-conteudo">
        <p class="h-eyebrow">Página não encontrada</p>
        <h1 class="erro-titulo">
          Esta página não existe<br>
          <em>no caderno.</em>
        </h1>
        <p class="erro-texto">
          O endereço pedido pode ter sido movido, removido ou nunca ter existido.
          Confira o link e tente de novo, ou volte para o início.
        </p>
        <div class="erro-acoes">
          <a href="/dashboard" data-link class="btn-primary">Voltar para o início</a>
          <button type="button" id="btn-voltar" class="btn-link">← Página anterior</button>
        </div>
      </section>
    </main>
  `;

  document.querySelector('#btn-voltar')?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navegar('/dashboard');
    }
  });
}
