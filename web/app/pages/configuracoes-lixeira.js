// configuracoes-lixeira.js — /configuracoes/lixeira (refator v2).
//
// A lixeira: itens com soft-delete — lançamentos restauráveis (voltam
// pra pendente) e descartes apenas consultáveis (notificações, push).
// Layout em 2 colunas: lista à esquerda, resumo com a legenda de tipos
// (contagem por tipo + balão de explicação no hover) à direita.
//
// Backend: RPC listar_lixeira(p_filtros, p_limit, p_offset)
//          RPC restaurar_lancamento(p_lancamento_id, p_motivo).

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';
import { abrirModal, fecharModal } from '../../components/modal.js';

const POR_PAGINA = 30;
let podeRestaurar = false;
let filtros = {};
let pagina = 1;
let total = 0;

// Catálogo de tipos — rótulo, cor (tom da bolinha) e a explicação que
// aparece no balão ao passar o mouse na legenda.
const TIPOS = [
  { codigo: 'lancamento',        rotulo: 'Lançamento',    tom: 'info',
    desc: 'Lançamentos excluídos — podem voltar pra fila pela restauração.' },
  { codigo: 'notificacao',       rotulo: 'Notificação',   tom: 'warn',
    desc: 'Notificações descartadas — ficam aqui apenas para consulta.' },
  { codigo: 'push_subscription', rotulo: 'Push (device)', tom: '',
    desc: 'Dispositivos de push removidos — apenas para consulta.' },
];
const MAP_TIPO = Object.fromEntries(TIPOS.map(t => [t.codigo, t.rotulo]));

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_LIXEIRA = `<svg ${SVG}><path d="M2.5 4.3h11M6 4.3V2.8h4v1.5M4 4.3l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9"/><path d="M6.6 7v4.3M9.4 7v4.3"/></svg>`;

export async function renderLixeira() {
  await carregarPermissoes();
  if (!temPermissaoSync('lixeira.visualizar')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'lixeira',
      conteudo: `
        <main class="adt">
          <div class="adt-restrito">
            <p class="adt-restrito-title">Acesso restrito</p>
            <p class="adt-restrito-msg">A lixeira é restrita a administradores.</p>
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }
  podeRestaurar = temPermissaoSync('lixeira.restaurar');
  filtros = {};
  pagina = 1;

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'lixeira',
    conteudo: `
    <main id="main" class="adt adt--largo">
      <header class="adt-header">
        <p class="adt-eyebrow">Recuperáveis</p>
        <h1 class="adt-title">Lixeira</h1>
        <p class="adt-sub">
          O que foi excluído — lançamentos podem voltar pra fila, mediante
          justificativa. A restauração também fica registrada na auditoria.
        </p>
      </header>

      <div class="adt-layout">
        <div class="adt-main">
          <section class="adt-filtros">
            <div class="adt-filtros-grid">
              <label class="adt-campo">
                <span class="adt-campo-label">Tipo</span>
                <select id="lix-tipo" class="adt-control">
                  <option value="">Todos</option>
                  ${TIPOS.map(t => `<option value="${t.codigo}">${esc(t.rotulo)}</option>`).join('')}
                </select>
              </label>
              <label class="adt-campo">
                <span class="adt-campo-label">De</span>
                <input type="date" id="lix-ini" class="adt-control">
              </label>
              <label class="adt-campo">
                <span class="adt-campo-label">Até</span>
                <input type="date" id="lix-fim" class="adt-control">
              </label>
              <label class="adt-campo" style="grid-column:1/-1">
                <span class="adt-campo-label">Buscar</span>
                <input type="text" id="lix-busca" class="adt-control" placeholder="rótulo ou detalhe">
              </label>
            </div>
            <div class="adt-filtros-acoes">
              <button type="button" id="lix-limpar" class="adt-btn adt-btn--link">Limpar</button>
              <button type="button" id="lix-aplicar" class="adt-btn adt-btn--primary">Aplicar filtros</button>
            </div>
          </section>

          <section id="lix-conteudo" aria-live="polite"></section>
          <nav id="lix-pag" class="adt-pag" aria-label="Paginação"></nav>
        </div>

        <aside class="adt-resumo">
          <p class="adt-resumo-eyebrow">Resumo</p>
          <div class="adt-resumo-total">
            <span class="adt-resumo-num" id="lix-resumo-num">—</span>
            <span class="adt-resumo-lab">itens no recorte</span>
          </div>
          <div class="adt-resumo-sec">
            <p class="adt-resumo-sec-titulo">Por tipo</p>
            <p class="adt-resumo-sec-dica">Passe o mouse para a explicação. Clique para filtrar.</p>
            <ul class="adt-resumo-legenda">
              ${TIPOS.map(t => `
                <li>
                  <button type="button" class="adt-resumo-acao" data-tipo="${t.codigo}" data-tom="${t.tom}">
                    <span class="adt-resumo-acao-dot" aria-hidden="true"></span>
                    <span class="adt-resumo-acao-nome">${esc(t.rotulo)}</span>
                    <span class="adt-resumo-acao-num">—</span>
                    <span class="adt-resumo-acao-desc" role="tooltip">${esc(t.desc)}</span>
                  </button>
                </li>`).join('')}
            </ul>
          </div>
        </aside>
      </div>
    </main>`,
  });

  ligarShell();
  ligarFiltros();
  await carregar();
  carregarContagens();
}

function ligarFiltros() {
  document.querySelector('#lix-aplicar')?.addEventListener('click', async () => {
    filtros = lerFiltros();
    pagina = 1;
    await carregar();
    carregarContagens();
  });
  document.querySelector('#lix-limpar')?.addEventListener('click', async () => {
    filtros = {};
    pagina = 1;
    ['lix-ini', 'lix-fim', 'lix-busca', 'lix-tipo'].forEach(id => {
      const e = document.querySelector('#' + id); if (e) e.value = '';
    });
    await carregar();
    carregarContagens();
  });
  // Legenda clicável: liga/desliga o filtro daquele tipo.
  document.querySelectorAll('.adt-resumo-acao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = btn.dataset.tipo || '';
      filtros = { ...filtros };
      if (filtros.tipo === t) delete filtros.tipo;
      else filtros.tipo = t;
      pagina = 1;
      await carregar();
    });
  });
}

function lerFiltros() {
  const f = {};
  const t  = document.querySelector('#lix-tipo')?.value;
  const di = document.querySelector('#lix-ini')?.value;
  const df = document.querySelector('#lix-fim')?.value;
  const b  = document.querySelector('#lix-busca')?.value?.trim();
  if (t)  f.tipo = t;
  if (di) f.data_ini = di;
  if (df) f.data_fim = df;
  if (b)  f.busca = b;
  return f;
}

// Sincroniza o select de tipo e a legenda com o filtro ativo.
function refletirTipo() {
  const sel = document.querySelector('#lix-tipo');
  if (sel) sel.value = filtros.tipo || '';
  document.querySelectorAll('.adt-resumo-acao').forEach(b =>
    b.setAttribute('aria-pressed', String((b.dataset.tipo || '') === (filtros.tipo || ''))));
}

async function carregar() {
  const slot = document.querySelector('#lix-conteudo');
  const pag  = document.querySelector('#lix-pag');
  if (!slot || !pag) return;

  slot.innerHTML = `<div class="adt-skel">${[1,2,3,4].map(() => `<div class="adt-skel-item"></div>`).join('')}</div>`;
  pag.innerHTML = '';
  refletirTipo();

  const offset = (pagina - 1) * POR_PAGINA;
  const { data, error } = await supabase.rpc('listar_lixeira', {
    p_filtros: filtros, p_limit: POR_PAGINA, p_offset: offset,
  });

  const fnAusente = error && (
    error.code === 'PGRST202' || error.code === '42883' ||
    /could not find the function|does not exist/i.test(error.message || ''));

  if (error && !fnAusente) {
    slot.innerHTML = `<p class="adt-erro">Não foi possível carregar. ${esc(error.message)}</p>`;
    return;
  }

  total = data?.[0]?.total ?? 0;
  const numEl = document.querySelector('#lix-resumo-num');
  if (numEl) numEl.textContent = total.toLocaleString('pt-BR');

  if (fnAusente || !data || data.length === 0) {
    slot.innerHTML = vazioHtml();
    return;
  }

  slot.innerHTML = `<ul class="adt-trash-lista" role="list">${data.map((r, i) => itemTrash(r, i)).join('')}</ul>`;
  slot.querySelectorAll('[data-restaurar]').forEach(btn => {
    btn.addEventListener('click', () => abrirRestauracao(btn.dataset.restaurar));
  });
  renderPaginacao();
}

// Conta quantos itens há de cada TIPO no recorte (ignorando o filtro de
// tipo — a legenda mostra sempre o quadro completo). 3 consultas leves.
async function carregarContagens() {
  const base = { ...filtros };
  delete base.tipo;
  const res = await Promise.all(TIPOS.map(t =>
    supabase.rpc('listar_lixeira', { p_filtros: { ...base, tipo: t.codigo }, p_limit: 1, p_offset: 0 })
      .then(({ data, error }) => ({ codigo: t.codigo, n: error ? null : (data?.[0]?.total ?? 0) }))
      .catch(() => ({ codigo: t.codigo, n: null }))
  ));
  for (const { codigo, n } of res) {
    const el = document.querySelector(`.adt-resumo-acao[data-tipo="${codigo}"] .adt-resumo-acao-num`);
    if (el) el.textContent = n == null ? '' : n.toLocaleString('pt-BR');
  }
}

function vazioHtml() {
  return `
    <div class="adt-vazio">
      <div class="adt-vazio-icone" aria-hidden="true">${ICON_LIXEIRA}</div>
      <p class="adt-vazio-title">${temFiltro() ? 'Nada com esses filtros.' : 'Lixeira vazia.'}</p>
      <p class="adt-vazio-msg">
        ${temFiltro()
          ? 'Ajuste o tipo, o período ou a busca.'
          : 'Itens excluídos chegam aqui com motivo, autor e o botão de restaurar. Se está vazio, é bom sinal.'}
      </p>
    </div>`;
}

function temFiltro() {
  return !!(filtros.tipo || filtros.data_ini || filtros.data_fim || filtros.busca);
}

function itemTrash(r, i) {
  const delay = `style="animation-delay:${Math.min(i * 45, 400)}ms"`;
  const podeRest = r.restauravel && podeRestaurar && r.tipo === 'lancamento';
  return `
    <li class="adt-trash" ${delay}>
      <div class="adt-trash-corpo">
        <div class="adt-trash-cabec">
          <span class="adt-trash-chip" data-tipo="${esc(r.tipo)}">${esc(MAP_TIPO[r.tipo] || r.tipo)}</span>
          <span class="adt-trash-rotulo">${esc(r.rotulo || '—')}</span>
        </div>
        ${r.detalhe ? `<p class="adt-trash-detalhe">${esc(r.detalhe)}</p>` : ''}
        <div class="adt-trash-meta">
          <time>${esc(formatarTs(r.excluido_em))}</time>
          ${r.excluido_por_email ? `<span>· por <strong>${esc(r.excluido_por_email)}</strong></span>` : ''}
        </div>
        ${r.motivo ? `<p class="adt-trash-motivo">“${esc(r.motivo)}”</p>` : ''}
      </div>
      <div class="adt-trash-acoes">
        ${podeRest
          ? `<button type="button" class="adt-btn adt-btn--primary" data-restaurar="${esc(String(r.id))}">Restaurar</button>`
          : `<span class="adt-trash-locked">arquivado</span>`}
      </div>
    </li>`;
}

function abrirRestauracao(lancamentoId) {
  abrirModal({
    eyebrow: 'Lixeira',
    titulo: 'Restaurar lançamento.',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-3);margin-bottom:1.2rem;line-height:1.55">
        O lançamento volta para o estado <strong style="color:var(--ui-ink)">pendente</strong>,
        pronto para ser re-categorizado. A restauração fica registrada na auditoria.
      </p>
      <form id="form-restaurar" novalidate>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="lix-motivo">Motivo da restauração *
            <span style="font-weight:400;color:var(--ui-ink-3);font-size:0.82rem">(mínimo 10 caracteres)</span>
          </label>
          <textarea id="lix-motivo" class="field-input" rows="3" required minlength="10"
                    style="resize:vertical"
                    placeholder="Ex.: lançamento excluído por engano — é a NF do pedido X, ainda precisa ser categorizada."></textarea>
          <span class="field-underline"></span>
        </div>
      </form>
    `,
    rodape: `
      <div id="lix-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="lix-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="form-restaurar" id="lix-confirmar" class="btn-primary">Restaurar</button>
      </div>`,
  });

  setTimeout(() => document.querySelector('#lix-motivo')?.focus(), 360);
  document.querySelector('#lix-cancelar')?.addEventListener('click', () => fecharModal(false));

  document.querySelector('#form-restaurar')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = document.querySelector('#lix-motivo')?.value?.trim() || '';
    const erroEl = document.querySelector('#lix-erro');
    const btn = document.querySelector('#lix-confirmar');
    erroEl.classList.add('hidden');

    if (motivo.length < 10) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'O motivo precisa ter pelo menos 10 caracteres.';
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase.rpc('restaurar_lancamento', {
      p_lancamento_id: lancamentoId,
      p_motivo: motivo,
    });

    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Não foi possível restaurar: ' + error.message;
      return;
    }

    fecharModal(true);
    mostrarToast('Lançamento restaurado.', 'ok', 2400);
    await carregar();
    carregarContagens();
  });
}

// ─── Paginação numerada ──────────────────────────────────────────────
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

function renderPaginacao() {
  const pag = document.querySelector('#lix-pag');
  if (!pag) return;
  const totalPgs = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (totalPgs <= 1) { pag.innerHTML = ''; return; }

  const nums = listaPaginas(pagina, totalPgs).map(p =>
    p === '…'
      ? '<span class="adt-pag-ell" aria-hidden="true">…</span>'
      : `<button type="button" class="adt-pag-num${p === pagina ? ' is-atual' : ''}" data-pg="${p}"
           ${p === pagina ? 'aria-current="page"' : ''}>${p}</button>`
  ).join('');

  pag.innerHTML = `
    <span class="adt-pag-info">
      <strong>${total}</strong> ${total === 1 ? 'item' : 'itens'}
      · página <strong>${pagina}</strong> de <strong>${totalPgs}</strong>
    </span>
    <div class="adt-pag-nums">
      <button type="button" class="adt-pag-seta" data-pg="prev" ${pagina <= 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>
      ${nums}
      <button type="button" class="adt-pag-seta" data-pg="next" ${pagina >= totalPgs ? 'disabled' : ''} aria-label="Próxima">›</button>
    </div>`;

  pag.querySelectorAll('[data-pg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.pg;
      const totalPgs2 = Math.max(1, Math.ceil(total / POR_PAGINA));
      if (v === 'prev')      pagina = Math.max(1, pagina - 1);
      else if (v === 'next') pagina = Math.min(totalPgs2, pagina + 1);
      else                   pagina = Math.min(totalPgs2, Math.max(1, parseInt(v, 10)));
      await carregar();
      document.querySelector('#main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function formatarTs(ts) {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts));
  } catch (_) { return String(ts); }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
