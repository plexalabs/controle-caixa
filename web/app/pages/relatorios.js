// relatorios.js — Os números do período (refator v2 "Clean Profissional").
//
// Bloco de filtros (período + categorias + estados), preview paginado
// (50/página, sortable, paginação numerada) e exportação:
//   • Excel (.xlsx formatado, via exceljs — carregado sob demanda)
//   • PDF   (jsPDF + autotable — carregado sob demanda)
//
// Ambos os arquivos são montados a partir do MESMO recorte exibido na
// tela (dadosOrdenados()), com a identidade visual do sistema.
//
// Estado dos filtros sincronizado com a URL — recarregar preserva.
// Acesso: permissão relatorio.diario.

import { supabase, pegarSessao } from '../supabase.js';
import { log } from '../log.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';

const CATEGORIAS = [
  { v: 'cartao',      rotulo: 'Cartão' },
  { v: 'pix',         rotulo: 'Pix' },
  { v: 'dinheiro',    rotulo: 'Dinheiro' },
  { v: 'cancelado',   rotulo: 'Cancelado' },
  { v: 'cartao_link', rotulo: 'Link de cartão' },
  { v: 'obs',         rotulo: 'Observação' },
];
const ESTADOS = [
  { v: 'pendente',      rotulo: 'Pendente' },
  { v: 'completo',      rotulo: 'Completo' },
  { v: 'finalizado',    rotulo: 'Finalizado' },
  { v: 'cancelado_pos', rotulo: 'Cancelado pós' },
  { v: 'cancelado',     rotulo: 'Cancelado' },
  { v: 'resolvido',     rotulo: 'Resolvido' },
];

// Cores canônicas das categorias (docs/01 §6) — usadas pra tingir as
// células de categoria no PDF e no Excel. Hex sem '#'.
const CAT_COR = {
  cartao:              { bg: 'DBEAFE', txt: '1E3A8A' },
  pix:                 { bg: 'CCFBF1', txt: '134E4A' },
  dinheiro:            { bg: 'DCFCE7', txt: '14532D' },
  cancelado:           { bg: 'FECACA', txt: '7F1D1D' },
  cartao_link:         { bg: 'EDE9FE', txt: '4C1D95' },
  obs:                 { bg: 'FEF3C7', txt: '78350F' },
  disponivel_retirada: { bg: 'F5E1CB', txt: '5C3D1F' },
};
// Paleta v2 pro PDF (RGB).
const PDF = {
  ink:    [40, 62, 6],
  accent: [21, 128, 61],
  ink2:   [63, 63, 70],
  ink3:   [113, 113, 122],
  border: [229, 226, 217],
  surf2:  [244, 244, 239],
  warn:   [180, 83, 9],
  danger: [185, 28, 28],
};

const TAMANHO_PAGINA = 50;
const LIMITE_AVISO_AMPLO = 5000;

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_XLS  = `<svg ${SVG}><rect x="2.3" y="2.3" width="11.4" height="11.4" rx="1.6"/><path d="M2.3 6.6h11.4M2.3 10h11.4M6.6 2.3v11.4"/></svg>`;
const ICON_PDF  = `<svg ${SVG}><path d="M9 1.7H4.6a1 1 0 0 0-1 1v10.6a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V5.2Z"/><path d="M9 1.7v3.5h3.4"/><path d="M6 8.6h4M6 11h2.6"/></svg>`;
const ICON_GRAF = `<svg ${SVG}><path d="M2 13.6h12"/><path d="M4.4 13.6V8M8 13.6V3.4M11.6 13.6V9.4"/></svg>`;

let estado = { inicio: '', fim: '', categorias: [], estados: [] };
let dadosBruto = [];
let pagina = 1;
let ord = { coluna: 'data', dir: 'asc' };

export async function renderRelatorios() {
  await carregarPermissoes();
  if (!temPermissaoSync('relatorio.diario')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'relatorios',
      conteudo: `
        <main class="rlt">
          <div class="rlt-restrito">
            <p class="rlt-restrito-title">Acesso restrito</p>
            <p class="rlt-restrito-msg">Você não tem permissão para ver os relatórios do período.</p>
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  estado = lerEstadoDaURL();

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'relatorios',
    conteudo: `
    <main id="main" class="rlt">
      <header class="rlt-header">
        <p class="rlt-eyebrow">Auditoria · Contação</p>
        <h1 class="rlt-title">Os números do período</h1>
        <p class="rlt-sub">
          Filtre por data, categoria e estado. Veja os totais e baixe em
          Excel ou PDF — usando exatamente o recorte que está na tela.
        </p>
      </header>

      <section id="rlt-filtros-wrap">${blocoFiltros()}</section>

      <section id="rlt-resultado" class="rlt-resultado" hidden>
        <div id="rlt-aviso" class="rlt-aviso" hidden></div>
        <div id="rlt-resumo"></div>
        <div id="rlt-tabela-wrap"></div>
        <div id="rlt-export"></div>
      </section>

      <section id="rlt-vazio" hidden>
        <div class="rlt-vazio">
          <div class="rlt-vazio-icone" aria-hidden="true">${ICON_GRAF}</div>
          <p class="rlt-vazio-title">Sem lançamentos no período.</p>
          <p class="rlt-vazio-msg">Ajuste as datas ou afrouxe os filtros de categoria e estado.</p>
        </div>
      </section>
    </main>
  `,
  });

  ligarShell();
  ligarFiltros();
  if (estado.inicio && estado.fim) await aplicarFiltros();
}

// ─── Bloco de filtros ──────────────────────────────────────────────
function blocoFiltros() {
  const hoje = new Date();
  const ini = estado.inicio || iso(primDiaMes(hoje));
  const fim = estado.fim    || iso(ultDiaMes(hoje));

  return `
    <div class="rlt-filtros">
      <div class="rlt-linha">
        <p class="rlt-linha-titulo">Período</p>
        <div class="rlt-periodo">
          <label class="rlt-campo">
            <span class="rlt-campo-label">De</span>
            <input id="rlt-inicio" type="date" class="rlt-data" value="${esc(ini)}">
          </label>
          <label class="rlt-campo">
            <span class="rlt-campo-label">Até</span>
            <input id="rlt-fim" type="date" class="rlt-data" value="${esc(fim)}">
          </label>
          <div class="rlt-quick">
            <button type="button" class="rlt-quick-btn" data-quick="mes-atual">Mês atual</button>
            <button type="button" class="rlt-quick-btn" data-quick="mes-passado">Mês passado</button>
            <button type="button" class="rlt-quick-btn" data-quick="trimestre">Trimestre</button>
            <button type="button" class="rlt-quick-btn" data-quick="ano">Ano</button>
          </div>
        </div>
      </div>

      <div class="rlt-linha">
        <p class="rlt-linha-titulo">Categorias</p>
        <div class="rlt-pills" id="rlt-categorias">
          ${CATEGORIAS.map(c => pillCheck('cat', c.v, c.rotulo, estado.categorias.includes(c.v))).join('')}
        </div>
      </div>

      <div class="rlt-linha">
        <p class="rlt-linha-titulo">Estados</p>
        <div class="rlt-pills" id="rlt-estados">
          ${ESTADOS.map(s => pillCheck('est', s.v, s.rotulo, estado.estados.includes(s.v))).join('')}
        </div>
      </div>

      <div class="rlt-filtros-acoes">
        <button type="button" id="rlt-limpar" class="rlt-btn rlt-btn--link">Limpar</button>
        <button type="button" id="rlt-aplicar" class="rlt-btn rlt-btn--primary">Aplicar filtros</button>
      </div>
    </div>`;
}

function pillCheck(grupo, v, rotulo, marcado) {
  return `
    <label class="rlt-pill ${marcado ? 'is-ativo' : ''}">
      <input type="checkbox" name="${grupo}" value="${esc(v)}" ${marcado ? 'checked' : ''}>
      <span class="rlt-pill-marca" aria-hidden="true"></span>
      <span>${esc(rotulo)}</span>
    </label>`;
}

function ligarFiltros() {
  document.querySelector('#rlt-aplicar').addEventListener('click', aplicarFiltros);
  document.querySelector('#rlt-limpar').addEventListener('click', limparFiltros);
  document.querySelectorAll('[data-quick]').forEach(b => {
    b.addEventListener('click', () => aplicarQuick(b.dataset.quick));
  });
  document.querySelectorAll('.rlt-pill input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      e.target.closest('.rlt-pill')?.classList.toggle('is-ativo', e.target.checked);
    });
  });
}

function aplicarQuick(q) {
  const hoje = new Date();
  let ini, fim;
  if (q === 'mes-atual') {
    ini = primDiaMes(hoje); fim = ultDiaMes(hoje);
  } else if (q === 'mes-passado') {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    ini = primDiaMes(d); fim = ultDiaMes(d);
  } else if (q === 'trimestre') {
    const tri = Math.floor(hoje.getMonth() / 3);
    ini = new Date(hoje.getFullYear(), tri * 3, 1);
    fim = new Date(hoje.getFullYear(), tri * 3 + 3, 0);
  } else if (q === 'ano') {
    ini = new Date(hoje.getFullYear(), 0, 1);
    fim = new Date(hoje.getFullYear(), 11, 31);
  }
  document.querySelector('#rlt-inicio').value = iso(ini);
  document.querySelector('#rlt-fim').value    = iso(fim);
  document.querySelectorAll('[data-quick]').forEach(b =>
    b.classList.toggle('is-ativo', b.dataset.quick === q));
}

function limparFiltros() {
  document.querySelector('#rlt-filtros-wrap').innerHTML = blocoFiltros();
  ligarFiltros();
  estado = { inicio: '', fim: '', categorias: [], estados: [] };
  dadosBruto = [];
  document.querySelector('#rlt-resultado').hidden = true;
  document.querySelector('#rlt-vazio').hidden = true;
  history.replaceState({}, '', '/relatorios');
}

async function aplicarFiltros() {
  const ini  = document.querySelector('#rlt-inicio').value;
  const fim  = document.querySelector('#rlt-fim').value;
  const cats = [...document.querySelectorAll('input[name="cat"]:checked')].map(i => i.value);
  const ests = [...document.querySelectorAll('input[name="est"]:checked')].map(i => i.value);

  if (!ini || !fim) {
    mostrarToast('Selecione data início e fim.', 'erro', 3000);
    return;
  }
  if (fim < ini) {
    mostrarToast('Data fim deve ser maior ou igual à inicial.', 'erro', 3000);
    return;
  }

  estado = { inicio: ini, fim, categorias: cats, estados: ests };
  gravarEstadoNaURL();
  pagina = 1;

  const btn = document.querySelector('#rlt-aplicar');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  const { data, error } = await supabase.rpc('gerar_relatorio_periodo', {
    p_data_inicio: ini,
    p_data_fim:    fim,
    p_categorias:  cats.length ? cats : null,
    p_estados:     ests.length ? ests : null,
  });

  btn.removeAttribute('aria-busy');
  btn.disabled = false;

  if (error) {
    mostrarToast('Erro ao consultar: ' + error.message, 'erro', 5000);
    return;
  }

  dadosBruto = data || [];
  renderResultado();
}

// ─── Resultado ──────────────────────────────────────────────────────
function renderResultado() {
  const wrap  = document.querySelector('#rlt-resultado');
  const vazio = document.querySelector('#rlt-vazio');
  const aviso = document.querySelector('#rlt-aviso');

  if (dadosBruto.length === 0) {
    wrap.hidden = true;
    vazio.hidden = false;
    return;
  }
  wrap.hidden = false;
  vazio.hidden = true;

  if (dadosBruto.length > LIMITE_AVISO_AMPLO) {
    aviso.hidden = false;
    aviso.innerHTML =
      `<strong>Período muito amplo</strong> — ${dadosBruto.length.toLocaleString('pt-BR')} lançamentos. ` +
      `Considere reduzir o intervalo. A exportação ainda funciona, mas pode levar alguns segundos.`;
  } else {
    aviso.hidden = true;
  }

  renderResumo();
  renderTabela();
  renderExport();
}

function renderResumo() {
  const total = dadosBruto.length;
  const valBruto = dadosBruto.reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const valFinalizado = dadosBruto.filter(l => l.estado === 'finalizado')
    .reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const valCancelado = dadosBruto.filter(l => l.estado === 'cancelado' || l.estado === 'cancelado_pos')
    .reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const valLiquido = valBruto - valCancelado;

  document.querySelector('#rlt-resumo').innerHTML = `
    <div class="rlt-stats">
      <div class="rlt-stat">
        <span class="rlt-stat-rotulo">Lançamentos</span>
        <span class="rlt-stat-valor">${total.toLocaleString('pt-BR')}</span>
      </div>
      <div class="rlt-stat">
        <span class="rlt-stat-rotulo">Valor bruto</span>
        <span class="rlt-stat-valor">${formatarMoeda(valBruto)}</span>
      </div>
      <div class="rlt-stat" data-tom="accent">
        <span class="rlt-stat-rotulo">Líquido</span>
        <span class="rlt-stat-valor rlt-stat-valor--accent">${formatarMoeda(valLiquido)}</span>
      </div>
      <div class="rlt-stat" data-tom="warn">
        <span class="rlt-stat-rotulo">Finalizado</span>
        <span class="rlt-stat-valor rlt-stat-valor--warn">${formatarMoeda(valFinalizado)}</span>
      </div>
      <div class="rlt-stat" data-tom="danger">
        <span class="rlt-stat-rotulo">Cancelado</span>
        <span class="rlt-stat-valor rlt-stat-valor--danger">${formatarMoeda(valCancelado)}</span>
      </div>
    </div>`;
}

function renderTabela() {
  const arr = dadosOrdenados();
  const total = arr.length;
  const totalPgs = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  if (pagina > totalPgs) pagina = totalPgs;

  const ini = (pagina - 1) * TAMANHO_PAGINA;
  const fatia = arr.slice(ini, ini + TAMANHO_PAGINA);

  document.querySelector('#rlt-tabela-wrap').innerHTML = `
    <div class="rlt-tabela-card">
      <div class="rlt-tabela-scroll">
        <table class="rlt-tabela">
          <thead>
            <tr>
              ${cabec('data', 'Data')}
              ${cabec('numero_nf', 'NF')}
              ${cabec('cliente_nome', 'Cliente')}
              ${cabec('valor_nf', 'Valor', 'is-num')}
              ${cabec('categoria', 'Categoria')}
              ${cabec('estado', 'Estado')}
              <th>Detalhes</th>
              <th class="is-num">Obs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${fatia.map(linhaTr).join('')}</tbody>
        </table>
      </div>
      <div class="rlt-pag">
        <span class="rlt-pag-info">
          <strong>${total.toLocaleString('pt-BR')}</strong> ${total === 1 ? 'linha' : 'linhas'}
          · página <strong>${pagina}</strong> de <strong>${totalPgs}</strong>
        </span>
        <div class="rlt-pag-nums">${paginacaoHtml(pagina, totalPgs)}</div>
      </div>
    </div>`;

  document.querySelectorAll('.rlt-tabela th[data-sortable]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (ord.coluna === col) ord.dir = ord.dir === 'asc' ? 'desc' : 'asc';
      else { ord.coluna = col; ord.dir = 'asc'; }
      renderTabela();
    });
  });
  document.querySelectorAll('#rlt-tabela-wrap [data-pg]').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset.pg;
      if (v === 'prev')      mudarPagina(pagina - 1);
      else if (v === 'next') mudarPagina(pagina + 1);
      else                   mudarPagina(parseInt(v, 10));
    });
  });
}

function mudarPagina(n) {
  const totalPgs = Math.max(1, Math.ceil(dadosOrdenados().length / TAMANHO_PAGINA));
  const alvo = Math.min(totalPgs, Math.max(1, n || 1));
  if (alvo === pagina) return;
  pagina = alvo;
  renderTabela();
  document.querySelector('#rlt-tabela-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Paginação numerada estilo Google: 1ª, última, atual ± 1, "…" nos vãos.
function listaPaginas(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, atual, atual - 1, atual + 1]);
  const arr = [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of arr) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function paginacaoHtml(atual, total) {
  if (total <= 1) return '';
  const nums = listaPaginas(atual, total).map(p =>
    p === '…'
      ? '<span class="rlt-pag-ell" aria-hidden="true">…</span>'
      : `<button type="button" class="rlt-pag-num${p === atual ? ' is-atual' : ''}" data-pg="${p}"
           ${p === atual ? 'aria-current="page"' : ''}>${p}</button>`
  ).join('');
  return `
    <button type="button" class="rlt-pag-seta" data-pg="prev" ${atual <= 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>
    ${nums}
    <button type="button" class="rlt-pag-seta" data-pg="next" ${atual >= total ? 'disabled' : ''} aria-label="Próxima">›</button>`;
}

function cabec(col, rotulo, extra = '') {
  const sortAttr = ord.coluna === col ? `data-sort="${ord.dir}"` : '';
  return `<th data-sortable="true" data-col="${col}" class="${extra}" ${sortAttr}>${rotulo}</th>`;
}

function linhaTr(l) {
  const valF = formatarMoeda(Number(l.valor_nf || 0));
  return `
    <tr>
      <td class="rlt-td-data">${esc(formatarDataPt(l.data))}</td>
      <td class="rlt-td-nf">${esc(l.numero_nf || '—')}</td>
      <td class="rlt-td-cliente">${esc(l.cliente_nome || '—')}</td>
      <td class="is-num rlt-td-valor">${esc(valF)}</td>
      <td><span class="rlt-cat" data-cat="${esc(l.categoria || '')}">${esc(rotuloCategoria(l.categoria))}</span></td>
      <td class="rlt-estado">${esc(rotuloEstado(l.estado))}</td>
      <td class="rlt-td-detalhe">${esc(l.resumo_dados || '')}</td>
      <td class="is-num">${l.observacoes_qtd > 0 ? l.observacoes_qtd : ''}</td>
      <td class="rlt-td-link"><a href="/lancamento/${esc(l.lancamento_id)}" data-link>Abrir</a></td>
    </tr>`;
}

function dadosOrdenados() {
  const arr = [...dadosBruto];
  const c = ord.coluna;
  arr.sort((a, b) => {
    let va = a[c]; let vb = b[c];
    if (c === 'valor_nf') { va = Number(va || 0); vb = Number(vb || 0); }
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (va < vb) return ord.dir === 'asc' ? -1 : 1;
    if (va > vb) return ord.dir === 'asc' ? 1 : -1;
    return 0;
  });
  return arr;
}

// ─── Totais (compartilhado por resumo, PDF e Excel) ──────────────────
function calcularTotais(arr) {
  const bruto = arr.reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const finalizado = arr.filter(l => l.estado === 'finalizado')
    .reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const cancelado = arr.filter(l => l.estado === 'cancelado' || l.estado === 'cancelado_pos')
    .reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  return { total: arr.length, bruto, finalizado, cancelado, liquido: bruto - cancelado };
}

function renderExport() {
  document.querySelector('#rlt-export').innerHTML = `
    <div class="rlt-export">
      <p class="rlt-export-texto">
        Os arquivos seguem <strong>exatamente o recorte e a ordenação</strong> da
        tabela acima. O Excel sai formatado, com totais; o PDF é arquivável.
      </p>
      <div class="rlt-export-acoes">
        <button type="button" id="rlt-xls" class="rlt-btn rlt-btn--primary">${ICON_XLS} Baixar Excel</button>
        <button type="button" id="rlt-pdf" class="rlt-btn rlt-btn--escuro">${ICON_PDF} Baixar PDF</button>
      </div>
    </div>`;

  document.querySelector('#rlt-xls').addEventListener('click', baixarExcel);
  document.querySelector('#rlt-pdf').addEventListener('click', baixarPDF);
}

async function infoGeracao() {
  const sessao = await pegarSessao();
  const meta = sessao?.user?.user_metadata ?? {};
  const autor = [meta.nome, meta.sobrenome].filter(Boolean).join(' ').trim()
             || sessao?.user?.email || '—';
  const quando = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  return { autor, quando };
}

function textoFiltros() {
  const partes = [];
  if (estado.categorias.length) partes.push('Categorias: ' + estado.categorias.map(rotuloCategoria).join(', '));
  if (estado.estados.length)    partes.push('Estados: ' + estado.estados.map(rotuloEstado).join(', '));
  return partes.length ? partes.join('   ·   ') : 'Sem filtros adicionais de categoria ou estado';
}

// ─── Excel (.xlsx via exceljs) ──────────────────────────────────────
async function baixarExcel() {
  const btn = document.querySelector('#rlt-xls');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  try {
    const ExcelMod = await import('exceljs');
    const ExcelJS = ExcelMod.default || ExcelMod;
    const arr = dadosOrdenados();
    const { autor, quando } = await infoGeracao();
    const tot = calcularTotais(arr);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Caixa Boti';
    wb.created = new Date();
    const ws = wb.addWorksheet('Relatório', {
      views: [{ state: 'frozen', ySplit: 7 }],
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });

    const MUSGO   = 'FF283E06';
    const SURF2   = 'FFF4F4EF';
    const ZEBRA   = 'FFFAFAF7';
    const BORDA   = 'FFE5E2D9';
    const INK     = 'FF283E06';
    const INK3    = 'FF71717A';
    const bordaFina = {
      top:    { style: 'thin', color: { argb: BORDA } },
      bottom: { style: 'thin', color: { argb: BORDA } },
      left:   { style: 'thin', color: { argb: BORDA } },
      right:  { style: 'thin', color: { argb: BORDA } },
    };

    ws.columns = [
      { width: 12 }, { width: 14 }, { width: 30 }, { width: 16 },
      { width: 17 }, { width: 15 }, { width: 40 }, { width: 8 },
    ];

    // Cabeçalho da marca (linhas 1–5, mescladas A:H)
    const faixa = (lin, txt, estilo) => {
      ws.mergeCells(`A${lin}:H${lin}`);
      const c = ws.getCell(`A${lin}`);
      c.value = txt;
      Object.assign(c, estilo);
    };
    faixa(1, 'CAIXA BOTI', { font: { name: 'Calibri', bold: true, size: 16, color: { argb: MUSGO } } });
    faixa(2, 'Relatório do período', { font: { name: 'Calibri', bold: true, size: 12, color: { argb: INK } } });
    faixa(3, `${formatarDataPt(estado.inicio)}  até  ${formatarDataPt(estado.fim)}`,
          { font: { name: 'Calibri', size: 10, color: { argb: INK3 } } });
    faixa(4, textoFiltros(), { font: { name: 'Calibri', size: 9, color: { argb: INK3 } } });
    faixa(5, `Gerado em ${quando} por ${autor}`, { font: { name: 'Calibri', italic: true, size: 9, color: { argb: INK3 } } });
    ws.getRow(1).height = 22;

    // Cabeçalho da tabela (linha 7)
    const COLS = ['Data', 'NF', 'Cliente', 'Valor (R$)', 'Categoria', 'Estado', 'Detalhes', 'Obs'];
    const hdr = ws.getRow(7);
    COLS.forEach((t, i) => {
      const c = hdr.getCell(i + 1);
      c.value = t;
      c.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } };
      c.alignment = { vertical: 'middle', horizontal: i === 3 || i === 7 ? 'right' : 'left' };
      c.border = bordaFina;
    });
    hdr.height = 20;

    // Linhas de dados
    arr.forEach((l, idx) => {
      const lin = 8 + idx;
      const row = ws.getRow(lin);
      row.getCell(1).value = formatarDataPt(l.data);
      row.getCell(2).value = l.numero_nf || '—';
      row.getCell(3).value = l.cliente_nome || '—';
      row.getCell(4).value = Number(l.valor_nf || 0);
      row.getCell(4).numFmt = '"R$" #,##0.00';
      row.getCell(5).value = rotuloCategoria(l.categoria);
      row.getCell(6).value = rotuloEstado(l.estado);
      row.getCell(7).value = l.resumo_dados || '';
      row.getCell(8).value = l.observacoes_qtd > 0 ? l.observacoes_qtd : '';

      for (let ci = 1; ci <= 8; ci++) {
        const c = row.getCell(ci);
        c.border = bordaFina;
        c.font = { name: 'Calibri', size: 10, color: { argb: INK } };
        c.alignment = { vertical: 'middle', horizontal: ci === 4 || ci === 8 ? 'right' : 'left',
                        wrapText: ci === 7 };
        if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
      // Célula de categoria tingida na cor canônica
      const cor = CAT_COR[l.categoria];
      if (cor) {
        const cc = row.getCell(5);
        cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + cor.bg } };
        cc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF' + cor.txt } };
      }
    });

    // Bloco de totais
    const linT = 8 + arr.length + 1;
    const tituloT = ws.getCell(`A${linT}`);
    tituloT.value = 'TOTAIS DO PERÍODO';
    tituloT.font = { name: 'Calibri', bold: true, size: 10, color: { argb: MUSGO } };
    const totais = [
      ['Lançamentos', tot.total],
      ['Valor bruto', tot.bruto],
      ['Líquido (sem cancelados)', tot.liquido],
      ['Finalizado', tot.finalizado],
      ['Cancelado', tot.cancelado],
    ];
    totais.forEach(([rot, val], i) => {
      const lin = linT + 1 + i;
      const cr = ws.getCell(`A${lin}`);
      const cv = ws.getCell(`B${lin}`);
      cr.value = rot;
      cr.font = { name: 'Calibri', size: 10, color: { argb: INK3 } };
      cv.value = val;
      if (i !== 0) cv.numFmt = '"R$" #,##0.00';
      cv.font = { name: 'Calibri', bold: true, size: 10, color: { argb: INK } };
      cr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURF2 } };
      cv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURF2 } };
    });

    const buf = await wb.xlsx.writeBuffer();
    baixar(new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), nomeArquivo('xlsx'));
    mostrarToast('Excel baixado.', 'ok', 2200);
  } catch (e) {
    log.erro('falha ao gerar Excel do relatório', e, { periodo: estado });
    mostrarToast('Erro ao gerar Excel: ' + (e.message || e), 'erro', 5000);
  } finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

// ─── PDF (jsPDF + autotable) ────────────────────────────────────────
async function baixarPDF() {
  const btn = document.querySelector('#rlt-pdf');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  try {
    const [{ jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

    const arr = dadosOrdenados();
    const tot = calcularTotais(arr);
    const { autor, quando } = await infoGeracao();

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const larg = doc.internal.pageSize.getWidth();
    const alt  = doc.internal.pageSize.getHeight();
    const M = 40;

    // Faixa de marca no topo
    doc.setFillColor(...PDF.ink);
    doc.rect(0, 0, larg, 5, 'F');

    // Wordmark + título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF.ink);
    doc.text('CAIXA BOTI', M, 44);
    doc.setFontSize(17);
    doc.text('Relatório do período', M, 70);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...PDF.ink2);
    doc.text(`${formatarDataPt(estado.inicio)}  até  ${formatarDataPt(estado.fim)}`, M, 87);

    doc.setFontSize(8);
    doc.setTextColor(...PDF.ink3);
    doc.text(textoFiltros(), M, 101);
    doc.text(`Gerado em ${quando} por ${autor}`, larg - M, 44, { align: 'right' });

    // Faixa de totais
    const bandY = 114;
    const bandH = 50;
    const bandW = larg - M * 2;
    doc.setFillColor(...PDF.surf2);
    doc.roundedRect(M, bandY, bandW, bandH, 5, 5, 'F');
    const segs = [
      ['LANÇAMENTOS', tot.total.toLocaleString('pt-BR'), PDF.ink],
      ['VALOR BRUTO', formatarMoeda(tot.bruto), PDF.ink],
      ['LÍQUIDO', formatarMoeda(tot.liquido), PDF.accent],
      ['FINALIZADO', formatarMoeda(tot.finalizado), PDF.warn],
      ['CANCELADO', formatarMoeda(tot.cancelado), PDF.danger],
    ];
    const segW = bandW / segs.length;
    segs.forEach(([rot, val, cor], i) => {
      const x = M + i * segW;
      if (i > 0) {
        doc.setDrawColor(...PDF.border);
        doc.setLineWidth(0.6);
        doc.line(x, bandY + 10, x, bandY + bandH - 10);
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...PDF.ink3);
      doc.text(rot, x + 12, bandY + 19);
      doc.setFontSize(11);
      doc.setTextColor(...cor);
      doc.text(String(val), x + 12, bandY + 37);
    });

    // Tabela
    const yInicial = bandY + bandH + 16;
    autoTable(doc, {
      startY: yInicial,
      head: [['Data', 'NF', 'Cliente', 'Valor', 'Categoria', 'Estado', 'Detalhes', 'Obs']],
      body: arr.map(l => [
        formatarDataPt(l.data),
        l.numero_nf || '—',
        l.cliente_nome || '—',
        formatarMoeda(Number(l.valor_nf || 0)),
        rotuloCategoria(l.categoria),
        rotuloEstado(l.estado),
        l.resumo_dados || '',
        l.observacoes_qtd > 0 ? String(l.observacoes_qtd) : '',
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 4.5, bottom: 4.5, left: 6, right: 6 },
        textColor: PDF.ink2,
        lineColor: PDF.border,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: PDF.surf2,
        textColor: PDF.ink,
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [250, 250, 247] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 54 },
        3: { cellWidth: 60, halign: 'right', fontStyle: 'bold', textColor: PDF.ink },
        7: { cellWidth: 28, halign: 'right' },
      },
      margin: { left: M, right: M, bottom: 56 },
      // Tinge a célula de categoria com a cor canônica.
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const l = arr[data.row.index];
          const cor = l && CAT_COR[l.categoria];
          if (cor) {
            data.cell.styles.fillColor = hexRgb(cor.bg);
            data.cell.styles.textColor = hexRgb(cor.txt);
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    // Rodapé em todas as páginas
    const totalPgs = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPgs; p++) {
      doc.setPage(p);
      doc.setDrawColor(...PDF.border);
      doc.setLineWidth(0.6);
      doc.line(M, alt - 40, larg - M, alt - 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF.ink3);
      doc.text('Caixa Boti · auditoria de caixa', M, alt - 27);
      doc.text(`Página ${p} de ${totalPgs}`, larg - M, alt - 27, { align: 'right' });
    }

    doc.save(nomeArquivo('pdf'));
    mostrarToast('PDF baixado.', 'ok', 2200);
  } catch (e) {
    log.erro('falha ao gerar PDF do relatório', e, { periodo: estado });
    mostrarToast('Erro ao gerar PDF: ' + (e.message || e), 'erro', 5000);
  } finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

// ─── URL state ──────────────────────────────────────────────────────
function lerEstadoDaURL() {
  const p = new URLSearchParams(location.search);
  return {
    inicio: p.get('ini') || '',
    fim:    p.get('fim') || '',
    categorias: p.getAll('cat'),
    estados:    p.getAll('est'),
  };
}
function gravarEstadoNaURL() {
  const p = new URLSearchParams();
  if (estado.inicio) p.set('ini', estado.inicio);
  if (estado.fim)    p.set('fim', estado.fim);
  estado.categorias.forEach(c => p.append('cat', c));
  estado.estados.forEach(e => p.append('est', e));
  const qs = p.toString();
  history.replaceState({}, '', '/relatorios' + (qs ? '?' + qs : ''));
}

// ─── Helpers ─────────────────────────────────────────────────────────
function rotuloCategoria(c) {
  return CATEGORIAS.find(x => x.v === c)?.rotulo || (c === 'em_analise' ? 'Em análise' : (c || '—'));
}
function rotuloEstado(s) {
  return ESTADOS.find(x => x.v === s)?.rotulo || s || '—';
}
function formatarMoeda(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}
function formatarDataPt(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}
function hexRgb(h) {
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function primDiaMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function ultDiaMes(d)  { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function nomeArquivo(ext) {
  const ini = estado.inicio || iso(new Date());
  const fim = estado.fim    || iso(new Date());
  return `caixa-boti_${ini}_a_${fim}.${ext}`;
}
function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
