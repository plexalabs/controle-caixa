// configuracoes.js — Hub /configuracoes refator v2 "Clean Profissional".
// Grade de cartões: cada módulo abre na própria página. Cards admin-only
// aparecem só com a permissão RBAC correspondente. Namespace .cfg-*.

import { renderShell, ligarShell } from '../shell.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON = {
  vendedoras: `<svg ${SVG}><circle cx="6" cy="5.4" r="2.4"/><path d="M1.6 13.4c0-2.5 2-4.1 4.4-4.1s4.4 1.6 4.4 4.1"/><path d="M10.5 3.4a2.3 2.3 0 0 1 0 4.3M11.6 9.5c1.9.4 2.9 1.9 2.9 3.9"/></svg>`,
  perfil:     `<svg ${SVG}><circle cx="8" cy="5.4" r="2.7"/><path d="M3 13.6c0-2.7 2.2-4.6 5-4.6s5 1.9 5 4.6"/></svg>`,
  feriados:   `<svg ${SVG}><rect x="2.2" y="3" width="11.6" height="10.8" rx="1.6"/><path d="M2.2 6.3h11.6M5.4 1.6v2.6M10.6 1.6v2.6"/><path d="M6 9.4 7.3 10.7 10 8"/></svg>`,
  usuarios:   `<svg ${SVG}><path d="M8 1.6 3 3.5v4c0 3.3 2 5.7 5 7 3-1.3 5-3.7 5-7v-4Z"/><path d="M5.9 7.9 7.4 9.4 10.3 6.2"/></svg>`,
  permissoes: `<svg ${SVG}><rect x="3" y="7" width="10" height="6.8" rx="1.4"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7"/><circle cx="8" cy="10.3" r="0.9"/></svg>`,
  sistema:    `<svg ${SVG}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.5M8 13v1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M1.5 8H3M13 8h1.5M3.3 12.7l1.1-1.1M11.6 4.4l1.1-1.1"/></svg>`,
  auditoria:  `<svg ${SVG}><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5.6 5.3h4.8M5.6 8h4.8M5.6 10.7h3"/></svg>`,
};
const ICON_SETA = `<svg viewBox="0 0 22 14" fill="none"><path d="M1 7H20M14 1l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_ESCUDO = `<svg ${SVG}><path d="M8 1.6 3 3.5v4c0 3.3 2 5.7 5 7 3-1.3 5-3.7 5-7v-4Z"/></svg>`;

export async function renderConfiguracoes() {
  await carregarPermissoes();
  const ehAdmin = temPermissaoSync('usuario.visualizar')
               || temPermissaoSync('config.editar_sistema')
               || temPermissaoSync('config.gerenciar_feriados');

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: '',
    conteudo: `
    <main id="main" class="cfg">
      <header class="cfg-header">
        <p class="cfg-eyebrow">Sistema</p>
        <h1 class="cfg-title">Configurações</h1>
        <p class="cfg-sub">
          Cada módulo abre na própria página. O que aparece aqui depende
          do seu papel — itens administrativos só para quem tem acesso.
        </p>
      </header>

      <div class="cfg-grid">
        ${itens().map((it, i) => cardHtml(it, i)).join('')}
      </div>

      <div class="cfg-rodape" data-admin="${ehAdmin ? '1' : '0'}">
        <span class="cfg-rodape-icone" aria-hidden="true">${ICON_ESCUDO}</span>
        <span>
          ${ehAdmin
            ? 'Você tem privilégios de <strong>administrador</strong> — vê todos os módulos.'
            : 'Você está como <strong>operador</strong>. Módulos administrativos aparecem apenas para o admin.'}
        </span>
      </div>
    </main>
  `,
  });

  ligarShell();
}

// Ordem fixa dos módulos. Cada um declara a permissão necessária —
// pode ser uma string ou um array (basta ter QUALQUER uma).
// "Seu perfil" e "Auditoria & Lixeira" não ficam aqui: perfil mora no
// popup do usuário; auditoria foi pra sidebar.
function itens() {
  return [
    {
      slug: 'vendedoras', categoria: 'Operação', tom: 'accent',
      titulo: 'Vendedoras',
      desc: 'Quem recebe pagamentos em dinheiro. Operadores criam, admin desativa.',
      href: '/configuracoes/vendedoras',
    },
    {
      slug: 'usuarios', categoria: 'Acessos', tom: 'info',
      titulo: 'Usuários e Permissões',
      desc: 'Quem entra no sistema, em que papel, e os perfis de permissão granular.',
      href: '/configuracoes/usuarios',
      permissao: ['usuario.visualizar', 'perfil.visualizar'],
    },
    {
      slug: 'feriados', categoria: 'Calendário', tom: 'warn',
      titulo: 'Feriados',
      desc: 'Datas de feriado bancário — afetam o cálculo de dias úteis das pendências.',
      href: '/configuracoes/feriados',
      permissao: 'config.gerenciar_feriados',
    },
    {
      slug: 'sistema', categoria: 'Bastidores', tom: 'ink',
      titulo: 'Sistema',
      desc: 'Configurações globais — limites, alertas e integrações com Excel e Apps Script.',
      href: '/configuracoes/sistema',
      permissao: 'config.editar_sistema',
    },
  ].filter(it => {
    if (!it.permissao) return true;
    const perms = Array.isArray(it.permissao) ? it.permissao : [it.permissao];
    return perms.some(p => temPermissaoSync(p));
  });
}

function cardHtml(it, i) {
  const delay = `style="animation-delay:${Math.min(i * 55, 330)}ms"`;
  return `
    <a href="${it.href}" data-link class="cfg-card" data-tom="${it.tom}" ${delay}
       aria-label="${esc(it.titulo)} — ${esc(it.desc)}">
      <span class="cfg-card-topo">
        <span class="cfg-card-icone" aria-hidden="true">${ICON[it.slug] || ICON.sistema}</span>
        <span class="cfg-card-seta" aria-hidden="true">${ICON_SETA}</span>
      </span>
      <span class="cfg-card-eyebrow">${esc(it.categoria)}</span>
      <span class="cfg-card-titulo">${esc(it.titulo)}</span>
      <span class="cfg-card-desc">${esc(it.desc)}</span>
    </a>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
