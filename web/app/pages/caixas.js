// caixas.js — Tela /caixas refator visual v2.
//
// Layout: split 2/3 (lista de caixas) + 1/3 (painel sticky com resumo
// de pendencias). Filtros em chips no topo, namespace .cx2-*.
//
// Logica de dados preservada (queries de caixa + lancamento), com
// query adicional na view 'pendencia' pra alimentar o painel lateral.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { ESTADO_CAIXA } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { navegar } from '../router.js';

// Estado do filtro (so este modulo)
let filtros = {
  estado:        'todos',   // 'todos'|'aberto'|'em_conferencia'|'fechado'|'arquivado'
  comPendencias: false,     // true = so caixas com total_pendentes > 0
  periodo:       'todos',   // 'todos'|'mes'|'semana'
};
let cacheCaixas = null;
let cachePendencias = null;

export async function renderCaixas() {
  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'caixas',
    conteudo: `
    <main id="main" class="cx2">
      <header class="cx2-header">
        <div>
          <p class="cx2-eyebrow">Arquivo</p>
          <h1 class="cx2-title">Os caixas, em ordem.</h1>
          <p class="cx2-sub">
            Cada dia útil ganha uma página. Filtre para encontrar
            rapidamente.
          </p>
        </div>
        <a href="/caixa/hoje" data-link class="cx2-btn cx2-btn--ghost cx2-btn--sm">
          Caixa de hoje →
        </a>
      </header>

      <section class="cx2-filtros" aria-label="Filtros">
        <div class="cx2-chips" id="cx2-chips-estado" role="group" aria-label="Filtro de estado">
          ${chipsEstadoHtml()}
        </div>
        <label class="cx2-toggle" id="cx2-toggle-pend">
          <input type="checkbox" id="cx2-pend-input" />
          <span class="cx2-toggle-pill" aria-hidden="true">
            <span class="cx2-toggle-dot"></span>
          </span>
          <span class="cx2-toggle-label">Só com pendências</span>
        </label>
      </section>

      <div class="cx2-split">
        <section id="lista-caixas" class="cx2-lista" aria-label="Lista de caixas">
          ${listaSkel()}
        </section>

        <aside class="cx2-painel" aria-label="Resumo de pendências">
          <article class="cx2-painel-card">
            <header class="cx2-painel-head">
              <h2 class="cx2-painel-title">Pendências</h2>
              <p class="cx2-painel-sub" id="cx2-painel-sub">—</p>
            </header>
            <div id="cx2-painel-conteudo" class="cx2-painel-body">
              ${painelSkel()}
            </div>
          </article>
        </aside>
      </div>
    </main>
    `,
  });

  ligarShell();
  ligarFiltros();
  await Promise.all([
    carregarCaixas(),
    carregarPainelPendencias(),
  ]);
}

// ───────────────────────────────────────────────────────────────────
// Filtros (chips de estado + toggle 'so com pendencias')
// ───────────────────────────────────────────────────────────────────

const ESTADOS_FILTRO = [
  { valor: 'todos',          rotulo: 'Todos' },
  { valor: 'aberto',         rotulo: 'Abertos' },
  { valor: 'em_conferencia', rotulo: 'Em conferência' },
  { valor: 'fechado',        rotulo: 'Fechados' },
  { valor: 'arquivado',      rotulo: 'Arquivados' },
];

function chipsEstadoHtml() {
  return ESTADOS_FILTRO.map(e =>
    `<button type="button" class="cx2-chip" data-valor="${e.valor}"
             aria-pressed="${e.valor === filtros.estado}">
      ${esc(e.rotulo)}
      <span class="cx2-chip-count" data-count-for="${e.valor}">—</span>
    </button>`
  ).join('');
}

function ligarFiltros() {
  document.querySelectorAll('#cx2-chips-estado .cx2-chip').forEach(c => {
    c.addEventListener('click', () => {
      const valor = c.dataset.valor;
      filtros.estado = valor;
      atualizarChipsEstado();
      renderLista();
    });
  });
  const tog = document.querySelector('#cx2-pend-input');
  if (tog) {
    tog.addEventListener('change', () => {
      filtros.comPendencias = tog.checked;
      renderLista();
    });
  }
}

function atualizarChipsEstado() {
  document.querySelectorAll('#cx2-chips-estado .cx2-chip').forEach(c => {
    c.setAttribute('aria-pressed', String(c.dataset.valor === filtros.estado));
  });
}

// ───────────────────────────────────────────────────────────────────
// Carregamento de caixas + render filtrado
// ───────────────────────────────────────────────────────────────────

async function carregarCaixas() {
  const lista = document.querySelector('#lista-caixas');
  if (!lista) return;

  const [caixasRes, lancRes, pendRes] = await Promise.all([
    supabase.from('caixa')
      .select('id, data, estado, total_lancamentos, total_pendentes, total_valor, criado_em')
      .order('data', { ascending: false }),
    supabase.from('lancamento')
      .select('caixa_id, estado, categoria')
      .neq('estado', 'excluido'),
    supabase.from('pendencia')
      .select('data_caixa, severidade'),
  ]);

  if (caixasRes.error) {
    lista.innerHTML = `<p class="alert">Não conseguimos carregar. ${esc(caixasRes.error.message)}</p>`;
    return;
  }

  // Agrega por caixa: contagens de estado e top categorias
  const lancsPorCaixa = {};
  for (const l of (lancRes.data || [])) {
    const k = l.caixa_id;
    if (!lancsPorCaixa[k]) {
      lancsPorCaixa[k] = { resolvidos: 0, cancelados: 0, categorias: {} };
    }
    if (l.estado === 'resolvido') lancsPorCaixa[k].resolvidos++;
    if (l.estado === 'cancelado') lancsPorCaixa[k].cancelados++;
    if (l.categoria) {
      lancsPorCaixa[k].categorias[l.categoria] = (lancsPorCaixa[k].categorias[l.categoria] || 0) + 1;
    }
  }

  // Pendências críticas por data_caixa
  const criticasPorData = {};
  for (const p of (pendRes.data || [])) {
    if (p.severidade === 'urgente') {
      criticasPorData[p.data_caixa] = (criticasPorData[p.data_caixa] || 0) + 1;
    }
  }

  cacheCaixas = (caixasRes.data || []).map(c => {
    const stats = lancsPorCaixa[c.id] || { resolvidos: 0, cancelados: 0, categorias: {} };
    const topCats = Object.entries(stats.categorias)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, count]) => ({ cat, count }));
    return {
      ...c,
      _resolvidos: stats.resolvidos,
      _cancelados: stats.cancelados,
      _topCats:    topCats,
      _criticas:   criticasPorData[c.data] || 0,
    };
  });

  atualizarCountsChips(cacheCaixas);
  renderLista();
}

function atualizarCountsChips(caixas) {
  const counts = {
    todos:          caixas.length,
    aberto:         caixas.filter(c => c.estado === 'aberto').length,
    em_conferencia: caixas.filter(c => c.estado === 'em_conferencia').length,
    fechado:        caixas.filter(c => c.estado === 'fechado').length,
    arquivado:      caixas.filter(c => c.estado === 'arquivado').length,
  };
  for (const [k, v] of Object.entries(counts)) {
    const el = document.querySelector(`[data-count-for="${k}"]`);
    if (el) el.textContent = String(v);
  }
}

function renderLista() {
  const lista = document.querySelector('#lista-caixas');
  if (!lista || !cacheCaixas) return;

  const filtrados = cacheCaixas.filter(c => {
    if (filtros.estado !== 'todos' && c.estado !== filtros.estado) return false;
    if (filtros.comPendencias && (c.total_pendentes ?? 0) === 0) return false;
    return true;
  });

  if (filtrados.length === 0) {
    lista.innerHTML = `
      <div class="cx2-empty">
        <p class="cx2-empty-title">Nenhum caixa neste recorte.</p>
        <p class="cx2-empty-msg">Mude os filtros pra ver mais.</p>
      </div>`;
    return;
  }

  // Agrupa por mes (cabecalho minusculo entre os blocos)
  const grupos = {};
  for (const c of filtrados) {
    const ym = c.data.slice(0, 7);
    (grupos[ym] = grupos[ym] || []).push(c);
  }
  const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

  lista.innerHTML = Object.entries(grupos).map(([ym, items]) => {
    const [ano, mes] = ym.split('-');
    const rotuloMes = fmtMes.format(new Date(parseInt(ano), parseInt(mes) - 1, 1));
    return `
      <div class="cx2-grupo">
        <h3 class="cx2-grupo-mes">${esc(rotuloMes.replace(/^./, c => c.toUpperCase()))}</h3>
        <ul class="cx2-items" role="list">
          ${items.map((c, i) => itemCaixa(c, i)).join('')}
        </ul>
      </div>`;
  }).join('');
}

function itemCaixa(c, idx) {
  const total = c.total_lancamentos ?? 0;
  const pend  = c.total_pendentes ?? 0;
  const valor = c.total_valor ?? 0;
  const data  = new Date(c.data + 'T00:00:00');
  const dia   = data.getDate();
  const mes   = String(data.getMonth() + 1).padStart(2, '0');
  const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(data).replace('.', '').toLowerCase();
  const ehHoje = isoHoje() === c.data;

  const estadoCfg = {
    aberto:         { rotulo: 'Aberto',         tone: 'ok' },
    em_conferencia: { rotulo: 'Em conferência', tone: 'warn' },
    fechado:        { rotulo: 'Fechado',        tone: 'neutral' },
    arquivado:      { rotulo: 'Arquivado',      tone: 'muted' },
  };
  const e = estadoCfg[c.estado] || { rotulo: c.estado, tone: 'neutral' };
  const delay = `style="animation-delay:${Math.min(idx * 35, 280)}ms"`;

  const rotuloCat = {
    cartao: 'Cartão', pix: 'Pix', dinheiro: 'Dinheiro',
    cancelado: 'Cancelado', cartao_link: 'Link',
    disponivel_retirada: 'Retirar', obs: 'OBS',
  };

  // Chips de top-3 categorias (so se houver lancamentos)
  const chipsCat = c._topCats.map(t => `
    <span class="cx2-item-cat-chip" data-cat="${esc(t.cat)}">
      <span class="cx2-item-cat-rotulo">${esc(rotuloCat[t.cat] || t.cat)}</span>
      <span class="cx2-item-cat-num">${t.count}</span>
    </span>
  `).join('');

  // Detecta "alerta" — caixa com pendencia urgente OU muito acumulo
  // de pendentes (> 5). Forca destaque vermelho.
  const alerta = (c._criticas > 0 || (pend ?? 0) >= 5) ? 'critica' : '';

  return `
    <li>
      <a href="/caixa/${c.data}" data-link class="cx2-item"
         data-estado="${c.estado}" data-alerta="${alerta}" ${delay}>
        <div class="cx2-item-topo">
          <div class="cx2-item-data">
            <div class="cx2-item-dia">${dia}</div>
            <div class="cx2-item-mes">/${mes}</div>
            <div class="cx2-item-semana">${esc(diaSemana)}</div>
            ${ehHoje ? '<div class="cx2-item-marca">hoje</div>' : ''}
          </div>

          <div class="cx2-item-meio">
            <div class="cx2-item-stats">
              <span class="cx2-item-stat">
                <span class="cx2-item-stat-val">${total}</span>
                <span class="cx2-item-stat-lab">lanç.</span>
              </span>
              <span class="cx2-item-stat" data-pend="${pend > 0 ? 'sim' : 'nao'}">
                <span class="cx2-item-stat-val">${pend}</span>
                <span class="cx2-item-stat-lab">pend.</span>
              </span>
              ${c._resolvidos > 0 ? `
                <span class="cx2-item-stat">
                  <span class="cx2-item-stat-val">${c._resolvidos}</span>
                  <span class="cx2-item-stat-lab">resolv.</span>
                </span>` : ''}
            </div>
          </div>

          <div class="cx2-item-direita">
            <span class="cx2-item-badge" data-tone="${e.tone}">${esc(e.rotulo)}</span>
            <span class="cx2-item-valor">${formatBRL(valor)}</span>
          </div>
        </div>

        ${(chipsCat || c._criticas > 0) ? `
          <div class="cx2-item-resumo">
            ${chipsCat ? `<div class="cx2-item-cats">${chipsCat}</div>` : '<span></span>'}
            ${c._criticas > 0 ? `
              <span class="cx2-item-alerta" title="${c._criticas} pendência${c._criticas > 1 ? 's' : ''} crítica${c._criticas > 1 ? 's' : ''}">
                ${svgAlerta()} ${c._criticas} crítica${c._criticas > 1 ? 's' : ''}
              </span>` : ''}
          </div>
        ` : ''}
      </a>
    </li>`;
}

function svgAlerta() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13h13Z"/><path d="M8 6.5v3"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>`;
}

// ───────────────────────────────────────────────────────────────────
// Painel lateral — resumo de pendências
// ───────────────────────────────────────────────────────────────────

async function carregarPainelPendencias() {
  const cont = document.querySelector('#cx2-painel-conteudo');
  const sub  = document.querySelector('#cx2-painel-sub');
  if (!cont) return;

  const { data, error } = await supabase
    .from('pendencia')
    .select('id, numero_nf, cliente_nome, valor_nf, data_caixa, idade_dias_uteis, severidade')
    .order('idade_dias_uteis', { ascending: false })
    .limit(200);

  if (error) {
    cont.innerHTML = `<p class="cx2-empty-msg">Não foi possível carregar.</p>`;
    return;
  }

  cachePendencias = data || [];

  if (cachePendencias.length === 0) {
    if (sub) sub.textContent = 'nenhuma pendência ativa';
    cont.innerHTML = `
      <div class="cx2-painel-vazio">
        <p class="cx2-empty-title">Tudo resolvido.</p>
        <p class="cx2-empty-msg">Nenhuma pendência ativa no momento.</p>
      </div>`;
    return;
  }

  // Buckets por idade
  const total = cachePendencias.length;
  const totalValor = cachePendencias.reduce((s, p) => s + Number(p.valor_nf || 0), 0);
  const urgentes  = cachePendencias.filter(p => p.severidade === 'urgente');
  const avisos    = cachePendencias.filter(p => p.severidade === 'aviso');
  const infos     = cachePendencias.filter(p => p.severidade === 'info' || (!p.severidade));

  // Top 5 dias com mais pendências
  const porDia = {};
  for (const p of cachePendencias) {
    porDia[p.data_caixa] = (porDia[p.data_caixa] || 0) + 1;
  }
  const topDias = Object.entries(porDia)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sub) sub.textContent = `${total} aberta${total > 1 ? 's' : ''} · ${formatBRL(totalValor)} em jogo`;

  cont.innerHTML = `
    <div class="cx2-painel-bucket-grupo">
      ${bucketHtml({ tone: 'danger', rotulo: 'Críticas',   count: urgentes.length, valor: somaValor(urgentes), nota: '> 3 dias úteis' })}
      ${bucketHtml({ tone: 'warn',   rotulo: 'Em atenção', count: avisos.length,   valor: somaValor(avisos),   nota: '1–3 dias úteis' })}
      ${bucketHtml({ tone: 'info',   rotulo: 'Recentes',   count: infos.length,    valor: somaValor(infos),    nota: 'até 1 dia útil' })}
    </div>

    ${urgentes.length > 0 ? `
      <div class="cx2-painel-secao">
        <p class="cx2-painel-secao-title">Mais antigas</p>
        <ul class="cx2-painel-pend" role="list">
          ${urgentes.slice(0, 5).map(itemPendencia).join('')}
        </ul>
      </div>
    ` : ''}

    ${topDias.length > 0 ? `
      <div class="cx2-painel-secao">
        <p class="cx2-painel-secao-title">Dias com mais pendências</p>
        <ul class="cx2-painel-dias" role="list">
          ${topDias.map(([dataIso, count]) => itemDiaPendencia(dataIso, count)).join('')}
        </ul>
      </div>
    ` : ''}
  `;
}

function somaValor(arr) {
  return arr.reduce((s, p) => s + Number(p.valor_nf || 0), 0);
}

function bucketHtml({ tone, rotulo, count, valor, nota }) {
  return `
    <div class="cx2-bucket" data-tone="${tone}" data-zero="${count === 0}">
      <span class="cx2-bucket-num">${count}</span>
      <span class="cx2-bucket-rotulo">${esc(rotulo)}</span>
      <span class="cx2-bucket-nota">${esc(nota)}</span>
      ${valor > 0 ? `<span class="cx2-bucket-valor">${formatBRL(valor)}</span>` : ''}
    </div>`;
}

function itemPendencia(p) {
  const dataCurta = formatDataCurta(p.data_caixa);
  return `
    <li>
      <a href="/caixa/${p.data_caixa}" data-link class="cx2-pend">
        <span class="cx2-pend-nf">NF ${esc(p.numero_nf)}</span>
        <span class="cx2-pend-cliente">${esc(p.cliente_nome)}</span>
        <span class="cx2-pend-idade">${p.idade_dias_uteis}d · ${dataCurta}</span>
      </a>
    </li>`;
}

function itemDiaPendencia(dataIso, count) {
  const dataCurta = formatDataCurta(dataIso);
  return `
    <li>
      <a href="/caixa/${dataIso}" data-link class="cx2-dia-pend">
        <span class="cx2-dia-pend-data">${dataCurta}</span>
        <span class="cx2-dia-pend-bar" aria-hidden="true">
          <span class="cx2-dia-pend-fill" style="width:${Math.min(100, count * 10)}%"></span>
        </span>
        <span class="cx2-dia-pend-count">${count}</span>
      </a>
    </li>`;
}

function formatDataCurta(iso) {
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
}

// ───────────────────────────────────────────────────────────────────
// Skeletons + helpers
// ───────────────────────────────────────────────────────────────────

function listaSkel() {
  return `
    <div class="cx2-grupo">
      ${[1,2,3,4].map(() => `<div class="dash2-skel" style="height:5.5rem;border-radius:10px;margin-bottom:0.55rem"></div>`).join('')}
    </div>`;
}

function painelSkel() {
  return `
    <div class="dash2-skel" style="height:3.5rem;border-radius:10px;margin-bottom:0.5rem"></div>
    <div class="dash2-skel" style="height:3.5rem;border-radius:10px;margin-bottom:0.5rem"></div>
    <div class="dash2-skel" style="height:3.5rem;border-radius:10px"></div>`;
}

function isoHoje() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
