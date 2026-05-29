// pendencias.js — Tela /pendencias refator v2 (Clean Profissional).
// Lista pendências da view `pendencia` com filtros próprios v2.
// Namespace .pnd-*. Sem filter-bar genérico — filtros em chips +
// search inline + select de categoria. Realtime mantido.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModalEditarLancamento } from '../../components/modal-editar-lancamento.js';
import { LABEL_CATEGORIA, dataLonga, CATEGORIAS } from '../dominio.js';
import { formatBRL, formatarNumeroNF, formatarNomeCliente } from '../utils.js';
import { debounce } from '../utils.js';

let canalPend = null;
let dadosCache = [];
let filtros = {
  severidade: '',   // 'urgente' | 'aviso' | 'normal'
  categoria:  '',   // valor da categoria ou 'em_analise'
  estado:     '',   // 'pendente' | 'completo'
  busca:      '',
};

export async function renderPendencias() {
  desmontar();

  // Aceita pré-busca via querystring (?busca=NF ou ?busca=YYYY-MM-DD vindo de outros lugares)
  const sp = new URLSearchParams(location.search);
  if (sp.get('busca')) filtros.busca = sp.get('busca').trim();

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'pendencias',
    conteudo: `
    <main id="main" class="pnd">
      <header class="pnd-header">
        <div class="pnd-header-meta">
          <p class="pnd-eyebrow">Atenção</p>
          <h1 class="pnd-title">Pendências</h1>
          <p class="pnd-sub">
            O que ainda não foi resolvido — sem categoria, aguardando desfecho,
            ou atrasado. Vencendo primeiro.
          </p>
        </div>
        <div class="pnd-stats">
          <div class="pnd-stat">
            <span class="pnd-stat-val" id="pnd-stat-total">—</span>
            <span class="pnd-stat-lab">total</span>
          </div>
          <div class="pnd-stat" data-tone="danger">
            <span class="pnd-stat-val" id="pnd-stat-urg">—</span>
            <span class="pnd-stat-lab">urgentes</span>
          </div>
          <div class="pnd-stat">
            <span class="pnd-stat-val" id="pnd-stat-valor">—</span>
            <span class="pnd-stat-lab">em jogo</span>
          </div>
        </div>
      </header>

      <section class="pnd-filtros">
        <div class="pnd-chips" role="group" aria-label="Filtro de severidade">
          <button type="button" class="pnd-chip" data-sev="" aria-pressed="true">
            Todas <span class="pnd-chip-count" data-count="todas">—</span>
          </button>
          <button type="button" class="pnd-chip" data-sev="urgente">
            <span class="pnd-chip-dot" data-tone="danger"></span>
            Urgentes <span class="pnd-chip-count" data-count="urgente">—</span>
          </button>
          <button type="button" class="pnd-chip" data-sev="aviso">
            <span class="pnd-chip-dot" data-tone="warn"></span>
            Em atenção <span class="pnd-chip-count" data-count="aviso">—</span>
          </button>
          <button type="button" class="pnd-chip" data-sev="normal">
            <span class="pnd-chip-dot" data-tone="info"></span>
            Normais <span class="pnd-chip-count" data-count="normal">—</span>
          </button>
        </div>

        <div class="pnd-search-wrap">
          <span class="pnd-search-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>
          </span>
          <input type="search" id="pnd-busca" class="pnd-search-input"
                 placeholder="Buscar NF, cliente ou pedido…"
                 value="${esc(filtros.busca)}" />
        </div>

        <select id="pnd-cat" class="pnd-select" aria-label="Filtro de categoria">
          <option value="">Todas categorias</option>
          <option value="em_analise">— Em análise (sem categoria)</option>
          ${CATEGORIAS.map(c => `<option value="${c.valor}">${c.rotulo}</option>`).join('')}
        </select>
      </section>

      <section id="pnd-lista" class="pnd-lista" aria-live="polite"></section>
    </main>
    `,
  });

  ligarShell();
  ligarFiltros();
  await carregar();
  ligarRealtime();
}

// ───────────────────────────────────────────────────────────────────
// Filtros
// ───────────────────────────────────────────────────────────────────

function ligarFiltros() {
  document.querySelectorAll('.pnd-chip').forEach(c => {
    c.addEventListener('click', () => {
      filtros.severidade = c.dataset.sev || '';
      document.querySelectorAll('.pnd-chip').forEach(x => {
        x.setAttribute('aria-pressed', String(x.dataset.sev === filtros.severidade));
      });
      renderLista();
    });
  });

  const busca = document.querySelector('#pnd-busca');
  if (busca) {
    busca.addEventListener('input', debounce(() => {
      filtros.busca = busca.value.trim();
      renderLista();
    }, 250));
    busca.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { busca.value = ''; filtros.busca = ''; renderLista(); }
    });
  }

  const cat = document.querySelector('#pnd-cat');
  if (cat) {
    cat.addEventListener('change', () => {
      filtros.categoria = cat.value;
      renderLista();
    });
  }
}

// ───────────────────────────────────────────────────────────────────
// Carga + render
// ───────────────────────────────────────────────────────────────────

async function carregar() {
  const lista = document.querySelector('#pnd-lista');
  if (!lista) return;
  lista.innerHTML = `
    ${[1,2,3,4].map(() => `<div class="dash2-skel" style="height:4.5rem;border-radius:10px;margin-bottom:0.55rem"></div>`).join('')}`;

  const { data, error } = await supabase
    .from('pendencia')
    .select('id, caixa_id, data_caixa, numero_nf, codigo_pedido, cliente_nome, valor_nf, estado, categoria, dados_categoria, criado_em, atualizado_em, idade_dias_corridos, idade_dias_uteis, severidade')
    .order('idade_dias_uteis', { ascending: false })
    .limit(300);

  if (error) {
    lista.innerHTML = `<p class="alert">Não conseguimos carregar. ${esc(error.message)}</p>`;
    return;
  }

  dadosCache = data || [];
  atualizarContagens();
  renderLista();
}

function atualizarContagens() {
  const total = dadosCache.length;
  const urgentes = dadosCache.filter(p => p.severidade === 'urgente').length;
  const avisos   = dadosCache.filter(p => p.severidade === 'aviso').length;
  const normais  = dadosCache.filter(p => p.severidade === 'normal' || !p.severidade).length;
  const valorTotal = dadosCache.reduce((s, p) => s + Number(p.valor_nf || 0), 0);

  document.querySelector('#pnd-stat-total').textContent = String(total);
  document.querySelector('#pnd-stat-urg').textContent   = String(urgentes);
  document.querySelector('#pnd-stat-valor').textContent = formatBRL(valorTotal);

  const setCount = (k, v) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = String(v);
  };
  setCount('todas', total);
  setCount('urgente', urgentes);
  setCount('aviso', avisos);
  setCount('normal', normais);
}

function renderLista() {
  const lista = document.querySelector('#pnd-lista');
  if (!lista) return;

  const filtradas = aplicarFiltros(dadosCache, filtros);

  if (filtradas.length === 0) {
    if (dadosCache.length === 0) {
      lista.innerHTML = `
        <div class="pnd-empty pnd-empty--ok">
          <div class="pnd-empty-icone" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>
          </div>
          <p class="pnd-empty-eyebrow">Tudo em ordem</p>
          <p class="pnd-empty-title">Sem pendências no momento.</p>
          <p class="pnd-empty-msg">Quando aparecer algo pra resolver, vem aqui pra cima.</p>
        </div>`;
    } else {
      lista.innerHTML = `
        <div class="pnd-empty">
          <p class="pnd-empty-title">Nenhuma pendência com esses filtros.</p>
          <p class="pnd-empty-msg">Mude os filtros acima ou limpe a busca.</p>
        </div>`;
    }
    return;
  }

  // Agrupa por severidade (urgente / aviso / normal) — só se não filtrou por severidade
  const grupos = {};
  for (const p of filtradas) {
    const k = p.severidade || 'normal';
    (grupos[k] = grupos[k] || []).push(p);
  }
  const ordem = ['urgente', 'aviso', 'normal'];
  const grupoLabel = {
    urgente: { rotulo: 'Urgentes',   sub: 'Mais de 3 dias úteis sem resolução' },
    aviso:   { rotulo: 'Em atenção', sub: '1 a 3 dias úteis em aberto' },
    normal:  { rotulo: 'Normais',    sub: 'até 1 dia útil' },
  };

  lista.innerHTML = ordem.filter(k => grupos[k]?.length).map(k => `
    <div class="pnd-grupo">
      <header class="pnd-grupo-head">
        <span class="pnd-grupo-dot" data-tone="${k === 'urgente' ? 'danger' : k === 'aviso' ? 'warn' : 'info'}"></span>
        <h2 class="pnd-grupo-title">${grupoLabel[k].rotulo}</h2>
        <span class="pnd-grupo-sub">${grupoLabel[k].sub}</span>
        <span class="pnd-grupo-count">${grupos[k].length}</span>
      </header>
      <ul class="pnd-itens" role="list">
        ${grupos[k].map((p, i) => itemPendencia(p, i, k)).join('')}
      </ul>
    </div>
  `).join('');

  // Mapa rápido
  const porId = Object.fromEntries(filtradas.map(p => [p.id, p]));
  lista.querySelectorAll('.pnd-item').forEach(el => {
    el.addEventListener('click', (ev) => {
      const p = porId[el.dataset.id];
      if (!p) return;
      abrirModalEditarLancamento({
        lancamento: {
          id: p.id, numero_nf: p.numero_nf, codigo_pedido: p.codigo_pedido,
          cliente_nome: p.cliente_nome, valor_nf: p.valor_nf,
          categoria: p.categoria, estado: p.estado,
          dados_categoria: p.dados_categoria, criado_em: p.criado_em,
        },
        dataCaixa: p.data_caixa,
        origemEvento: ev,
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
      const nf  = (p.numero_nf || '').toLowerCase();
      const cli = (p.cliente_nome || '').toLowerCase();
      const ped = (p.codigo_pedido || '').toLowerCase();
      const dt  = (p.data_caixa || '').toLowerCase();
      if (!nf.includes(q) && !cli.includes(q) && !ped.includes(q) && !dt.includes(q)) return false;
    }
    return true;
  });
}

function itemPendencia(p, i, sev) {
  const cat = p.categoria || '';
  const labelCat = cat ? (LABEL_CATEGORIA[cat] || cat) : 'Em análise';
  const idade = Math.max(0, Number(p.idade_dias_uteis) || 0);
  const dataCx = p.data_caixa;
  const delay = `style="animation-delay:${Math.min(i * 28, 280)}ms"`;
  const tone = sev === 'urgente' ? 'danger' : sev === 'aviso' ? 'warn' : 'info';

  return `
    <li>
      <button class="pnd-item" data-id="${esc(p.id)}" data-sev="${esc(p.severidade)}" ${delay}>
        <div class="pnd-item-idade" data-tone="${tone}">
          <span class="pnd-item-idade-num">${idade}</span>
          <span class="pnd-item-idade-lab">${idade === 1 ? 'dia útil' : 'dias úteis'}</span>
        </div>
        <div class="pnd-item-corpo">
          <div class="pnd-item-head">
            <span class="pnd-item-nf">NF ${esc(formatarNumeroNF(p.numero_nf))}</span>
            <span class="pnd-item-cliente">${esc(formatarNomeCliente(p.cliente_nome) || '— sem cliente —')}</span>
          </div>
          <div class="pnd-item-meta">
            <span>${esc(dataLonga(dataCx))}</span>
            <span class="pnd-item-sep" aria-hidden="true">·</span>
            <span>${p.estado === 'completo' ? 'aguardando desfecho' : 'sem categoria'}</span>
          </div>
        </div>
        <div class="pnd-item-dir">
          <span class="pnd-item-cat" data-cat="${esc(cat)}">${esc(labelCat)}</span>
          <span class="pnd-item-valor">${formatBRL(p.valor_nf)}</span>
        </div>
      </button>
    </li>`;
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
  dadosCache = [];
  filtros = { severidade: '', categoria: '', estado: '', busca: '' };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
