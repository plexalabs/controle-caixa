// configuracoes-auditoria.js — /configuracoes/auditoria (refator v2).
//
// Linha do tempo forense (esquerda) + resumo com legenda das ações
// (direita, clicável pra filtrar). Cada evento abre um "delta amigável"
// num modal centralizado: a diferença campo a campo, legível, com o
// JSON cru disponível num detalhe expansível.
//
// Backend: RPC listar_auditoria(p_filtros, p_limit, p_offset).

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';
import { abrirModal } from '../../components/modal.js';

const POR_PAGINA = 30;
let filtros = {};
let pagina = 1;
let total = 0;

// Catálogo de ENTIDADES — o "ponto" onde a ação aconteceu.
const ENTIDADES = [
  { codigo: 'lancamento',              rotulo: 'Lançamento' },
  { codigo: 'lancamento_observacao',   rotulo: 'Observação' },
  { codigo: 'caixa',                   rotulo: 'Caixa' },
  { codigo: 'notificacao',             rotulo: 'Notificação' },
  { codigo: 'push_subscription',       rotulo: 'Push (device)' },
  { codigo: 'config',                  rotulo: 'Configuração' },
  { codigo: 'vendedora',               rotulo: 'Vendedora' },
  { codigo: 'feriado',                 rotulo: 'Feriado' },
  { codigo: 'perfil',                  rotulo: 'Perfil (RBAC)' },
  { codigo: 'perfil_permissao',        rotulo: 'Permissão de perfil' },
  { codigo: 'usuario_perfil',          rotulo: 'Perfil de usuário' },
  { codigo: 'usuario_permissao_extra', rotulo: 'Permissão extra' },
];

// Catálogo de AÇÕES — com tom (cor da bolinha) e descrição (legenda).
const ACOES = [
  { codigo: 'INSERT',          rotulo: 'Criação',             tom: 'info',   desc: 'Um registro novo entrou no sistema.' },
  { codigo: 'UPDATE',          rotulo: 'Edição',              tom: 'warn',   desc: 'Um registro existente teve campos alterados.' },
  { codigo: 'SOFT_DELETE',     rotulo: 'Exclusão',            tom: 'danger', desc: 'Item mandado para a lixeira — ainda recuperável.' },
  { codigo: 'DELETE',          rotulo: 'Exclusão definitiva', tom: 'danger', desc: 'Item removido em definitivo, sem volta.' },
  { codigo: 'RESTAURACAO',     rotulo: 'Restauração',         tom: 'accent', desc: 'Item recuperado da lixeira e devolvido à fila.' },
  { codigo: 'LOGIN',           rotulo: 'Entrada',             tom: '',       desc: 'Um usuário entrou no sistema.' },
  { codigo: 'LOGOUT',          rotulo: 'Saída',               tom: '',       desc: 'Um usuário encerrou a sessão.' },
  { codigo: 'RPC',             rotulo: 'Operação de sistema', tom: '',       desc: 'Uma rotina interna foi executada.' },
  { codigo: 'PUSH_ENVIADO',    rotulo: 'Push enviado',        tom: 'info',   desc: 'Uma notificação foi disparada a um dispositivo.' },
  { codigo: 'CONFIG_ALTERADA', rotulo: 'Configuração',        tom: 'warn',   desc: 'Um ajuste global do sistema foi alterado.' },
];
const MAP_ACAO = Object.fromEntries(ACOES.map(a => [a.codigo, a]));
const MAP_ENT  = Object.fromEntries(ENTIDADES.map(e => [e.codigo, e.rotulo]));

// Campos ignorados no delta amigável — ids e carimbos internos que não
// dizem nada ao leitor (o JSON cru, no detalhe, mostra tudo).
const CAMPOS_OCULTOS = new Set([
  'id', 'criado_em', 'atualizado_em', 'criado_por', 'atualizado_por', 'hash_conteudo',
]);
const CAMPO_ROTULO = {
  numero_nf: 'Número da NF', codigo_pedido: 'Código do pedido', cliente_nome: 'Cliente',
  valor_nf: 'Valor', categoria: 'Categoria', estado: 'Estado',
  dados_categoria: 'Detalhes do pagamento', data_caixa: 'Data do caixa', data: 'Data',
  titulo: 'Título', mensagem: 'Mensagem', texto: 'Texto', severidade: 'Severidade',
  tipo: 'Tipo', fonte: 'Fonte', lida_em: 'Lida em', descartada_em: 'Descartada em',
  resolvido_em: 'Resolvido em', nome: 'Nome', apelido: 'Apelido', ativa: 'Ativa',
  ativo: 'Ativo', email: 'E-mail', chave: 'Chave', valor: 'Valor', motivo: 'Motivo',
  observacao: 'Observação', autor_email: 'Autor', descricao: 'Descrição',
};

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_SETA = `<svg viewBox="0 0 14 11" fill="none"><path d="M1 5.5h11M8 1l4 4.5L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_LUPA = `<svg ${SVG}><rect x="3" y="2.8" width="10" height="11.2" rx="1.6"/><path d="M5.6 8.4 7.1 9.9 10.4 6.6"/></svg>`;

export async function renderAuditoria() {
  await carregarPermissoes();
  if (!temPermissaoSync('auditoria.visualizar')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'auditoria',
      conteudo: `
        <main class="adt">
          <div class="adt-restrito">
            <p class="adt-restrito-title">Acesso restrito</p>
            <p class="adt-restrito-msg">A linha do tempo de auditoria é restrita a administradores.</p>
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  filtros = {};
  pagina = 1;

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'auditoria',
    conteudo: `
    <main id="main" class="adt adt--largo">
      <header class="adt-header">
        <p class="adt-eyebrow">Forense</p>
        <h1 class="adt-title">Auditoria</h1>
        <p class="adt-sub">
          Tudo deixa rastro. Cada ação registrada com data, autor, motivo
          e o delta exato — do antes ao depois.
        </p>
      </header>

      <div class="adt-layout">
        <div class="adt-main">
          <section class="adt-filtros">
            <div class="adt-filtros-grid">
              <label class="adt-campo">
                <span class="adt-campo-label">De</span>
                <input type="date" id="adt-ini" class="adt-control">
              </label>
              <label class="adt-campo">
                <span class="adt-campo-label">Até</span>
                <input type="date" id="adt-fim" class="adt-control">
              </label>
              <label class="adt-campo">
                <span class="adt-campo-label">Entidade</span>
                <select id="adt-entidade" class="adt-control">
                  <option value="">Todas</option>
                  ${ENTIDADES.map(e => `<option value="${e.codigo}">${esc(e.rotulo)}</option>`).join('')}
                </select>
              </label>
              <label class="adt-campo">
                <span class="adt-campo-label">Ação</span>
                <select id="adt-acao" class="adt-control">
                  <option value="">Todas</option>
                  ${ACOES.map(a => `<option value="${a.codigo}">${esc(a.rotulo)}</option>`).join('')}
                </select>
              </label>
              <label class="adt-campo" style="grid-column:1/-1">
                <span class="adt-campo-label">Buscar (motivo ou e-mail)</span>
                <input type="text" id="adt-busca" class="adt-control"
                       placeholder="ex.: cancelamento, joao@…">
              </label>
            </div>
            <div class="adt-filtros-acoes">
              <button type="button" id="adt-limpar" class="adt-btn adt-btn--link">Limpar</button>
              <button type="button" id="adt-aplicar" class="adt-btn adt-btn--primary">Aplicar filtros</button>
            </div>
          </section>

          <section id="adt-conteudo" aria-live="polite"></section>
          <nav id="adt-pag" class="adt-pag" aria-label="Paginação"></nav>
        </div>

        <aside class="adt-resumo">
          <p class="adt-resumo-eyebrow">Resumo</p>
          <div class="adt-resumo-total">
            <span class="adt-resumo-num" id="adt-resumo-num">—</span>
            <span class="adt-resumo-lab">registros no recorte</span>
          </div>
          <div class="adt-resumo-sec">
            <p class="adt-resumo-sec-titulo">Legenda das ações</p>
            <p class="adt-resumo-sec-dica">A cor da bolinha na linha do tempo. Clique para filtrar.</p>
            <ul class="adt-resumo-legenda">
              ${ACOES.map(a => `
                <li>
                  <button type="button" class="adt-resumo-acao" data-acao="${a.codigo}" data-tom="${a.tom}">
                    <span class="adt-resumo-acao-dot" aria-hidden="true"></span>
                    <span class="adt-resumo-acao-nome">${esc(a.rotulo)}</span>
                    <span class="adt-resumo-acao-num">—</span>
                    <span class="adt-resumo-acao-desc" role="tooltip">${esc(a.desc)}</span>
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
  document.querySelector('#adt-aplicar')?.addEventListener('click', async () => {
    filtros = lerFiltros();
    pagina = 1;
    await carregar();
    carregarContagens();
  });
  document.querySelector('#adt-limpar')?.addEventListener('click', async () => {
    filtros = {};
    pagina = 1;
    ['adt-ini', 'adt-fim', 'adt-busca', 'adt-entidade', 'adt-acao'].forEach(id => {
      const e = document.querySelector('#' + id); if (e) e.value = '';
    });
    await carregar();
    carregarContagens();
  });
  // Legenda clicável: liga/desliga o filtro daquela ação.
  document.querySelectorAll('.adt-resumo-acao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = btn.dataset.acao || '';
      filtros = { ...filtros };
      if (filtros.acao === a) delete filtros.acao;
      else filtros.acao = a;
      pagina = 1;
      await carregar();
    });
  });
}

function lerFiltros() {
  const f = {};
  const di = document.querySelector('#adt-ini')?.value;
  const df = document.querySelector('#adt-fim')?.value;
  const e  = document.querySelector('#adt-entidade')?.value;
  const a  = document.querySelector('#adt-acao')?.value;
  const b  = document.querySelector('#adt-busca')?.value?.trim();
  if (di) f.data_ini = di;
  if (df) f.data_fim = df;
  if (e)  f.entidade = e;
  if (a)  f.acao = a;
  if (b)  f.busca = b;
  return f;
}

// Sincroniza o select de ação e a legenda com o filtro ativo.
function refletirAcao() {
  const sel = document.querySelector('#adt-acao');
  if (sel) sel.value = filtros.acao || '';
  document.querySelectorAll('.adt-resumo-acao').forEach(b =>
    b.setAttribute('aria-pressed', String((b.dataset.acao || '') === (filtros.acao || ''))));
}

async function carregar() {
  const slot = document.querySelector('#adt-conteudo');
  const pag  = document.querySelector('#adt-pag');
  if (!slot || !pag) return;

  slot.innerHTML = `<div class="adt-skel">${[1,2,3,4,5].map(() => `<div class="adt-skel-item"></div>`).join('')}</div>`;
  pag.innerHTML = '';
  refletirAcao();

  const offset = (pagina - 1) * POR_PAGINA;
  const { data, error } = await supabase.rpc('listar_auditoria', {
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
  const numEl = document.querySelector('#adt-resumo-num');
  if (numEl) numEl.textContent = total.toLocaleString('pt-BR');

  if (fnAusente || !data || data.length === 0) {
    slot.innerHTML = vazioHtml();
    return;
  }

  slot.innerHTML = `<ol class="adt-timeline" role="list">${data.map((r, i) => itemRow(r, i)).join('')}</ol>`;
  slot.querySelectorAll('[data-delta]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = data.find(x => String(x.id) === btn.dataset.delta);
      if (r) abrirDelta(r);
    });
  });
  renderPaginacao();
}

function vazioHtml() {
  return `
    <div class="adt-vazio">
      <div class="adt-vazio-icone" aria-hidden="true">${ICON_LUPA}</div>
      <p class="adt-vazio-title">${temFiltro() ? 'Sem eventos para esses filtros.' : 'Nada registrado ainda.'}</p>
      <p class="adt-vazio-msg">
        ${temFiltro()
          ? 'Ajuste o período, a entidade ou a ação — todo evento daqui pra frente é capturado.'
          : 'Assim que alguém registrar uma ação no sistema, ela aparece aqui na linha do tempo.'}
      </p>
    </div>`;
}

function temFiltro() {
  return !!(filtros.data_ini || filtros.data_fim || filtros.entidade || filtros.acao || filtros.busca);
}

// Conta quantos registros há de cada AÇÃO no recorte (ignorando o
// filtro de ação — a legenda mostra sempre o quadro completo). São 10
// consultas leves em paralelo; os números preenchem quando chegam.
async function carregarContagens() {
  const base = { ...filtros };
  delete base.acao;
  const res = await Promise.all(ACOES.map(a =>
    supabase.rpc('listar_auditoria', { p_filtros: { ...base, acao: a.codigo }, p_limit: 1, p_offset: 0 })
      .then(({ data, error }) => ({ codigo: a.codigo, n: error ? null : (data?.[0]?.total ?? 0) }))
      .catch(() => ({ codigo: a.codigo, n: null }))
  ));
  for (const { codigo, n } of res) {
    const el = document.querySelector(`.adt-resumo-acao[data-acao="${codigo}"] .adt-resumo-acao-num`);
    if (el) el.textContent = n == null ? '' : n.toLocaleString('pt-BR');
  }
}

function itemRow(r, i) {
  const a = MAP_ACAO[r.acao];
  const autor = r.usuario_email_snapshot
    ? `<strong>${esc(r.usuario_email_snapshot)}</strong>`
    : '<em>sistema</em>';
  const delay = `style="animation-delay:${Math.min(i * 32, 360)}ms"`;
  return `
    <li class="adt-row" data-tom="${a?.tom || ''}" ${delay}>
      <span class="adt-row-dot" aria-hidden="true"></span>
      <div class="adt-row-corpo">
        <div class="adt-row-head">
          <span class="adt-row-acao">${esc(a?.rotulo || r.acao)}</span>
          <span class="adt-row-ent">${esc(MAP_ENT[r.entidade] || r.entidade)}</span>
          ${r.entidade_id ? `<span class="adt-row-id">${esc(String(r.entidade_id).slice(0, 8))}</span>` : ''}
          <time class="adt-row-tempo" title="${esc(r.ts)}">${esc(formatarTs(r.ts))}</time>
        </div>
        <p class="adt-row-autor">por ${autor}</p>
        ${r.motivo ? `<p class="adt-row-motivo">${esc(r.motivo)}</p>` : ''}
        <button type="button" class="adt-row-delta" data-delta="${esc(String(r.id))}">
          Ver delta ${ICON_SETA}
        </button>
      </div>
    </li>`;
}

// ─── Delta amigável ──────────────────────────────────────────────────
function camposDiff(r) {
  const antes  = r.dados_antes  && typeof r.dados_antes  === 'object' ? r.dados_antes  : null;
  const depois = r.dados_depois && typeof r.dados_depois === 'object' ? r.dados_depois : null;
  const visivel = (k) => !CAMPOS_OCULTOS.has(k);

  if (antes && depois) {
    const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(visivel);
    return chaves
      .filter(k => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
      .map(k => ({ campo: k, de: antes[k], para: depois[k], tipo: 'mudou' }));
  }
  if (depois) {
    return Object.keys(depois).filter(visivel)
      .filter(k => depois[k] !== null && depois[k] !== '')
      .map(k => ({ campo: k, para: depois[k], tipo: 'criou' }));
  }
  if (antes) {
    return Object.keys(antes).filter(visivel)
      .filter(k => antes[k] !== null && antes[k] !== '')
      .map(k => ({ campo: k, de: antes[k], tipo: 'removeu' }));
  }
  return [];
}

function rotuloCampo(k) {
  return CAMPO_ROTULO[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function formatarValorCampo(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return new Intl.NumberFormat('pt-BR').format(v);
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(new Date(s));
    } catch (_) {}
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
        .format(new Date(s + 'T00:00'));
    } catch (_) {}
  }
  return s;
}

function campoDeltaHtml(d) {
  if (d.tipo === 'mudou') {
    return `
      <li class="adt-delta-campo">
        <span class="adt-delta-rotulo">${esc(rotuloCampo(d.campo))}</span>
        <span class="adt-delta-troca">
          <span class="adt-delta-de">${esc(formatarValorCampo(d.de))}</span>
          <span class="adt-delta-arrow" aria-hidden="true">→</span>
          <span class="adt-delta-para">${esc(formatarValorCampo(d.para))}</span>
        </span>
      </li>`;
  }
  const val = d.tipo === 'criou' ? d.para : d.de;
  return `
    <li class="adt-delta-campo">
      <span class="adt-delta-rotulo">${esc(rotuloCampo(d.campo))}</span>
      <span class="adt-delta-valor">${esc(formatarValorCampo(val))}</span>
    </li>`;
}

function abrirDelta(r) {
  const a = MAP_ACAO[r.acao];
  const diff = camposDiff(r);
  const temAntes = r.dados_antes && typeof r.dados_antes === 'object';
  const temDepois = r.dados_depois && typeof r.dados_depois === 'object';

  let deltaBloco;
  if (!diff.length) {
    deltaBloco = `<p class="adt-delta-vazio">Este evento não traz alterações de campos para detalhar.</p>`;
  } else {
    const titulo = (temAntes && temDepois)
      ? `${diff.length} ${diff.length === 1 ? 'campo alterado' : 'campos alterados'}`
      : temDepois ? 'Valores do registro criado'
      : 'Valores do registro removido';
    deltaBloco = `
      <p class="adt-delta-titulo">${titulo}</p>
      <ul class="adt-delta-lista">${diff.map(campoDeltaHtml).join('')}</ul>`;
  }

  const ref = abrirModal({
    eyebrow: 'Forense · Delta',
    titulo: `${a?.rotulo || r.acao} · ${MAP_ENT[r.entidade] || r.entidade}`,
    conteudo: `
      <dl class="adt-modal-meta">
        <dt>Quando</dt><dd>${esc(formatarTs(r.ts))}</dd>
        <dt>Autor</dt><dd>${esc(r.usuario_email_snapshot || 'sistema')}</dd>
        <dt>Registro</dt><dd><code>${esc(String(r.entidade_id || '—'))}</code></dd>
        ${r.motivo ? `<dt>Motivo</dt><dd class="adt-modal-motivo">“${esc(r.motivo)}”</dd>` : ''}
        ${r.ip ? `<dt>IP</dt><dd><code>${esc(r.ip)}</code></dd>` : ''}
      </dl>
      ${deltaBloco}
      <details class="adt-delta-cru">
        <summary>Ver dados brutos (JSON)</summary>
        <p class="adt-modal-h">Antes</p>
        <pre class="adt-modal-pre">${esc(temAntes ? JSON.stringify(r.dados_antes, null, 2) : '—')}</pre>
        <p class="adt-modal-h">Depois</p>
        <pre class="adt-modal-pre">${esc(temDepois ? JSON.stringify(r.dados_depois, null, 2) : '—')}</pre>
      </details>
    `,
  });
  // Modal um pouco mais largo que o padrão — pro delta respirar.
  ref?.elemento?.querySelector('.modal-card')?.classList.add('adt-delta-card');
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
  const pag = document.querySelector('#adt-pag');
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
      <strong>${total}</strong> ${total === 1 ? 'registro' : 'registros'}
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
