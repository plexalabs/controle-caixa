// topbar.js — Barra superior global do app autenticado.
// Versao enxuta: barra de busca + sino de notificacoes. O atalho do
// caixa (CTA "Abrir/Ir para caixa") foi removido — a navegacao do
// caixa fica no widget proprio da dashboard e na sidebar.
//
// CP-busca: a barra agora exibe ate 5 correspondencias visuais em
// tempo real (NF, pedido, cliente). Click leva ao caixa do lancamento
// com o popup de edicao ja aberto.

import { navegar } from '../app/router.js';
import { supabase } from '../app/supabase.js';
import {
  debounce, formatBRL, formatarNumeroNF, formatarCodigoPedido, formatarNomeCliente,
} from '../app/utils.js';
import { abrirModalEditarLancamento } from './modal-editar-lancamento.js';
import { LABEL_CATEGORIA_CURTA, dataCurta } from '../app/dominio.js';

let estado = {
  termo: '',
  resultados: [],
  ativo: -1,
  carregando: false,
  reqId: 0,
};

export function renderTopbar() {
  return `
    <header class="tb" role="banner">
      <div class="tb-search-shell">
        <form class="tb-search" id="tb-search" role="search" autocomplete="off"
              aria-haspopup="listbox" aria-expanded="false" aria-owns="tb-suggest">
          <span class="tb-search-icon" aria-hidden="true">${svgSearch()}</span>
          <input type="search" id="tb-search-input"
                 placeholder="Buscar NF, pedido, cliente…"
                 aria-label="Busca global"
                 aria-autocomplete="list"
                 aria-controls="tb-suggest" />
          <kbd class="tb-search-kbd">/</kbd>
        </form>
        <div class="tb-suggest" id="tb-suggest" role="listbox" hidden></div>
      </div>

      <div class="tb-actions">
        <button type="button" class="tb-icon" id="tb-bell"
                aria-label="Notificações" aria-haspopup="dialog" aria-expanded="false">
          ${svgBell()}
          <span class="tb-icon-dot" id="tb-bell-dot" hidden></span>
        </button>
      </div>
    </header>
  `;
}

export function ligarTopbar() {
  const form  = document.querySelector('#tb-search');
  const input = document.querySelector('#tb-search-input');
  const pop   = document.querySelector('#tb-suggest');
  if (!form || !input || !pop) return;

  document.addEventListener('keydown', onSlash);

  input.addEventListener('input', debounce(onInput, 160));
  input.addEventListener('focus', () => {
    if (estado.resultados.length || estado.termo) abrir();
  });
  input.addEventListener('keydown', onKeydown);

  // Click fora fecha
  document.addEventListener('mousedown', onDocMousedown);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Se ha um item ativo, abre direto
    if (estado.ativo >= 0 && estado.resultados[estado.ativo]) {
      escolher(estado.resultados[estado.ativo]);
      return;
    }
    const q = input.value.trim();
    if (!q) return;
    fechar();
    navegar(`/pendencias?busca=${encodeURIComponent(q)}`);
  });
}

function onInput(e) {
  const q = (e?.target?.value || '').trim();
  estado.termo = q;
  estado.ativo = -1;
  if (q.length < 2) {
    estado.resultados = [];
    estado.carregando = false;
    if (q.length === 0) { fechar(); return; }
    render(); abrir();
    return;
  }
  estado.carregando = true;
  render(); abrir();
  buscar(q);
}

async function buscar(q) {
  const reqId = ++estado.reqId;
  const padrao = escaparILike(q);

  // Busca em lancamento por NF, pedido ou cliente. Join com caixa
  // para descobrir a data e poder navegar/abrir o popup.
  // A coluna na tabela `caixa` chama-se `data` (o alias `data_caixa`
  // so existe na view `pendencia`). Remapeamos aqui pra manter a API
  // interna consistente.
  // Ignora estado=excluido (soft-delete e regra invioavel).
  const { data, error } = await supabase
    .from('lancamento')
    .select(`
      id, numero_nf, codigo_pedido, cliente_nome, valor_nf,
      estado, categoria, dados_categoria, criado_em,
      caixa:caixa_id ( data )
    `)
    .neq('estado', 'excluido')
    .or(`numero_nf.ilike.%${padrao}%,codigo_pedido.ilike.%${padrao}%,cliente_nome.ilike.%${padrao}%`)
    .order('criado_em', { ascending: false })
    .limit(5);

  // Se ja partiu outra req mais nova, descarta
  if (reqId !== estado.reqId) return;

  if (error) {
    console.error('[topbar busca] falha na consulta', error);
    estado.resultados = [];
    estado.carregando = false;
    render();
    return;
  }

  estado.resultados = (data || []).map(linha => ({
    ...linha,
    data_caixa: linha.caixa?.data || null,
    tipoMatch: detectarTipoMatch(linha, q),
  }));
  estado.carregando = false;
  estado.ativo = estado.resultados.length ? 0 : -1;
  render();
}

function detectarTipoMatch(linha, q) {
  const lower = q.toLowerCase();
  if ((linha.numero_nf || '').toLowerCase().includes(lower)) return 'nf';
  if ((linha.codigo_pedido || '').toLowerCase().includes(lower)) return 'pedido';
  return 'cliente';
}

function render() {
  const pop = document.querySelector('#tb-suggest');
  if (!pop) return;

  if (estado.carregando) {
    pop.innerHTML = `
      <div class="tb-sug-status">
        <span class="tb-sug-spin" aria-hidden="true"></span>
        <span>Buscando…</span>
      </div>`;
    return;
  }

  if (estado.termo.length < 2) {
    pop.innerHTML = `
      <div class="tb-sug-hint">
        <span class="tb-sug-hint-kbd">/</span>
        digite ao menos 2 caracteres — NF, pedido ou cliente
      </div>`;
    return;
  }

  if (estado.resultados.length === 0) {
    pop.innerHTML = `
      <div class="tb-sug-status tb-sug-vazio">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/><path d="M5 7h4"/>
        </svg>
        <span>Sem correspondências para <strong>${esc(estado.termo)}</strong>.</span>
      </div>`;
    return;
  }

  pop.innerHTML = `
    <ul class="tb-sug-lista" role="presentation">
      ${estado.resultados.map((r, i) => itemHTML(r, i)).join('')}
    </ul>
  `;

  pop.querySelectorAll('.tb-sug-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      estado.ativo = Number(el.dataset.idx);
      sincronizarAtivo();
    });
    el.addEventListener('mousedown', (e) => {
      // mousedown (nao click) pra disparar antes do blur fechar
      e.preventDefault();
      const idx = Number(el.dataset.idx);
      const r = estado.resultados[idx];
      if (r) escolher(r);
    });
  });

  sincronizarAtivo();
}

function itemHTML(r, i) {
  const tipo = r.tipoMatch;
  const cat = r.categoria || '';
  const catLabel = cat ? (LABEL_CATEGORIA_CURTA[cat] || cat) : '';
  const ativo = i === estado.ativo ? ' is-ativo' : '';
  const dt = r.data_caixa ? dataCurta(r.data_caixa) : '—';

  // Linha 1: NF (mono) + cliente — espelha o padrao do .pnd-item-head
  // Linha 2 (meta): data · pedido (se houver) — espelha .pnd-item-meta
  // Formata os campos antes de exibir (mesma regra da tela de novo
  // lancamento). marcar() destaca o trecho que casou com o termo da
  // busca — passamos a versao ja formatada pra que o highlight pegue
  // tanto "123" quanto "1.234" se o usuario digitar de qualquer jeito.
  const nfFmt  = formatarNumeroNF(r.numero_nf);
  const pedFmt = r.codigo_pedido ? formatarCodigoPedido(r.codigo_pedido) : '';
  const cliFmt = formatarNomeCliente(r.cliente_nome) || '— sem cliente —';

  const nfHTML  = tipo === 'nf'     ? marcar(nfFmt, estado.termo)
                                    : esc(nfFmt || '—');
  const cliHTML = tipo === 'cliente' ? marcar(cliFmt, estado.termo)
                                     : esc(cliFmt);
  const pedHTML = pedFmt
    ? (tipo === 'pedido' ? marcar(pedFmt, estado.termo) : esc(pedFmt))
    : '';

  return `
    <li class="tb-sug-item${ativo}"
        role="option"
        data-idx="${i}"
        aria-selected="${i === estado.ativo}"
        style="animation-delay:${i * 22}ms">
      <span class="tb-sug-icone" data-tipo="${tipo}" aria-hidden="true">${iconePorTipo(tipo)}</span>
      <div class="tb-sug-corpo">
        <div class="tb-sug-head">
          <span class="tb-sug-nf">NF ${nfHTML}</span>
          <span class="tb-sug-cliente">${cliHTML}</span>
        </div>
        <div class="tb-sug-meta">
          <span>${esc(dt)}</span>
          ${pedHTML ? `<span class="tb-sug-sep" aria-hidden="true">·</span><span>pedido ${pedHTML}</span>` : ''}
        </div>
      </div>
      <div class="tb-sug-dir">
        ${catLabel ? `<span class="tb-sug-cat" data-cat="${esc(cat)}">${esc(catLabel)}</span>` : `<span class="tb-sug-cat tb-sug-cat--vazia">Em análise</span>`}
        <span class="tb-sug-valor">${formatBRL(r.valor_nf)}</span>
      </div>
    </li>`;
}

function iconePorTipo(tipo) {
  if (tipo === 'nf') {
    // Documento com lapis — representa a nota fiscal
    return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M5 2.5h6.5L15 6v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"/>
      <path d="M11 2.5V6h4"/>
      <path d="M6.5 10h5M6.5 13h3.5"/>
    </svg>`;
  }
  if (tipo === 'pedido') {
    // Caixa/sacola — representa o pedido
    return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5v-7Z"/>
      <path d="M3.5 6.5 10 10l6.5-3.5"/>
      <path d="M10 10v7"/>
    </svg>`;
  }
  // Cliente — silhueta
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
    <circle cx="10" cy="7" r="3"/>
    <path d="M3.5 17c.6-3 3.3-5 6.5-5s5.9 2 6.5 5"/>
  </svg>`;
}

function sincronizarAtivo() {
  const pop = document.querySelector('#tb-suggest');
  if (!pop) return;
  pop.querySelectorAll('.tb-sug-item').forEach(el => {
    const ativo = Number(el.dataset.idx) === estado.ativo;
    el.classList.toggle('is-ativo', ativo);
    el.setAttribute('aria-selected', String(ativo));
    if (ativo) el.scrollIntoView({ block: 'nearest' });
  });
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (estado.resultados.length || document.querySelector('#tb-suggest')?.dataset.aberto === '1') {
      fechar();
    } else {
      const inp = e.currentTarget;
      inp.value = ''; inp.blur();
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (estado.resultados.length === 0) return;
    estado.ativo = (estado.ativo + 1) % estado.resultados.length;
    sincronizarAtivo();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (estado.resultados.length === 0) return;
    estado.ativo = (estado.ativo - 1 + estado.resultados.length) % estado.resultados.length;
    sincronizarAtivo();
    return;
  }
}

async function escolher(r) {
  fechar();
  const input = document.querySelector('#tb-search-input');
  if (input) input.value = '';
  estado.termo = '';
  estado.resultados = [];
  estado.ativo = -1;

  if (!r?.data_caixa) {
    // Sem data_caixa nao da pra navegar — cai pra busca em /pendencias
    navegar(`/pendencias?busca=${encodeURIComponent(r?.numero_nf || r?.cliente_nome || '')}`);
    return;
  }

  // Navega para o caixa do dia do lancamento e abre o popup por cima.
  await navegar(`/caixa/${r.data_caixa}`);
  // Espera o proximo frame para garantir que a tela ja montou
  requestAnimationFrame(() => {
    abrirModalEditarLancamento({
      lancamento: {
        id: r.id,
        numero_nf: r.numero_nf,
        codigo_pedido: r.codigo_pedido,
        cliente_nome: r.cliente_nome,
        valor_nf: r.valor_nf,
        categoria: r.categoria,
        estado: r.estado,
        dados_categoria: r.dados_categoria,
        criado_em: r.criado_em,
      },
      dataCaixa: r.data_caixa,
      aoSalvar: () => {},
    });
  });
}

function abrir() {
  const pop = document.querySelector('#tb-suggest');
  const form = document.querySelector('#tb-search');
  if (!pop || !form) return;
  pop.hidden = false;
  pop.dataset.aberto = '1';
  form.setAttribute('aria-expanded', 'true');
}

function fechar() {
  const pop = document.querySelector('#tb-suggest');
  const form = document.querySelector('#tb-search');
  if (!pop || !form) return;
  pop.hidden = true;
  delete pop.dataset.aberto;
  form.setAttribute('aria-expanded', 'false');
}

function onDocMousedown(e) {
  const shell = e.target.closest('.tb-search-shell');
  if (!shell) fechar();
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
  document.removeEventListener('mousedown', onDocMousedown);
}

// ─── Helpers ───────────────────────────────────────────────────────

function marcar(texto, termo) {
  const t = String(texto ?? '');
  if (!termo || termo.length < 2) return esc(t);
  const re = new RegExp(`(${escaparRegex(termo)})`, 'ig');
  return esc(t).replace(re, '<mark>$1</mark>');
}

function escaparRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escaparILike(s) {
  // No PostgREST ilike, % e _ sao curingas. Escapa pra usar literal.
  return String(s).replace(/[%_\\]/g, '\\$&').replace(/,/g, '');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ─── SVGs ───────────────────────────────────────────────────────────
const A = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
function svgSearch() { return `<svg ${A}><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>`; }
function svgBell()   { return `<svg ${A} stroke-width="1.5"><path d="M3 6a5 5 0 0 1 10 0v3l1.5 2H1.5L3 9V6Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`; }
