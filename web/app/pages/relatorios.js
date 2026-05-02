// relatorios.js — Os números do período (CP7.4).
//
// Bloco de filtros (período + categorias + estados), preview paginado
// (50 por página, sortable), e exportação CSV (RPC) + PDF (jspdf no cliente).
//
// Estado dos filtros sincronizado com URL via URLSearchParams — recarregar
// preserva, e o link é bookmarkable.
//
// Acesso: admin OU operador (operador também precisa exportar pra contação).

import { supabase, pegarSessao } from '../supabase.js';
import { log } from '../log.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { pegarPapeis } from '../papeis.js';
import { instalarPopDatasEm } from '../../components/pop-data.js';

const CATEGORIAS = [
  { v: 'cartao',      rotulo: 'Cartão' },
  { v: 'pix',         rotulo: 'Pix' },
  { v: 'dinheiro',    rotulo: 'Dinheiro' },
  { v: 'cancelado',   rotulo: 'Cancelado' },
  { v: 'cartao_link', rotulo: 'Link de cartão' },
  { v: 'obs',         rotulo: 'Observação' },
];
const ESTADOS = [
  { v: 'pendente',       rotulo: 'Pendente' },
  { v: 'completo',       rotulo: 'Completo' },
  { v: 'finalizado',     rotulo: 'Finalizado' },
  { v: 'cancelado_pos',  rotulo: 'Cancelado pós' },
  { v: 'cancelado',      rotulo: 'Cancelado' },
  { v: 'resolvido',      rotulo: 'Resolvido' },
];
const TAMANHO_PAGINA = 50;
const LIMITE_AVISO_AMPLO = 5000;

let estado = {
  inicio: '',
  fim: '',
  categorias: [],
  estados: [],
};
let dadosBruto = [];
let pagina = 1;
let ord = { coluna: 'data', dir: 'asc' };

export async function renderRelatorios() {
  const papeis = await pegarPapeis();
  if (!papeis.includes('admin') && !papeis.includes('operador')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'relatorios',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <div class="alert mt-6">Acesso restrito.</div>
        </main>`,
    });
    ligarShell();
    return;
  }

  estado = lerEstadoDaURL();

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'relatorios',
    conteudo: `
    <main id="main" class="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <header class="tela-cabec reveal reveal-1" data-etiqueta="RELATÓRIOS">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Auditoria · Contação</p>
          <h1 class="tela-cabec-titulo">Os números do período.</h1>
          <p class="tela-cabec-sub">
            Filtre por data, categoria e estado. Veja os totais, baixe
            CSV pra Excel ou PDF pra arquivar — usando exatamente o
            recorte que você está vendo.
          </p>
        </div>
      </header>

      <section id="rel-filtros-wrap" class="reveal reveal-2">${blocoFiltros()}</section>

      <section id="rel-resultado" class="reveal reveal-3" hidden>
        <div id="rel-aviso-amplo" class="rel-aviso-amplo" hidden></div>
        <div id="rel-resumo"></div>
        <div id="rel-tabela-wrap"></div>
        <div id="rel-export"></div>
      </section>

      <section id="rel-vazio" class="reveal reveal-3" hidden>
        <div class="vazio">
          <div class="vazio-num">∅</div>
          <p class="vazio-titulo">Sem lançamentos no período.</p>
          <p class="vazio-desc">Ajuste as datas ou os filtros.</p>
        </div>
      </section>
    </main>
  `,
  });

  ligarShell();
  ligarFiltros();
  // Aplica automaticamente se URL veio com filtros
  if (estado.inicio && estado.fim) {
    await aplicarFiltros();
  }
}

// ─── Bloco de filtros ──────────────────────────────────────────────
function blocoFiltros() {
  const hoje = new Date();
  const ini = estado.inicio || iso(primDiaMes(hoje));
  const fim = estado.fim    || iso(ultDiaMes(hoje));

  return `
    <div class="rel-filtros">
      <!-- Linha 1: Período (datas + atalhos) -->
      <div class="rel-linha">
        <p class="rel-linha-titulo">Período</p>
        <div class="rel-periodo">
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="rel-inicio">De</label>
            <input id="rel-inicio" type="date" class="field-input" value="${esc(ini)}">
            <span class="field-underline"></span>
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="rel-fim">Até</label>
            <input id="rel-fim" type="date" class="field-input" value="${esc(fim)}">
            <span class="field-underline"></span>
          </div>
        </div>
        <div class="rel-filtros-quick">
          <button type="button" class="rel-quick-btn" data-quick="mes-atual">Mês atual</button>
          <button type="button" class="rel-quick-btn" data-quick="mes-passado">Mês passado</button>
          <button type="button" class="rel-quick-btn" data-quick="trimestre">Trimestre atual</button>
          <button type="button" class="rel-quick-btn" data-quick="ano">Ano atual</button>
        </div>
      </div>

      <!-- Linha 2: Categorias (full width, pílulas em wrap) -->
      <div class="rel-linha">
        <p class="rel-linha-titulo">Categorias</p>
        <div class="rel-checks" id="rel-categorias">
          ${CATEGORIAS.map(c => pillCheck('cat', c.v, c.rotulo, estado.categorias.includes(c.v))).join('')}
        </div>
      </div>

      <!-- Linha 3: Estados -->
      <div class="rel-linha">
        <p class="rel-linha-titulo">Estados</p>
        <div class="rel-checks" id="rel-estados">
          ${ESTADOS.map(s => pillCheck('est', s.v, s.rotulo, estado.estados.includes(s.v))).join('')}
        </div>
      </div>

      <!-- Rodapé: ações -->
      <div class="rel-filtros-acoes">
        <button type="button" id="rel-limpar" class="btn-link">Limpar</button>
        <button type="button" id="rel-aplicar" class="btn-primary">Aplicar filtros</button>
      </div>
    </div>`;
}

function pillCheck(grupo, v, rotulo, marcado) {
  return `
    <label class="rel-check-pill ${marcado ? 'is-ativo' : ''}" data-pill-grupo="${grupo}">
      <input type="checkbox" name="${grupo}" value="${esc(v)}" ${marcado ? 'checked' : ''}>
      <span class="rel-check-pill-marca" aria-hidden="true"></span>
      <span>${esc(rotulo)}</span>
    </label>`;
}

function ligarFiltros() {
  document.querySelector('#rel-aplicar').addEventListener('click', aplicarFiltros);
  document.querySelector('#rel-limpar').addEventListener('click', limparFiltros);
  document.querySelectorAll('[data-quick]').forEach(b => {
    b.addEventListener('click', () => aplicarQuick(b.dataset.quick));
  });
  // Marca pílulas visualmente quando muda
  document.querySelectorAll('.rel-check-pill input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      e.target.closest('.rel-check-pill')?.classList.toggle('is-ativo', e.target.checked);
    });
  });
  // Pop-data nos inputs date
  instalarPopDatasEm(document.querySelector('#rel-filtros-wrap'));
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
  document.querySelector('#rel-inicio').value = iso(ini);
  document.querySelector('#rel-fim').value    = iso(fim);
  // Realça quick ativo
  document.querySelectorAll('[data-quick]').forEach(b => b.classList.toggle('is-ativo', b.dataset.quick === q));
}

function limparFiltros() {
  document.querySelector('#rel-filtros-wrap').innerHTML = blocoFiltros();
  ligarFiltros();
  estado = { inicio: '', fim: '', categorias: [], estados: [] };
  dadosBruto = [];
  document.querySelector('#rel-resultado').hidden = true;
  document.querySelector('#rel-vazio').hidden = true;
  history.replaceState({}, '', '/relatorios');
}

async function aplicarFiltros() {
  const ini = document.querySelector('#rel-inicio').value;
  const fim = document.querySelector('#rel-fim').value;
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

  const btn = document.querySelector('#rel-aplicar');
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
  const wrap = document.querySelector('#rel-resultado');
  const vazio = document.querySelector('#rel-vazio');
  const aviso = document.querySelector('#rel-aviso-amplo');

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
      `Considere reduzir o intervalo ou aplicar filtros adicionais. ` +
      `A exportação ainda funciona, mas pode demorar alguns segundos.`;
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
  const valFinalizado = dadosBruto
    .filter(l => l.estado === 'finalizado')
    .reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const valCancelado = dadosBruto
    .filter(l => l.estado === 'cancelado' || l.estado === 'cancelado_pos')
    .reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const valLiquido = valBruto - valCancelado;

  document.querySelector('#rel-resumo').innerHTML = `
    <div class="rel-resumo">
      <div class="rel-resumo-card">
        <div class="rel-resumo-rotulo">Lançamentos</div>
        <div class="rel-resumo-valor">${total.toLocaleString('pt-BR')}</div>
      </div>
      <div class="rel-resumo-card">
        <div class="rel-resumo-rotulo">Valor bruto</div>
        <div class="rel-resumo-valor">${formatarMoeda(valBruto)}</div>
      </div>
      <div class="rel-resumo-card">
        <div class="rel-resumo-rotulo">Líquido (sem cancelados)</div>
        <div class="rel-resumo-valor rel-resumo-valor--musgo">${formatarMoeda(valLiquido)}</div>
      </div>
      <div class="rel-resumo-card">
        <div class="rel-resumo-rotulo">Finalizado</div>
        <div class="rel-resumo-valor rel-resumo-valor--ambar">${formatarMoeda(valFinalizado)}</div>
      </div>
      <div class="rel-resumo-card">
        <div class="rel-resumo-rotulo">Cancelado</div>
        <div class="rel-resumo-valor rel-resumo-valor--alerta">${formatarMoeda(valCancelado)}</div>
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

  document.querySelector('#rel-tabela-wrap').innerHTML = `
    <div class="rel-tabela-wrap">
      <div style="overflow-x:auto">
        <table class="rel-tabela">
          <thead>
            <tr>
              ${cabec('data', 'Data')}
              ${cabec('numero_nf', 'NF')}
              ${cabec('cliente_nome', 'Cliente')}
              ${cabec('valor_nf', 'Valor', 'col-num')}
              ${cabec('categoria', 'Categoria')}
              ${cabec('estado', 'Estado')}
              <th>Detalhes</th>
              <th class="col-num">Obs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${fatia.map(linhaTr).join('')}
          </tbody>
        </table>
      </div>
      <div class="rel-pagina">
        <span>${total.toLocaleString('pt-BR')} ${total === 1 ? 'linha' : 'linhas'} · página ${pagina} de ${totalPgs}</span>
        <div class="rel-pagina-acoes">
          <button class="rel-pagina-btn" data-pg="prev" ${pagina === 1 ? 'disabled' : ''}>← Anterior</button>
          <button class="rel-pagina-btn" data-pg="next" ${pagina === totalPgs ? 'disabled' : ''}>Próxima →</button>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('[data-sortable="true"]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (ord.coluna === col) {
        ord.dir = ord.dir === 'asc' ? 'desc' : 'asc';
      } else {
        ord.coluna = col;
        ord.dir = 'asc';
      }
      renderTabela();
    });
  });
  document.querySelectorAll('[data-pg]').forEach(b => {
    b.addEventListener('click', () => {
      const totalPgs2 = Math.max(1, Math.ceil(dadosOrdenados().length / TAMANHO_PAGINA));
      if (b.dataset.pg === 'prev' && pagina > 1) pagina--;
      if (b.dataset.pg === 'next' && pagina < totalPgs2) pagina++;
      renderTabela();
    });
  });
}

function cabec(col, rotulo, extra = '') {
  const sortAttr = ord.coluna === col ? `data-sort="${ord.dir}"` : '';
  return `<th data-sortable="true" data-col="${col}" class="${extra}" ${sortAttr}>${rotulo}</th>`;
}

function linhaTr(l) {
  const dt = new Date(l.data + 'T00:00');
  const dataF = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(dt);
  const valF = formatarMoeda(Number(l.valor_nf || 0));
  return `
    <tr>
      <td class="col-data">${esc(dataF)}</td>
      <td>${esc(l.numero_nf || '—')}</td>
      <td>${esc(l.cliente_nome || '—')}</td>
      <td class="col-num">${esc(valF)}</td>
      <td>${esc(rotuloCategoria(l.categoria))}</td>
      <td>${esc(rotuloEstado(l.estado))}</td>
      <td>${esc(l.resumo_dados || '')}</td>
      <td class="col-num">${l.observacoes_qtd > 0 ? l.observacoes_qtd : ''}</td>
      <td class="col-link"><a href="/lancamento/${esc(l.lancamento_id)}" data-link>Abrir</a></td>
    </tr>`;
}

function dadosOrdenados() {
  const arr = [...dadosBruto];
  const c = ord.coluna;
  arr.sort((a, b) => {
    let va = a[c]; let vb = b[c];
    if (c === 'valor_nf') { va = Number(va || 0); vb = Number(vb || 0); }
    if (c === 'data') { va = a.data; vb = b.data; }
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (va < vb) return ord.dir === 'asc' ? -1 : 1;
    if (va > vb) return ord.dir === 'asc' ? 1 : -1;
    return 0;
  });
  return arr;
}

function renderExport() {
  document.querySelector('#rel-export').innerHTML = `
    <div class="rel-export">
      <div class="rel-export-texto">
        Os arquivos seguem exatamente os filtros aplicados acima.
        CSV abre no Excel com acentos preservados; PDF é arquivável.
      </div>
      <div class="rel-export-acoes">
        <button id="rel-csv" class="btn-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1 V10 M3 6 L7 10 L11 6 M2 12 H12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Baixar CSV (Excel)
        </button>
        <button id="rel-pdf" class="btn-primary"
          style="background:var(--c-tinta);box-shadow:0 1px 0 0 rgba(255,255,255,0.05) inset, 0 6px 14px -8px rgba(0,0,0,0.3)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 1 H8 L11 4 V13 H3 Z M8 1 V4 H11 M5 7 H9 M5 9.5 H9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          Baixar PDF
        </button>
      </div>
    </div>`;

  document.querySelector('#rel-csv').addEventListener('click', baixarCSV);
  document.querySelector('#rel-pdf').addEventListener('click', baixarPDF);
}

// ─── CSV ────────────────────────────────────────────────────────────
async function baixarCSV() {
  const btn = document.querySelector('#rel-csv');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  const { data, error } = await supabase.rpc('exportar_relatorio_csv', {
    p_data_inicio: estado.inicio,
    p_data_fim:    estado.fim,
    p_categorias:  estado.categorias.length ? estado.categorias : null,
    p_estados:     estado.estados.length ? estado.estados : null,
  });

  btn.removeAttribute('aria-busy');
  btn.disabled = false;

  if (error) {
    mostrarToast('Erro ao gerar CSV: ' + error.message, 'erro', 5000);
    return;
  }
  // BOM já vem do banco; força text/csv para download.
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
  baixar(blob, nomeArquivo('csv'));
  mostrarToast('CSV baixado.', 'ok', 2200);
}

// ─── PDF ────────────────────────────────────────────────────────────
async function baixarPDF() {
  const btn = document.querySelector('#rel-pdf');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  try {
    const [{ jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

    const sessao = await pegarSessao();
    const meta = sessao?.user?.user_metadata ?? {};
    const adminNome = [meta.nome, meta.sobrenome].filter(Boolean).join(' ').trim()
                   || sessao?.user?.email
                   || '—';

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const larg = doc.internal.pageSize.getWidth();

    // Cabeçalho — "logo" em texto Helvetica + linha musgo
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 76, 58);  // musgo
    doc.setFontSize(13);
    doc.text('CAIXA BOTI', 40, 50);
    doc.setLineWidth(0.6);
    doc.setDrawColor(15, 76, 58);
    doc.line(40, 56, 110, 56);

    // Título do relatório (Times serifa pra estilo editorial)
    doc.setFont('times', 'italic');
    doc.setTextColor(26, 26, 26);
    doc.setFontSize(18);
    doc.text(`Relatório do período`, 40, 90);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(63, 63, 63);
    doc.setFontSize(10);
    doc.text(`${formatarDataPt(estado.inicio)}  →  ${formatarDataPt(estado.fim)}`, 40, 108);

    // Filtros aplicados
    const linhasFiltros = [];
    if (estado.categorias.length) {
      linhasFiltros.push('Categorias: ' + estado.categorias.map(rotuloCategoria).join(', '));
    }
    if (estado.estados.length) {
      linhasFiltros.push('Estados: ' + estado.estados.map(rotuloEstado).join(', '));
    }
    if (linhasFiltros.length === 0) linhasFiltros.push('Sem filtros adicionais');

    doc.setFontSize(8.5);
    doc.setTextColor(107, 107, 107);
    linhasFiltros.forEach((t, i) => {
      doc.text(t, 40, 124 + i * 11);
    });

    // Geração
    const dataGeracao = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date());
    doc.text(`Gerado em ${dataGeracao} por ${adminNome}`, larg - 40, 50, { align: 'right' });

    // Tabela
    const arr = dadosOrdenados();
    const yInicial = 124 + linhasFiltros.length * 11 + 12;

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
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
        textColor: [40, 40, 40],
        lineColor: [226, 215, 192],  // papel-3
        lineWidth: 0.4,
      },
      headStyles: {
        fillColor: [237, 229, 214],  // papel-2
        textColor: [15, 76, 58],     // musgo
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 244, 235] },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 56 },
        3: { cellWidth: 58, halign: 'right' },
        7: { cellWidth: 30, halign: 'right' },
      },
      margin: { top: yInicial, left: 40, right: 40, bottom: 60 },
    });

    // Sumário no fim do PDF
    const valBruto = arr.reduce((s, l) => s + Number(l.valor_nf || 0), 0);
    const valFinalizado = arr.filter(l => l.estado === 'finalizado').reduce((s, l) => s + Number(l.valor_nf || 0), 0);
    const valCancelado = arr.filter(l => l.estado === 'cancelado' || l.estado === 'cancelado_pos').reduce((s, l) => s + Number(l.valor_nf || 0), 0);
    const valLiquido = valBruto - valCancelado;

    const yFim = doc.lastAutoTable?.finalY ?? yInicial;
    let ySumario = yFim + 18;
    const altPagina = doc.internal.pageSize.getHeight();
    if (ySumario > altPagina - 80) {
      doc.addPage();
      ySumario = 60;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 76, 58);
    doc.text('TOTAIS', 40, ySumario);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(`Lançamentos: ${arr.length.toLocaleString('pt-BR')}`, 40, ySumario + 14);
    doc.text(`Valor bruto:    ${formatarMoeda(valBruto)}`, 40, ySumario + 28);
    doc.text(`Líquido:        ${formatarMoeda(valLiquido)}`, 40, ySumario + 42);
    doc.text(`Finalizado:    ${formatarMoeda(valFinalizado)}`, 40, ySumario + 56);
    doc.text(`Cancelado:    ${formatarMoeda(valCancelado)}`, 40, ySumario + 70);

    // Paginação no rodapé de cada página
    const totalPgs = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPgs; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(107, 107, 107);
      doc.text(`Página ${p} de ${totalPgs}`, larg - 40, altPagina - 30, { align: 'right' });
      doc.text('Caixa Boti', 40, altPagina - 30);
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
  return CATEGORIAS.find(x => x.v === c)?.rotulo || (c === 'em_analise' ? 'Em análise' : c);
}
function rotuloEstado(s) {
  return ESTADOS.find(x => x.v === s)?.rotulo || s;
}
function formatarMoeda(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}
function formatarDataPt(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
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
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
