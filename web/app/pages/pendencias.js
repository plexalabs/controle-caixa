// pendencias.js — Tela /pendencias (CP5.2).
// Lista centralizada das pendências (view pendencia: pendente, em_preenchimento,
// completo). Filtros via filter-bar com URL state. Click abre drawer de
// edição. Realtime em lancamento (debounce 2s).

import { supabase } from '../supabase.js';
import { renderHeader, ligarHeader } from '../../components/header.js';
import { instalarFilterBar } from '../../components/filter-bar.js';
import { abrirModalEditarLancamento } from '../../components/modal-editar-lancamento.js';
import { LABEL_CATEGORIA, dataLonga, CATEGORIAS } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { debounce } from '../utils.js';

let canalPend = null;
let dadosCache = [];   // todas as pendências carregadas (filtramos client-side)
let fbCtrl = null;

export async function renderPendencias() {
  desmontar();

  document.querySelector('#app').innerHTML = `
    ${await renderHeader('pendencias')}
    <main id="main" class="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <header class="tela-cabec reveal reveal-1">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Atenção</p>
          <h1 class="tela-cabec-titulo">Pendências.</h1>
          <p class="tela-cabec-sub">
            O que ainda não foi resolvido — pendentes sem categoria,
            categorizados aguardando desfecho, e os atrasados em destaque.
          </p>
        </div>
        <span id="pend-contagem" class="h-meta" style="font-size:1.05rem;color:var(--c-tinta-3);font-style:italic">…</span>
      </header>

      <div id="pend-filtros" class="reveal reveal-2"></div>

      <section id="pend-lista" class="reveal reveal-3" aria-live="polite"></section>
    </main>
  `;

  ligarHeader();

  // Configura filter-bar
  fbCtrl = instalarFilterBar(document.querySelector('#pend-filtros'), {
    filtros: [
      { id: 'severidade', label: 'Severidade', tipo: 'select', opcoes: [
        { valor: '',         rotulo: 'Todas' },
        { valor: 'urgente',  rotulo: 'Urgente (>3 dias úteis)' },
        { valor: 'aviso',    rotulo: 'Aviso' },
        { valor: 'normal',   rotulo: 'Normal' },
      ]},
      { id: 'categoria', label: 'Categoria', tipo: 'select', opcoes: [
        { valor: '',          rotulo: 'Todas' },
        { valor: 'em_analise', rotulo: 'Em análise (sem categoria)' },
        ...CATEGORIAS.map(c => ({ valor: c.valor, rotulo: c.rotulo })),
      ]},
      { id: 'estado', label: 'Estado', tipo: 'select', opcoes: [
        { valor: '',          rotulo: 'Todos' },
        { valor: 'pendente',  rotulo: 'Em análise' },
        { valor: 'completo',  rotulo: 'Categorizado sem desfecho' },
      ]},
      { id: 'busca', label: 'Buscar', tipo: 'texto', placeholder: 'NF ou cliente' },
    ],
    onChange: () => renderLista(),
  });

  await carregar();
  ligarRealtime();
}

async function carregar() {
  const lista = document.querySelector('#pend-lista');
  if (!lista) return;
  lista.innerHTML = `
    <div class="space-y-3">
      ${[1,2,3,4].map(() => `<div class="skel" style="height:5rem"></div>`).join('')}
    </div>`;

  const { data, error } = await supabase
    .from('pendencia')
    .select('id, caixa_id, data_caixa, numero_nf, codigo_pedido, cliente_nome, valor_nf, estado, categoria, dados_categoria, criado_em, atualizado_em, idade_dias_corridos, idade_dias_uteis, severidade')
    .order('idade_dias_uteis', { ascending: false })
    .limit(200);

  if (error) {
    lista.innerHTML = `<p class="alert">Não conseguimos carregar as pendências. ${esc(error.message)}</p>`;
    return;
  }

  dadosCache = data || [];
  renderLista();
}

function renderLista() {
  const lista = document.querySelector('#pend-lista');
  const cont  = document.querySelector('#pend-contagem');
  if (!lista || !cont) return;

  const filtros = fbCtrl?.estado() || {};
  const filtradas = aplicarFiltros(dadosCache, filtros);

  cont.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'item' : 'itens'}${
    filtradas.length !== dadosCache.length ? ` (de ${dadosCache.length})` : ''
  }`;

  if (filtradas.length === 0) {
    if (dadosCache.length === 0) {
      lista.innerHTML = `
        <div class="vazio">
          <div class="vazio-num">✓</div>
          <p class="vazio-titulo">Tudo em ordem.</p>
          <p class="vazio-desc">Nada pendente no momento. Boa.</p>
        </div>`;
    } else {
      lista.innerHTML = `
        <div class="vazio" style="padding:2rem 1.5rem">
          <p class="vazio-titulo" style="font-size:1.1rem">Nenhuma pendência com esses filtros.</p>
          <p class="vazio-desc">Ajuste os filtros acima ou clique em <em>Limpar filtros</em>.</p>
        </div>`;
    }
    return;
  }

  lista.innerHTML = `
    <div class="space-y-2">
      ${filtradas.map((p, i) => linhaPendencia(p, i)).join('')}
    </div>`;

  // Mapa rápido id → pendencia
  const porId = Object.fromEntries(filtradas.map(p => [p.id, p]));
  lista.querySelectorAll('.pend-row').forEach(el => {
    el.addEventListener('click', () => {
      const p = porId[el.dataset.id];
      if (!p) return;
      // O drawer aceita o objeto da pendencia diretamente; ele só lê
      // os campos que precisa (id, numero_nf, categoria, dados_categoria, estado).
      abrirModalEditarLancamento({
        lancamento: {
          id: p.id, numero_nf: p.numero_nf, codigo_pedido: p.codigo_pedido,
          cliente_nome: p.cliente_nome, valor_nf: p.valor_nf,
          categoria: p.categoria, estado: p.estado,
          dados_categoria: p.dados_categoria, criado_em: p.criado_em,
        },
        dataCaixa: p.data_caixa,
        aoSalvar: () => carregar(),
      });
    });
  });
}

function aplicarFiltros(itens, f) {
  return itens.filter(p => {
    if (f.severidade && p.severidade !== f.severidade) return false;
    if (f.estado && p.estado !== f.estado) return false;
    if (f.categoria) {
      if (f.categoria === 'em_analise') {
        if (p.categoria != null) return false;
      } else {
        if (p.categoria !== f.categoria) return false;
      }
    }
    if (f.busca) {
      const q = f.busca.toLowerCase();
      const nf = (p.numero_nf || '').toLowerCase();
      const cli = (p.cliente_nome || '').toLowerCase();
      const ped = (p.codigo_pedido || '').toLowerCase();
      if (!nf.includes(q) && !cli.includes(q) && !ped.includes(q)) return false;
    }
    return true;
  });
}

function linhaPendencia(p, i) {
  const cat = p.categoria || '';
  const labelCat = cat ? (LABEL_CATEGORIA[cat] || cat) : 'Em análise';
  const dataCx = formatarDataCurta(p.data_caixa);
  const idadeNum = Math.max(0, Number(p.idade_dias_uteis) || 0);

  return `
    <button class="pend-row" data-id="${esc(p.id)}" data-severidade="${esc(p.severidade)}"
            style="animation-delay:${i * 30}ms">
      <div class="pend-row-idade">
        <span class="pend-row-idade-num">${idadeNum}</span>
        <span class="pend-row-idade-rot">${idadeNum === 1 ? 'dia útil' : 'dias úteis'}</span>
      </div>
      <div class="pend-row-corpo">
        <p class="pend-row-titulo">
          <span class="pend-row-nf">NF ${esc(p.numero_nf)}</span>
          <span style="color:var(--c-tinta-3);margin:0 0.45rem">·</span>
          ${esc(p.cliente_nome || '— sem cliente —')}
        </p>
        <p class="pend-row-meta">
          ${esc(dataLonga(p.data_caixa))}
          ${p.estado === 'completo' ? '<span class="sep">·</span>aguardando desfecho' : '<span class="sep">·</span>sem categoria'}
        </p>
      </div>
      <span class="pend-row-cat" data-cat="${esc(cat)}">${esc(labelCat)}</span>
      <span class="pend-row-valor">${formatBRL(p.valor_nf)}</span>
    </button>`;
}

function formatarDataCurta(iso) {
  return iso;  // já vem ISO; dataLonga formata no contexto.
}

// ─── Realtime ───────────────────────────────────────────────────────
function ligarRealtime() {
  const recarregar = debounce(() => carregar(), 2000);
  canalPend = supabase.channel('pendencias-feed')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lancamento' },
        () => recarregar())
    .subscribe();
}

function desmontar() {
  if (canalPend) {
    supabase.removeChannel(canalPend).catch(() => {});
    canalPend = null;
  }
  if (fbCtrl) {
    fbCtrl.destruir();
    fbCtrl = null;
  }
  dadosCache = [];
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
