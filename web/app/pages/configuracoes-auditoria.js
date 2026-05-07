// configuracoes-auditoria.js — /configuracoes/auditoria
//
// Tela com duas abas:
//   1. Linha do tempo (default) — log forense, item por item, com filtros
//      (data, usuário, entidade, ação, busca).
//   2. Lixeira — soft-deletes restauráveis (lançamentos) ou apenas
//      consultáveis (notificações descartadas, push subs removidas).
//
// Aesthetic: editorial-forense. Display Fraunces no título + tipografia
// mono (Manrope mono fallback) para IDs/timestamps; bullet de cor por
// ação (verde=insert, ouro=update, vermelho=delete/soft, azul=restauro).

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';
import { abrirModal, fecharModal } from '../../components/modal.js';

const POR_PAGINA = 30;

let abaAtual = 'log';        // 'log' | 'lixeira'
let podeRestaurar = false;
let filtros = {};
let pagina = 1;
let total = 0;

const ENTIDADES = [
  'lancamento', 'lancamento_observacao', 'caixa', 'notificacao',
  'push_subscription', 'config', 'vendedora', 'feriado',
  'perfil', 'perfil_permissao', 'usuario_perfil', 'usuario_permissao_extra',
];

const ACOES = [
  'INSERT', 'UPDATE', 'DELETE',
  'SOFT_DELETE', 'RESTAURACAO',
  'LOGIN', 'LOGOUT', 'RPC', 'PUSH_ENVIADO', 'CONFIG_ALTERADA',
];

export async function renderAuditoria() {
  await carregarPermissoes();
  const podeVerLog     = temPermissaoSync('auditoria.visualizar');
  const podeVerLixeira = temPermissaoSync('lixeira.visualizar');
  podeRestaurar        = temPermissaoSync('lixeira.restaurar');

  if (!podeVerLog && !podeVerLixeira) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'config',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
          <div class="alert mt-6">Esta seção é restrita a administradores.</div>
        </main>`,
    });
    ligarShell();
    return;
  }

  // Aba inicial: log se tem permissão, senão lixeira
  abaAtual = podeVerLog ? 'log' : 'lixeira';

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="aud-main">
      <nav class="aud-breadcrumb reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link">← Configurações</a>
      </nav>

      <header class="aud-cabec reveal reveal-2">
        <p class="h-eyebrow">Auditoria · Forense</p>
        <h1 class="aud-titulo">Tudo deixa rastro.</h1>
        <p class="aud-sub">
          Cada ação registrada com data, hora, autor, motivo e o
          delta exato. Restaurar exige justificativa — que também vai
          pro log.
        </p>
      </header>

      <div class="aud-tabs reveal reveal-3" role="tablist">
        ${podeVerLog ? `
          <button class="aud-tab" role="tab" data-aba="log"
                  aria-selected="${abaAtual === 'log'}">
            <span class="aud-tab-num">01</span>
            <span class="aud-tab-rotulo">Linha do tempo</span>
          </button>` : ''}
        ${podeVerLixeira ? `
          <button class="aud-tab" role="tab" data-aba="lixeira"
                  aria-selected="${abaAtual === 'lixeira'}">
            <span class="aud-tab-num">02</span>
            <span class="aud-tab-rotulo">Lixeira</span>
          </button>` : ''}
      </div>

      <section id="aud-filtros" class="aud-filtros reveal reveal-4"></section>
      <section id="aud-conteudo" class="aud-conteudo reveal reveal-5"></section>
      <nav id="aud-pag" class="aud-pag reveal reveal-6" aria-label="Paginação"></nav>
    </main>`,
  });

  ligarShell();
  ligarTabs();
  renderFiltros();
  await carregar();
}

function ligarTabs() {
  document.querySelectorAll('.aud-tab').forEach(b => {
    b.addEventListener('click', async () => {
      const novo = b.dataset.aba;
      if (novo === abaAtual) return;
      abaAtual = novo;
      pagina = 1;
      filtros = {};
      document.querySelectorAll('.aud-tab').forEach(x => {
        x.setAttribute('aria-selected', String(x.dataset.aba === novo));
      });
      renderFiltros();
      await carregar();
    });
  });
}

function renderFiltros() {
  const slot = document.querySelector('#aud-filtros');
  if (!slot) return;

  if (abaAtual === 'log') {
    slot.innerHTML = `
      <div class="aud-filtros-grid">
        <label class="aud-field">
          <span class="aud-field-label">De</span>
          <input type="date" id="f-data-ini" class="aud-input" value="${filtros.data_ini || ''}">
        </label>
        <label class="aud-field">
          <span class="aud-field-label">Até</span>
          <input type="date" id="f-data-fim" class="aud-input" value="${filtros.data_fim || ''}">
        </label>
        <label class="aud-field">
          <span class="aud-field-label">Entidade</span>
          <select id="f-entidade" class="aud-input">
            <option value="">Todas</option>
            ${ENTIDADES.map(e => `<option value="${e}" ${filtros.entidade === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </label>
        <label class="aud-field">
          <span class="aud-field-label">Ação</span>
          <select id="f-acao" class="aud-input">
            <option value="">Todas</option>
            ${ACOES.map(a => `<option value="${a}" ${filtros.acao === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </label>
        <label class="aud-field aud-field--wide">
          <span class="aud-field-label">Buscar (motivo / e-mail)</span>
          <input type="text" id="f-busca" class="aud-input" value="${esc(filtros.busca || '')}" placeholder="ex: cancelamento, joaonora@...">
        </label>
        <div class="aud-filtros-acoes">
          <button id="f-aplicar" class="vd-card-btn">Aplicar</button>
          <button id="f-limpar"  class="vd-card-btn">Limpar</button>
        </div>
      </div>`;
  } else {
    slot.innerHTML = `
      <div class="aud-filtros-grid">
        <label class="aud-field">
          <span class="aud-field-label">Tipo</span>
          <select id="f-tipo" class="aud-input">
            <option value="">Todos</option>
            <option value="lancamento"        ${filtros.tipo === 'lancamento' ? 'selected' : ''}>Lançamento</option>
            <option value="notificacao"       ${filtros.tipo === 'notificacao' ? 'selected' : ''}>Notificação</option>
            <option value="push_subscription" ${filtros.tipo === 'push_subscription' ? 'selected' : ''}>Push (device)</option>
          </select>
        </label>
        <label class="aud-field">
          <span class="aud-field-label">De</span>
          <input type="date" id="f-data-ini" class="aud-input" value="${filtros.data_ini || ''}">
        </label>
        <label class="aud-field">
          <span class="aud-field-label">Até</span>
          <input type="date" id="f-data-fim" class="aud-input" value="${filtros.data_fim || ''}">
        </label>
        <label class="aud-field aud-field--wide">
          <span class="aud-field-label">Buscar</span>
          <input type="text" id="f-busca" class="aud-input" value="${esc(filtros.busca || '')}" placeholder="rótulo ou detalhe">
        </label>
        <div class="aud-filtros-acoes">
          <button id="f-aplicar" class="vd-card-btn">Aplicar</button>
          <button id="f-limpar"  class="vd-card-btn">Limpar</button>
        </div>
      </div>`;
  }

  document.querySelector('#f-aplicar')?.addEventListener('click', async () => {
    filtros = lerFiltros();
    pagina = 1;
    await carregar();
  });
  document.querySelector('#f-limpar')?.addEventListener('click', async () => {
    filtros = {};
    pagina = 1;
    renderFiltros();
    await carregar();
  });
}

function lerFiltros() {
  const f = {};
  const di = document.querySelector('#f-data-ini')?.value;
  const df = document.querySelector('#f-data-fim')?.value;
  const e  = document.querySelector('#f-entidade')?.value;
  const a  = document.querySelector('#f-acao')?.value;
  const t  = document.querySelector('#f-tipo')?.value;
  const b  = document.querySelector('#f-busca')?.value?.trim();
  if (di) f.data_ini = di;
  if (df) f.data_fim = df;
  if (e)  f.entidade = e;
  if (a)  f.acao = a;
  if (t)  f.tipo = t;
  if (b)  f.busca = b;
  return f;
}

async function carregar() {
  const slot = document.querySelector('#aud-conteudo');
  const pag  = document.querySelector('#aud-pag');
  if (!slot || !pag) return;

  slot.innerHTML = `
    <div class="aud-skel">
      ${[1,2,3,4,5,6].map(() => `<div class="skel" style="height:5rem;border-radius:8px;margin-bottom:0.6rem"></div>`).join('')}
    </div>`;
  pag.innerHTML = '';

  const offset = (pagina - 1) * POR_PAGINA;
  const rpc = abaAtual === 'log' ? 'listar_auditoria' : 'listar_lixeira';
  const { data, error } = await supabase.rpc(rpc, {
    p_filtros: filtros,
    p_limit:   POR_PAGINA,
    p_offset:  offset,
  });

  if (error) {
    slot.innerHTML = `<p class="alert">Não consegui carregar: ${esc(error.message)}</p>`;
    return;
  }

  total = data?.[0]?.total ?? 0;

  if (!data || data.length === 0) {
    slot.innerHTML = `
      <div class="aud-vazio">
        <p class="aud-vazio-titulo">Sem registros.</p>
        <p class="aud-vazio-desc">${abaAtual === 'log'
          ? 'Mude os filtros ou aguarde — todo evento daqui pra frente é capturado.'
          : 'Nada foi excluído ainda. Se ficar muito vazio, é bom sinal.'}</p>
      </div>`;
    return;
  }

  if (abaAtual === 'log') {
    slot.innerHTML = `<ol class="aud-timeline" role="list">${data.map(itemLog).join('')}</ol>`;
    ligarLog(slot, data);
  } else {
    slot.innerHTML = `<ul class="aud-lixeira" role="list">${data.map(itemLixeira).join('')}</ul>`;
    ligarLixeira(slot);
  }

  renderPaginacao();
}

function itemLog(r) {
  const cor   = corDaAcao(r.acao);
  const dt    = formatarTs(r.ts);
  const motivoBlock = r.motivo
    ? `<p class="aud-row-motivo">“${esc(r.motivo)}”</p>` : '';
  const autor = r.usuario_email_snapshot || '<i>sistema</i>';
  return `
    <li class="aud-row" data-id="${r.id}" data-acao="${esc(r.acao)}">
      <span class="aud-row-bullet" style="--aud-bullet:${cor}" aria-hidden="true"></span>
      <div class="aud-row-corpo">
        <div class="aud-row-meta">
          <span class="aud-row-acao" style="--aud-bullet:${cor}">${esc(r.acao)}</span>
          <span class="aud-row-entidade">${esc(r.entidade)}</span>
          ${r.entidade_id ? `<code class="aud-row-id">${esc(String(r.entidade_id).slice(0, 8))}…</code>` : ''}
          <time class="aud-row-tempo" title="${esc(r.ts)}">${dt}</time>
        </div>
        <div class="aud-row-autor">por <strong>${autor}</strong></div>
        ${motivoBlock}
        <button class="aud-row-detalhes" data-acao-row="abrir-detalhes">ver delta</button>
      </div>
    </li>`;
}

function itemLixeira(r) {
  const dt = formatarTs(r.excluido_em);
  return `
    <li class="aud-trash" data-id="${esc(r.id)}" data-tipo="${esc(r.tipo)}">
      <div class="aud-trash-corpo">
        <div class="aud-trash-cabec">
          <span class="aud-trash-chip" data-tipo="${esc(r.tipo)}">${rotuloTipo(r.tipo)}</span>
          <strong class="aud-trash-rotulo">${esc(r.rotulo || '—')}</strong>
        </div>
        <p class="aud-trash-detalhe">${esc(r.detalhe || '')}</p>
        <div class="aud-trash-meta">
          <time>${dt}</time>
          ${r.excluido_por_email ? `<span>por <strong>${esc(r.excluido_por_email)}</strong></span>` : ''}
          ${r.motivo ? `<span class="aud-trash-motivo">“${esc(r.motivo)}”</span>` : ''}
        </div>
      </div>
      <div class="aud-trash-acoes">
        ${r.restauravel && podeRestaurar
          ? `<button class="vd-card-btn" data-acao-row="restaurar">Restaurar</button>`
          : `<span class="aud-trash-locked" title="Sem restauração disponível">arquivado</span>`}
      </div>
    </li>`;
}

function rotuloTipo(t) {
  return ({ lancamento: 'Lançamento',
            notificacao: 'Notificação',
            push_subscription: 'Push' })[t] || t;
}

function corDaAcao(a) {
  return ({
    INSERT:        'var(--c-musgo)',
    UPDATE:        '#a07b1c',
    DELETE:        'var(--c-alerta)',
    SOFT_DELETE:   'var(--c-alerta)',
    RESTAURACAO:   '#2962a3',
    LOGIN:         'var(--c-tinta-3)',
    LOGOUT:        'var(--c-tinta-3)',
    RPC:           'var(--c-musgo-3)',
    PUSH_ENVIADO:  '#6a3aa0',
    CONFIG_ALTERADA: '#a07b1c',
  })[a] || 'var(--c-tinta-3)';
}

function ligarLog(slot, data) {
  slot.querySelectorAll('[data-acao-row="abrir-detalhes"]').forEach(b => {
    b.addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      const id = parseInt(li?.dataset.id || '0', 10);
      const r  = data.find(x => x.id === id);
      if (r) abrirDetalhesLog(r);
    });
  });
}

function abrirDetalhesLog(r) {
  abrirModal({
    eyebrow: 'Forense',
    titulo: `${r.acao} · ${r.entidade}`,
    lateral: true,
    conteudo: `
      <div class="aud-modal">
        <dl class="aud-modal-meta">
          <dt>Quando</dt><dd>${esc(r.ts)}</dd>
          <dt>Autor</dt><dd>${esc(r.usuario_email_snapshot || 'sistema')}</dd>
          <dt>Registro</dt><dd><code>${esc(String(r.entidade_id || '—'))}</code></dd>
          ${r.motivo ? `<dt>Motivo</dt><dd>“${esc(r.motivo)}”</dd>` : ''}
          ${r.ip ? `<dt>IP</dt><dd><code>${esc(r.ip)}</code></dd>` : ''}
        </dl>
        <h4 class="aud-modal-h">Antes</h4>
        <pre class="aud-modal-pre">${esc(JSON.stringify(r.dados_antes, null, 2)) || '—'}</pre>
        <h4 class="aud-modal-h">Depois</h4>
        <pre class="aud-modal-pre">${esc(JSON.stringify(r.dados_depois, null, 2)) || '—'}</pre>
      </div>`,
  });
}

function ligarLixeira(slot) {
  slot.querySelectorAll('[data-acao-row="restaurar"]').forEach(b => {
    b.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-id]');
      const id = li?.dataset.id;
      const tipo = li?.dataset.tipo;
      if (!id || tipo !== 'lancamento') return;
      abrirRestauracao(id);
    });
  });
}

function abrirRestauracao(lancamentoId) {
  abrirModal({
    eyebrow: 'Lixeira',
    titulo: 'Restaurar lançamento',
    conteudo: `
      <div class="aud-restaurar">
        <p>Volta o lançamento pro estado <strong>pendente</strong> pra
        re-categorização. A restauração também fica registrada no log.</p>
        <label class="aud-field aud-field--wide" style="margin-top:1rem">
          <span class="aud-field-label">Motivo (mínimo 10 caracteres)</span>
          <textarea id="r-motivo" class="aud-input" rows="3"
                    placeholder="Ex: lançamento foi excluído por engano, é a NF do pedido X que ainda precisa ser categorizada."></textarea>
        </label>
        <div style="display:flex;gap:0.6rem;justify-content:flex-end;margin-top:1rem">
          <button id="r-cancelar" class="vd-card-btn">Cancelar</button>
          <button id="r-confirmar" class="vd-card-btn" style="border-color:var(--c-musgo);color:var(--c-musgo)">Restaurar</button>
        </div>
      </div>`,
  });

  document.querySelector('#r-cancelar')?.addEventListener('click', () => fecharModal());
  document.querySelector('#r-confirmar')?.addEventListener('click', async () => {
    const motivo = document.querySelector('#r-motivo')?.value?.trim() || '';
    if (motivo.length < 10) {
      mostrarToast('Motivo precisa ter pelo menos 10 caracteres.', 'erro', 3000);
      return;
    }
    const btn = document.querySelector('#r-confirmar');
    btn.disabled = true; btn.textContent = 'Restaurando…';
    const { error } = await supabase.rpc('restaurar_lancamento', {
      p_lancamento_id: lancamentoId,
      p_motivo: motivo,
    });
    if (error) {
      mostrarToast('Falhou: ' + error.message, 'erro', 4000);
      btn.disabled = false; btn.textContent = 'Restaurar';
      return;
    }
    mostrarToast('Lançamento restaurado.', 'ok', 2200);
    fecharModal();
    await carregar();
  });
}

function renderPaginacao() {
  const pag = document.querySelector('#aud-pag');
  if (!pag) return;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (totalPaginas <= 1) { pag.innerHTML = ''; return; }

  pag.innerHTML = `
    <span class="aud-pag-info">
      Página <strong>${pagina}</strong> de <strong>${totalPaginas}</strong>
      <span class="aud-pag-total">(${total} ${total === 1 ? 'registro' : 'registros'})</span>
    </span>
    <span class="aud-pag-btns">
      <button class="vd-card-btn" id="p-prev" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <button class="vd-card-btn" id="p-next" ${pagina >= totalPaginas ? 'disabled' : ''}>Próxima →</button>
    </span>`;
  document.querySelector('#p-prev')?.addEventListener('click', async () => {
    pagina = Math.max(1, pagina - 1); await carregar();
    document.querySelector('#main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelector('#p-next')?.addEventListener('click', async () => {
    pagina = pagina + 1; await carregar();
    document.querySelector('#main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function formatarTs(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(d);
  } catch (_) { return String(ts); }
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
