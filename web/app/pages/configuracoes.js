// configuracoes.js — Hub /configuracoes (CP5.1).
// Lista as subseções disponíveis. Cards admin-only só renderizam se
// o usuário tiver o papel; placeholders dos CP7+ aparecem desativados.
// Layout editorial: índice numerado tipo sumário de revista.

import { renderShell, ligarShell } from '../shell.js';
import { pegarPapeis } from '../papeis.js';

export async function renderConfiguracoes() {
  const papeis  = await pegarPapeis();
  const ehAdmin = papeis.includes('admin');

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <header class="config-cabec reveal reveal-1" data-etiqueta="AJUSTES">
        <div class="config-cabec-conteudo">
          <p class="h-eyebrow">Configurações</p>
          <h1 class="h-display config-titulo">Os ajustes do sistema, em ordem.</h1>
          <p class="config-subtitulo text-body">
            Cada módulo abre em sua própria página. O que estiver
            <em>em breve</em> chega nos próximos checkpoints.
          </p>
        </div>
      </header>

      <ol class="config-sumario reveal reveal-2" aria-label="Sumário das configurações">
        ${itens(ehAdmin).map((it, i) => itemHtml(it, i + 1)).join('')}
      </ol>

      <p class="config-rodape reveal reveal-3 text-body">
        ${ehAdmin
          ? 'Você tem privilégios de <strong>administrador</strong>.'
          : 'Você está logado como <strong>operador</strong>. Itens administrativos aparecem só para o admin.'}
      </p>
    </main>
  `,
  });
  ligarShell();
}

function itens(ehAdmin) {
  return [
    {
      slug: 'vendedoras',
      eyebrow: 'Operação',
      titulo: 'Vendedoras',
      desc: 'Cadastro de quem recebe pagamentos em dinheiro. Operadores criam, admin desativa.',
      href: '/configuracoes/vendedoras',
      ativo: true,
    },
    {
      slug: 'perfil',
      eyebrow: 'Você',
      titulo: 'Seu perfil',
      desc: 'Nome, email, senha e papéis. Trocas pessoais que não dependem do admin.',
      href: '/perfil',
      ativo: true,
    },
    {
      slug: 'feriados',
      eyebrow: 'Calendário',
      titulo: 'Feriados',
      desc: 'Define quais datas são feriado bancário. Afeta o cálculo de dias úteis nas pendências.',
      href: '/configuracoes/feriados',
      ativo: false,
      pendente: 'CP7',
      adminOnly: true,
    },
    {
      slug: 'usuarios',
      eyebrow: 'Acessos',
      titulo: 'Usuários e papéis',
      desc: 'Quem entra no sistema e em que papel — operador, admin, ou ambos.',
      href: '/configuracoes/usuarios',
      ativo: false,
      pendente: 'CP7',
      adminOnly: true,
    },
    {
      slug: 'sistema',
      eyebrow: 'Bastidores',
      titulo: 'Sistema',
      desc: 'Configurações globais do banco — limites, alertas, integrações com Excel e Apps Script.',
      href: '/configuracoes/sistema',
      ativo: false,
      pendente: 'CP7',
      adminOnly: true,
    },
  ].filter(it => !it.adminOnly || ehAdmin);
}

function itemHtml(it, n) {
  const numero = String(n).padStart(2, '0');
  const dataDelay = `style="animation-delay:${(n - 1) * 60}ms"`;

  if (!it.ativo) {
    return `
      <li class="config-item config-item--em-breve" data-slug="${it.slug}" ${dataDelay}>
        <span class="config-item-num" aria-hidden="true">${numero}</span>
        <div class="config-item-corpo">
          <p class="h-eyebrow">${esc(it.eyebrow)}</p>
          <h3 class="config-item-titulo">${esc(it.titulo)}</h3>
          <p class="config-item-desc">${esc(it.desc)}</p>
        </div>
        <span class="config-item-marca" aria-label="Em breve no ${it.pendente}">em breve · ${it.pendente}</span>
      </li>
    `;
  }

  return `
    <li class="config-item" ${dataDelay}>
      <a href="${it.href}" data-link class="config-item-link"
         aria-label="${esc(it.titulo)}: ${esc(it.desc)}">
        <span class="config-item-num" aria-hidden="true">${numero}</span>
        <div class="config-item-corpo">
          <p class="h-eyebrow">${esc(it.eyebrow)}</p>
          <h3 class="config-item-titulo">${esc(it.titulo)}</h3>
          <p class="config-item-desc">${esc(it.desc)}</p>
        </div>
        <span class="config-item-seta" aria-hidden="true">
          <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
            <path d="M1 7 H20 M14 1 L20 7 L14 13" stroke="currentColor"
                  stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </a>
    </li>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
