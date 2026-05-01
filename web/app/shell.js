// shell.js — utilitário que envolve cada página no layout app-shell
// (sidebar lateral + área de conteúdo). Substitui o padrão antigo de
// cada página renderizar seu próprio header.
//
// Uso típico em uma página:
//   import { renderShell, ligarShell } from '../shell.js';
//   document.querySelector('#app').innerHTML = await renderShell({
//     rotaAtiva: 'caixas',
//     conteudo: `<main>...</main>`,
//   });
//   ligarShell();
//
// O #app vira o container do shell (data-shell="1"). A sidebar fica na
// coluna esquerda, e <main> da página fica na direita.

import { renderSidebar, ligarSidebar } from '../components/sidebar.js';

export async function renderShell({ rotaAtiva = '', conteudo = '' } = {}) {
  const sidebarHtml = await renderSidebar(rotaAtiva);
  return `
    ${sidebarHtml}
    <div class="app-conteudo" id="app-conteudo">
      ${conteudo}
    </div>
  `;
}

export function ligarShell() {
  const app = document.querySelector('#app');
  if (app) app.dataset.shell = '1';
  ligarSidebar();
}
