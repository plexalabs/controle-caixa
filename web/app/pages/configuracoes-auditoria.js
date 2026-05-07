// configuracoes-auditoria.js — /configuracoes/auditoria
//
// Tela com duas abas:
//   01 Linha do tempo (default) — log forense, item por item, com filtros
//      (data, usuário, entidade, ação, busca).
//   02 Lixeira — soft-deletes restauráveis (lançamentos) ou apenas
//      consultáveis (notificações descartadas, push subs removidas).
//
// Adota o vocabulario visual do projeto:
//   tela-cabec[data-etiqueta=AUDITORIA]  cabecalho com tira musgo lateral
//   field / field-label / field-input    filtros padronizados
//   reveal reveal-N                      entradas escalonadas
//   filete lateral (var(--c-ambar))      assinatura de cards do sistema
//   border-radius: 0 r-md r-md 0         identidade do papel rasgado a esquerda

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { instalarPopDatasEm } from '../../components/pop-data.js';

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

  abaAtual = podeVerLog ? 'log' : 'lixeira';

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2" data-etiqueta="FORENSE">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Auditoria · Lixeira</p>
          <h1 class="tela-cabec-titulo">Tudo deixa rastro.</h1>
          <p class="tela-cabec-sub">
            Cada ação registrada com data, hora, autor, motivo e o
            delta exato. Restaurar exige justificativa — que também
            vai pro log.
          </p>
        </div>
      </header>

      <div class="aud-tabs reveal reveal-3" role="tablist">
        ${podeVerLog ? `
          <button class="aud-tab" role="tab" data-aba="log"
                  aria-selected="${abaAtual === 'log'}">
            <span class="aud-tab-num" aria-hidden="true">01</span>
            <span class="aud-tab-rotulo">Linha do tempo</span>
          </button>` : ''}
        ${podeVerLixeira ? `
          <button class="aud-tab" role="tab" data-aba="lixeira"
                  aria-selected="${abaAtual === 'lixeira'}">
            <span class="aud-tab-num" aria-hidden="true">02</span>
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

function fieldHtml(id, label, html) {
  return `
    <div class="field">
      <label class="field-label" for="${id}">${label}</label>
      ${html}
      <span class="field-underline"></span>
    </div>`;
}

function renderFiltros() {
  const slot = document.querySelector('#aud-filtros');
  if (!slot) return;

  let camposHtml = '';
  if (abaAtual === 'log') {
    camposHtml = `
      ${fieldHtml('f-data-ini', 'De',
         `<input type="date" id="f-data-ini" class="field-input" value="${filtros.data_ini || ''}">`)}
      ${fieldHtml('f-data-fim', 'Até',
         `<input type="date" id="f-data-fim" class="field-input" value="${filtros.data_fim || ''}">`)}
      ${fieldHtml('f-entidade', 'Entidade', `
        <select id="f-entidade" class="field-input">
          <option value="">Todas</option>
          ${ENTIDADES.map(e => `<option value="${e}" ${filtros.entidade === e ? 'selected' : ''}>${e}</option>`).join('')}
        </select>`)}
      ${fieldHtml('f-acao', 'Ação', `
        <select id="f-acao" class="field-input">
          <option value="">Todas</option>
          ${ACOES.map(a => `<option value="${a}" ${filtros.acao === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>`)}
      ${fieldHtml('f-busca', 'Buscar (motivo / e-mail)',
         `<input type="text" id="f-busca" class="field-input" value="${esc(filtros.busca || '')}" placeholder="ex: cancelamento, joaonora@…">`)}`;
  } else {
    camposHtml = `
      ${fieldHtml('f-tipo', 'Tipo', `
        <select id="f-tipo" class="field-input">
          <option value="">Todos</option>
          <option value="lancamento"        ${filtros.tipo === 'lancamento' ? 'selected' : ''}>Lançamento</option>
          <option value="notificacao"       ${filtros.tipo === 'notificacao' ? 'selected' : ''}>Notificação</option>
          <option value="push_subscription" ${filtros.tipo === 'push_subscription' ? 'selected' : ''}>Push (device)</option>
        </select>`)}
      ${fieldHtml('f-data-ini', 'De',
         `<input type="date" id="f-data-ini" class="field-input" value="${filtros.data_ini || ''}">`)}
      ${fieldHtml('f-data-fim', 'Até',
         `<input type="date" id="f-data-fim" class="field-input" value="${filtros.data_fim || ''}">`)}
      ${fieldHtml('f-busca', 'Buscar', `
         <input type="text" id="f-busca" class="field-input" value="${esc(filtros.busca || '')}" placeholder="rótulo ou detalhe">`)}`;
  }

  slot.innerHTML = `
    <div class="aud-filtros-grid">
      ${camposHtml}
      <div class="aud-filtros-acoes">
        <button id="f-aplicar" class="btn-primary" style="padding:0.6rem 1.1rem;font-size:0.85rem">Aplicar</button>
        <button id="f-limpar"  class="btn-link"    style="font-size:0.85rem">Limpar</button>
      </div>
    </div>`;

  // Substitui inputs date pelo pop-data custom (calendario papel/musgo)
  instalarPopDatasEm(slot);

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
      ${[1,2,3,4,5,6].map(() => `<div class="skel" style="height:5rem;border-radius:0 8px 8px 0;margin-bottom:0.6rem"></div>`).join('')}
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
        <p class="aud-vazio-eyebrow">Silêncio</p>
        <p class="aud-vazio-titulo">${abaAtual === 'log' ? 'Sem eventos no recorte.' : 'Lixeira vazia.'}</p>
        <p class="aud-vazio-desc">${abaAtual === 'log'
          ? 'Mude os filtros ou aguarde — todo evento daqui pra frente é capturado.'
          : 'Nada foi excluído ainda. Se ficar muito vazio, é bom sinal.'}</p>
      </div>`;
    return;
  }

  if (abaAtual === 'log') {
    slot.innerHTML = `<ol class="aud-timeline" role="list">${data.map((r, i) => itemLog(r, i)).join('')}</ol>`;
    ligarLog(slot, data);
  } else {
    slot.innerHTML = `<ul class="aud-lixeira" role="list">${data.map((r, i) => itemLixeira(r, i)).join('')}</ul>`;
    ligarLixeira(slot);
  }

  renderPaginacao();
}

function itemLog(r, idx) {
  const dt = formatarTs(r.ts);
  const motivoBlock = r.motivo
    ? `<p class="aud-row-motivo">“${esc(r.motivo)}”</p>` : '';
  const autor = r.usuario_email_snapshot
    ? `<strong>${esc(r.usuario_email_snapshot)}</strong>`
    : `<em>sistema</em>`;
  const acaoCls = `aud-acao--${r.acao.toLowerCase().replace(/_/g, '-')}`;
  // delay escalonado (animação fade-up via CSS)
  const delay = `style="animation-delay:${Math.min(idx * 35, 420)}ms"`;
  return `
    <li class="aud-row ${acaoCls}" data-id="${r.id}" data-acao="${esc(r.acao)}" ${delay}>
      <span class="aud-row-bullet" aria-hidden="true"></span>
      <div class="aud-row-corpo">
        <div class="aud-row-meta">
          <span class="aud-row-acao">${rotuloAcao(r.acao)}</span>
          <span class="aud-row-entidade">${esc(r.entidade)}</span>
          ${r.entidade_id ? `<code class="aud-row-id">${esc(String(r.entidade_id).slice(0, 8))}</code>` : ''}
          <time class="aud-row-tempo" title="${esc(r.ts)}">${dt}</time>
        </div>
        <div class="aud-row-autor">por ${autor}</div>
        ${motivoBlock}
        <button class="aud-row-detalhes" data-acao-row="abrir-detalhes">
          ver delta
          <svg width="11" height="9" viewBox="0 0 14 11" fill="none" aria-hidden="true">
            <path d="M1 5.5 H12 M8 1 L12 5.5 L8 10" stroke="currentColor"
                  stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </li>`;
}

function rotuloAcao(a) {
  return ({
    INSERT: 'criou', UPDATE: 'editou', DELETE: 'apagou',
    SOFT_DELETE: 'excluiu', RESTAURACAO: 'restaurou',
    LOGIN: 'entrou', LOGOUT: 'saiu',
    RPC: 'rpc', PUSH_ENVIADO: 'push enviado',
    CONFIG_ALTERADA: 'config',
  })[a] || a.toLowerCase();
}

function itemLixeira(r, idx) {
  const dt = formatarTs(r.excluido_em);
  const delay = `style="animation-delay:${Math.min(idx * 50, 500)}ms"`;
  return `
    <li class="aud-trash" data-id="${esc(r.id)}" data-tipo="${esc(r.tipo)}" ${delay}>
      <div class="aud-trash-corpo">
        <div class="aud-trash-cabec">
          <span class="aud-trash-chip" data-tipo="${esc(r.tipo)}">${rotuloTipo(r.tipo)}</span>
          <strong class="aud-trash-rotulo">${esc(r.rotulo || '—')}</strong>
        </div>
        <p class="aud-trash-detalhe">${esc(r.detalhe || '')}</p>
        <div class="aud-trash-meta">
          <time>${dt}</time>
          ${r.excluido_por_email ? `<span>por <strong>${esc(r.excluido_por_email)}</strong></span>` : ''}
        </div>
        ${r.motivo ? `<p class="aud-trash-motivo">“${esc(r.motivo)}”</p>` : ''}
      </div>
      <div class="aud-trash-acoes">
        ${r.restauravel && podeRestaurar
          ? `<button class="btn-link aud-trash-restaurar" data-acao-row="restaurar">Restaurar →</button>`
          : `<span class="aud-trash-locked" title="Sem restauração disponível">arquivado</span>`}
      </div>
    </li>`;
}

function rotuloTipo(t) {
  return ({ lancamento: 'Lançamento',
            notificacao: 'Notificação',
            push_subscription: 'Push' })[t] || t;
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
    eyebrow: 'Forense · Delta',
    titulo: `${rotuloAcao(r.acao)} · ${r.entidade}`,
    lateral: true,
    conteudo: `
      <div class="aud-modal">
        <dl class="aud-modal-meta">
          <dt>Quando</dt><dd>${esc(r.ts)}</dd>
          <dt>Autor</dt><dd>${esc(r.usuario_email_snapshot || 'sistema')}</dd>
          <dt>Registro</dt><dd><code>${esc(String(r.entidade_id || '—'))}</code></dd>
          ${r.motivo ? `<dt>Motivo</dt><dd class="aud-modal-motivo">“${esc(r.motivo)}”</dd>` : ''}
          ${r.ip ? `<dt>IP</dt><dd><code>${esc(r.ip)}</code></dd>` : ''}
        </dl>
        <h4 class="aud-modal-h">antes</h4>
        <pre class="aud-modal-pre">${esc(r.dados_antes ? JSON.stringify(r.dados_antes, null, 2) : '—')}</pre>
        <h4 class="aud-modal-h">depois</h4>
        <pre class="aud-modal-pre">${esc(r.dados_depois ? JSON.stringify(r.dados_depois, null, 2) : '—')}</pre>
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
        <div class="field" style="margin-top:1.2rem">
          <label class="field-label" for="r-motivo">Motivo (mínimo 10 caracteres)</label>
          <textarea id="r-motivo" class="field-input" rows="3"
                    placeholder="Ex: lançamento foi excluído por engano, é a NF do pedido X que ainda precisa ser categorizada."></textarea>
          <span class="field-underline"></span>
        </div>
        <div style="display:flex;gap:0.7rem;justify-content:flex-end;margin-top:1.5rem">
          <button id="r-cancelar" class="btn-link">Cancelar</button>
          <button id="r-confirmar" class="btn-primary" style="padding:0.6rem 1.1rem;font-size:0.85rem">Restaurar</button>
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
      <span class="aud-pag-total">· ${total} ${total === 1 ? 'registro' : 'registros'}</span>
    </span>
    <span class="aud-pag-btns">
      <button class="btn-link" id="p-prev" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
      <button class="btn-link" id="p-next" ${pagina >= totalPaginas ? 'disabled' : ''}>Próxima →</button>
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
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch (_) { return String(ts); }
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
