// demo-visual.js — Sandbox de design system "Clean Profissional".
// Pagina ESTATICA com dados mock — nao le nem escreve no banco,
// nao depende de sessao, nao interfere em nada. Serve so para
// aprovar a nova direcao visual antes de refatorar o resto.
//
// Toda marcacao usa namespace .dv-* isolado em web/styles/demo-visual.css
// (sem reaproveitar classes do projeto). Quando aprovado, migramos
// componente por componente.

const ICONS = {
  search: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>`,
  home:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l6-5 6 5v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7Z"/><path d="M6 15v-5h4v5"/></svg>`,
  box:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5 8 2l6 2.5v7L8 14l-6-2.5v-7Z"/><path d="M2 4.5 8 7l6-2.5"/><path d="M8 7v7"/></svg>`,
  list:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2.5" cy="4" r="0.7" fill="currentColor"/><circle cx="2.5" cy="8" r="0.7" fill="currentColor"/><circle cx="2.5" cy="12" r="0.7" fill="currentColor"/></svg>`,
  bell:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a5 5 0 0 1 10 0v3l1.5 2H1.5L3 9V6Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`,
  report: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 10V7M8 10V5M11 10V8"/></svg>`,
  gear:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.4M8 13.1v1.4M3.4 3.4l1 1M11.6 11.6l1 1M1.5 8h1.4M13.1 8h1.4M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>`,
  shield: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 3 3.5v4c0 3.2 2 5.6 5 7 3-1.4 5-3.8 5-7v-4l-5-2Z"/></svg>`,
  plus:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3 8h10"/></svg>`,
  filter: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12L9.5 9v4l-3-1V9L2 4Z"/></svg>`,
  arrowDown: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`,
  trendUp: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11l4-4 3 3 5-5"/><path d="M10 5h4v4"/></svg>`,
  trendDown: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5l4 4 3-3 5 5"/><path d="M10 11h4V7"/></svg>`,
  dollar: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M11 5H6.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H4"/></svg>`,
  clock:  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>`,
  pkg:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5l6-3 6 3v6l-6 3-6-3V5Z"/><path d="M8 8v6M2 5l6 3 6-3"/></svg>`,
};

const LANCAMENTOS_MOCK = [
  { id: 1, nf: '015423', cliente: 'Ana Beatriz Souza',     valor: 'R$ 1.249,90', categoria: 'Pix',         pill: 'ok',     estado: 'Finalizado',  hora: '09:14' },
  { id: 2, nf: '015424', cliente: 'Carlos Eduardo Lima',   valor: 'R$ 489,00',   categoria: 'Cartão',      pill: 'info',   estado: 'Finalizado',  hora: '09:32' },
  { id: 3, nf: '015425', cliente: 'Marina Tavares',        valor: 'R$ 2.180,50', categoria: 'Cartão Link', pill: 'info',   estado: 'Aguardando',  hora: '10:05' },
  { id: 4, nf: '015426', cliente: 'Rafael Mendes',         valor: 'R$ 320,00',   categoria: 'Dinheiro',    pill: 'ok',     estado: 'Finalizado',  hora: '10:41' },
  { id: 5, nf: '015427', cliente: 'Juliana Pereira',       valor: 'R$ 1.890,00', categoria: 'Retirada',    pill: 'warn',   estado: 'Aguardando',  hora: '11:12' },
  { id: 6, nf: '015428', cliente: 'Diego Hartman',         valor: 'R$ 678,40',   categoria: 'OBS',         pill: 'warn',   estado: 'Pendente',    hora: '11:48' },
  { id: 7, nf: '015429', cliente: 'Patricia Coelho',       valor: 'R$ 3.450,00', categoria: 'Cartão',      pill: 'ok',     estado: 'Finalizado',  hora: '13:22' },
  { id: 8, nf: '015430', cliente: 'Bruno Albuquerque',     valor: 'R$ 120,00',   categoria: 'Cancelado',   pill: 'danger', estado: 'Cancelado',   hora: '14:01' },
  { id: 9, nf: '015431', cliente: 'Helena Vasconcelos',    valor: 'R$ 1.075,00', categoria: 'Pix',         pill: 'ok',     estado: 'Finalizado',  hora: '14:35' },
  { id:10, nf: '015432', cliente: 'Thiago Nogueira',       valor: 'R$ 590,90',   categoria: 'Cartão',      pill: 'info',   estado: 'Aguardando',  hora: '15:18' },
];

export async function renderDemoVisual() {
  document.querySelector('#app').innerHTML = `
    <div class="dv-root">
      <div class="dv-shell">
        ${sidebarHtml()}
        <div class="dv-main">
          ${topbarHtml()}
          <div class="dv-content">
            ${pageHeaderHtml()}
            ${kpisHtml()}
            ${toolbarHtml()}
            <div class="dv-split">
              ${tableHtml()}
              ${detailHtml()}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  ligarInteracoes();
}

function sidebarHtml() {
  return `
    <aside class="dv-sidebar" aria-label="Navegação principal">
      <div class="dv-brand">
        <div class="dv-brand-mark">B</div>
        <div>
          <div class="dv-brand-name">Caixa Boti</div>
          <div class="dv-brand-tag">Auditoria diária</div>
        </div>
      </div>

      <nav class="dv-nav">
        <div class="dv-nav-group">
          <p class="dv-nav-group-label">Operação</p>
          <a class="dv-nav-item" aria-current="page" data-nav>
            <span class="dv-nav-icon">${ICONS.home}</span>
            Painel
          </a>
          <a class="dv-nav-item" data-nav>
            <span class="dv-nav-icon">${ICONS.box}</span>
            Caixas
          </a>
          <a class="dv-nav-item" data-nav>
            <span class="dv-nav-icon">${ICONS.list}</span>
            Pendências
            <span class="dv-nav-badge">7</span>
          </a>
          <a class="dv-nav-item" data-nav>
            <span class="dv-nav-icon">${ICONS.bell}</span>
            Notificações
            <span class="dv-nav-badge">3</span>
          </a>
        </div>

        <div class="dv-nav-group">
          <p class="dv-nav-group-label">Análise</p>
          <a class="dv-nav-item" data-nav>
            <span class="dv-nav-icon">${ICONS.report}</span>
            Relatórios
          </a>
          <a class="dv-nav-item" data-nav>
            <span class="dv-nav-icon">${ICONS.shield}</span>
            Auditoria
          </a>
        </div>

        <div class="dv-nav-group">
          <p class="dv-nav-group-label">Sistema</p>
          <a class="dv-nav-item" data-nav>
            <span class="dv-nav-icon">${ICONS.gear}</span>
            Configurações
          </a>
        </div>
      </nav>

      <div class="dv-sidebar-footer">
        <div class="dv-userblock">
          <div class="dv-avatar">JV</div>
          <div class="dv-user-meta">
            <div class="dv-user-name">João Vitor Botucatu</div>
            <div class="dv-user-role">super_admin</div>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function topbarHtml() {
  return `
    <header class="dv-topbar">
      <div class="dv-search">
        <span class="dv-search-icon">${ICONS.search}</span>
        <input type="text" placeholder="Buscar NF, cliente, valor…" />
        <span class="dv-search-kbd">⌘ K</span>
      </div>
      <div class="dv-topbar-actions">
        <button class="dv-icon-btn" title="Notificações">
          ${ICONS.bell}<span class="dv-icon-btn-dot"></span>
        </button>
        <button class="dv-btn dv-btn--primary">
          ${ICONS.plus} Novo lançamento
        </button>
      </div>
    </header>
  `;
}

function pageHeaderHtml() {
  return `
    <div class="dv-page-header">
      <div>
        <h1 class="dv-page-title">Painel de hoje</h1>
        <p class="dv-page-sub">Quinta-feira, 7 de maio · Caixa aberto às 08:32 por Juliana P.</p>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="dv-btn dv-btn--ghost">${ICONS.filter} Filtros</button>
        <button class="dv-btn dv-btn--ghost">Exportar</button>
      </div>
    </div>
  `;
}

function kpiCard({ icon, label, valor, delta, sub, tipo = 'flat' }) {
  return `
    <div class="dv-kpi">
      <div class="dv-kpi-label">
        <span class="dv-kpi-icon">${icon}</span> ${label}
      </div>
      <div class="dv-kpi-value">${valor}</div>
      <div class="dv-kpi-delta dv-kpi-delta--${tipo}">
        ${tipo === 'up' ? ICONS.trendUp : tipo === 'down' ? ICONS.trendDown : ''}
        ${delta}
        <span class="dv-kpi-delta-base">${sub}</span>
      </div>
    </div>
  `;
}

function kpisHtml() {
  return `
    <div class="dv-kpis">
      ${kpiCard({ icon: ICONS.dollar, label: 'Recebido hoje',     valor: 'R$ 12.043,70', delta: '+18,2%', sub: 'vs ontem',  tipo: 'up' })}
      ${kpiCard({ icon: ICONS.list,   label: 'Lançamentos',       valor: '32',           delta: '+4',     sub: 'novos',     tipo: 'up' })}
      ${kpiCard({ icon: ICONS.clock,  label: 'Pendentes',         valor: '7',            delta: '−2',     sub: 'desde ontem', tipo: 'down' })}
      ${kpiCard({ icon: ICONS.pkg,    label: 'Aguardando retirada', valor: '4',         delta: '+1',     sub: 'na semana', tipo: 'flat' })}
    </div>
  `;
}

function toolbarHtml() {
  return `
    <div class="dv-toolbar">
      <button class="dv-chip" aria-pressed="true">Todos <span style="color:var(--dv-ink-4)">·</span> 32</button>
      <button class="dv-chip">Pendentes <span style="color:var(--dv-ink-4)">·</span> 7</button>
      <button class="dv-chip">Finalizados <span style="color:var(--dv-ink-4)">·</span> 21</button>
      <button class="dv-chip">Aguardando <span style="color:var(--dv-ink-4)">·</span> 3</button>
      <button class="dv-chip">Cancelados <span style="color:var(--dv-ink-4)">·</span> 1</button>
      <div class="dv-toolbar-spacer"></div>
      <button class="dv-chip">Ordenar por hora ${ICONS.arrowDown}</button>
    </div>
  `;
}

function pillFor(tipo, texto) {
  return `<span class="dv-pill dv-pill--${tipo}">${texto}</span>`;
}

function tableHtml() {
  return `
    <div class="dv-table-wrap">
      <table class="dv-table" role="table">
        <thead>
          <tr>
            <th>NF</th>
            <th>Cliente</th>
            <th>Categoria</th>
            <th>Status</th>
            <th>Hora</th>
            <th style="text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody id="dv-tbody">
          ${LANCAMENTOS_MOCK.map((l, i) => `
            <tr data-row="${l.id}" ${i === 4 ? 'aria-selected="true"' : ''}>
              <td><span class="dv-cell-mono">${l.nf}</span></td>
              <td class="dv-cell-strong">${l.cliente}</td>
              <td>${l.categoria}</td>
              <td>${pillFor(l.pill, l.estado)}</td>
              <td class="dv-cell-muted">${l.hora}</td>
              <td style="text-align:right" class="dv-cell-mono">${l.valor}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function detailHtml() {
  return `
    <aside class="dv-detail" aria-label="Detalhes do lançamento">
      <div class="dv-detail-header">
        <div>
          <h3 class="dv-detail-title">NF 015427</h3>
          <p class="dv-detail-sub">Juliana Pereira · 11:12 de hoje</p>
        </div>
        ${pillFor('warn', 'Aguardando retirada')}
      </div>

      <ul class="dv-kv-list">
        <li class="dv-kv">
          <span class="dv-kv-k">Valor</span>
          <span class="dv-kv-v">R$ 1.890,00</span>
        </li>
        <li class="dv-kv">
          <span class="dv-kv-k">Categoria</span>
          <span class="dv-kv-v">Disponível p/ retirada</span>
        </li>
        <li class="dv-kv">
          <span class="dv-kv-k">Pedido</span>
          <span class="dv-kv-v">#48201</span>
        </li>
        <li class="dv-kv">
          <span class="dv-kv-k">Previsão</span>
          <span class="dv-kv-v">10/05/2026</span>
        </li>
        <li class="dv-kv">
          <span class="dv-kv-k">Lançado por</span>
          <span class="dv-kv-v">Ana B.</span>
        </li>
      </ul>

      <div class="dv-note">
        <strong>Aguardando o cliente.</strong> Cliente foi avisada por
        WhatsApp em 07/05. Prazo final 14/05 antes de virar pendência.
      </div>

      <div class="dv-detail-actions">
        <button class="dv-btn dv-btn--ghost" style="flex:1">Editar</button>
        <button class="dv-btn dv-btn--primary" style="flex:1">Marcar retirada</button>
      </div>
    </aside>
  `;
}

function ligarInteracoes() {
  // Nav toggle de "aria-current"
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('[data-nav]').forEach(x => x.removeAttribute('aria-current'));
      el.setAttribute('aria-current', 'page');
    });
  });

  // Chips de filtro toggle
  document.querySelectorAll('.dv-chip').forEach(c => {
    c.addEventListener('click', () => {
      // Só na primeira linha de chips (não inclui o "Ordenar por")
      if (c.textContent.includes('Ordenar')) return;
      document.querySelectorAll('.dv-chip').forEach(x => {
        if (!x.textContent.includes('Ordenar')) x.removeAttribute('aria-pressed');
      });
      c.setAttribute('aria-pressed', 'true');
    });
  });

  // Linha da tabela seleciona
  document.querySelectorAll('[data-row]').forEach(r => {
    r.addEventListener('click', () => {
      document.querySelectorAll('[data-row]').forEach(x => x.removeAttribute('aria-selected'));
      r.setAttribute('aria-selected', 'true');
    });
  });
}
