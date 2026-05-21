// shell.js — envolve cada página no layout app-shell (sidebar + conteúdo).
//
// Duas áreas, duas sidebars:
//   • App         — sidebar principal (Painel, Caixas, Relatórios…).
//   • Configurações — /perfil e /configuracoes/* usam a sidebar de
//     Configurações (sidebar-config). Auditoria e Lixeira ficam de fora:
//     são destinos da sidebar principal.
// A detecção é por location.pathname, então as páginas não mudam — só
// chamam renderShell({ rotaAtiva, conteudo }) + ligarShell() como sempre.

import { renderSidebar, ligarSidebar }             from '../components/sidebar.js';
import { renderSidebarConfig, ligarSidebarConfig } from '../components/sidebar-config.js';
import { renderTopbar, ligarTopbar }               from './../components/topbar.js';

function ehAreaConfig() {
  const p = location.pathname;
  if (p === '/perfil') return true;
  if (p === '/configuracoes/auditoria' || p === '/configuracoes/lixeira') return false;
  return p === '/configuracoes' || p.startsWith('/configuracoes/');
}

export async function renderShell({ rotaAtiva = '', conteudo = '' } = {}) {
  const config = ehAreaConfig();
  const sidebarHtml = config ? await renderSidebarConfig() : await renderSidebar(rotaAtiva);
  const topbarHtml  = renderTopbar();
  return `
    ${sidebarHtml}
    <div class="app-conteudo${config ? ' app-conteudo--config' : ''}" id="app-conteudo">
      ${topbarHtml}
      ${conteudo}
    </div>
  `;
}

export function ligarShell() {
  const app = document.querySelector('#app');
  if (app) app.dataset.shell = '1';
  if (ehAreaConfig()) ligarSidebarConfig();
  else                ligarSidebar();
  ligarTopbar();
}
