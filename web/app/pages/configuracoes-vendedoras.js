// configuracoes-vendedoras.js — /configuracoes/vendedoras (refator v2).
//
// CRUD da equipe de vendedoras. Layout em 2 colunas: grade de cartões
// à esquerda (com busca), resumo com filtro por situação à direita.
// Drawer de criar/editar; modal centralizado de confirmação ao desativar.
//
// RLS: SELECT — todos; INSERT/UPDATE — admin ou operador; DELETE
// bloqueado (soft-delete via ativa=false).

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';

let TODAS = [];
let filtroSituacao = 'ativas';   // 'todas' | 'ativas' | 'inativas'
let busca = '';
let podeEditar = false;

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_VOLTAR = `<svg ${SVG}><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>`;
const ICON_MAIS   = `<svg viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
const ICON_LUPA   = `<svg ${SVG}><circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2 14 14"/></svg>`;
const ICON_MAIL   = `<svg ${SVG}><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5 8 8.7l5.5-4.2"/></svg>`;
const ICON_FONE   = `<svg ${SVG}><path d="M3 2.7h2.4l1 3-1.6 1.2a8 8 0 0 0 3.3 3.3l1.2-1.6 3 1V14a1 1 0 0 1-1.1 1A11.5 11.5 0 0 1 2 3.8 1 1 0 0 1 3 2.7Z"/></svg>`;
const ICON_EQUIPE = `<svg ${SVG}><circle cx="6" cy="5.4" r="2.4"/><path d="M1.6 13.4c0-2.5 2-4.1 4.4-4.1s4.4 1.6 4.4 4.1"/><path d="M10.5 3.4a2.3 2.3 0 0 1 0 4.3M11.6 9.5c1.9.4 2.9 1.9 2.9 3.9"/></svg>`;

export async function renderVendedoras() {
  await carregarPermissoes();
  podeEditar = temPermissaoSync('vendedora.editar');
  filtroSituacao = 'ativas';
  busca = '';

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: '',
    conteudo: `
    <main id="main" class="vnd">
      <a href="/configuracoes" data-link class="vnd-voltar">${ICON_VOLTAR} Configurações</a>

      <header class="vnd-header">
        <div class="vnd-header-texto">
          <p class="vnd-eyebrow">Operação · Equipe</p>
          <h1 class="vnd-title">Vendedoras</h1>
          <p class="vnd-sub">
            Quem aparece nos lançamentos pagos em dinheiro. Operadores
            cadastram e atualizam; admin desativa — sem excluir, o
            histórico fica preservado.
          </p>
        </div>
        <button type="button" id="vnd-novo" class="vnd-novo">${ICON_MAIS} Nova vendedora</button>
      </header>

      <div class="vnd-layout">
        <div class="vnd-main">
          <div class="vnd-busca-wrap">
            <span class="vnd-busca-icone" aria-hidden="true">${ICON_LUPA}</span>
            <input type="search" id="vnd-busca" class="vnd-busca"
                   placeholder="Buscar por nome ou apelido…" autocomplete="off">
          </div>
          <section id="vnd-conteudo" aria-live="polite"></section>
        </div>

        <aside class="vnd-resumo">
          <p class="vnd-resumo-eyebrow">Equipe</p>
          <div class="vnd-resumo-total">
            <span class="vnd-resumo-num" id="vnd-total">—</span>
            <span class="vnd-resumo-lab">vendedoras no total</span>
          </div>
          <div class="vnd-resumo-sec">
            <p class="vnd-resumo-sec-titulo">Situação</p>
            <div class="vnd-filtros">
              <button type="button" class="vnd-filtro" data-f="ativas">
                <span class="vnd-filtro-dot" aria-hidden="true"></span>
                <span class="vnd-filtro-label">Ativas</span>
                <span class="vnd-filtro-num" id="vnd-n-ativas">—</span>
              </button>
              <button type="button" class="vnd-filtro" data-f="inativas">
                <span class="vnd-filtro-dot" aria-hidden="true"></span>
                <span class="vnd-filtro-label">Inativas</span>
                <span class="vnd-filtro-num" id="vnd-n-inativas">—</span>
              </button>
              <button type="button" class="vnd-filtro" data-f="todas">
                <span class="vnd-filtro-dot" aria-hidden="true"></span>
                <span class="vnd-filtro-label">Todas</span>
                <span class="vnd-filtro-num" id="vnd-n-todas">—</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>`,
  });

  ligarShell();
  document.querySelector('#vnd-novo')?.addEventListener('click', (e) => abrirModalVendedora(null, e));
  document.querySelector('#vnd-busca')?.addEventListener('input', (e) => {
    busca = e.target.value.trim().toLowerCase();
    renderGrid();
  });
  document.querySelectorAll('.vnd-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroSituacao = btn.dataset.f;
      renderTudo();
    });
  });

  await carregarLista();
}

// ─── Carga e render ──────────────────────────────────────────────────
async function carregarLista() {
  const slot = document.querySelector('#vnd-conteudo');
  if (!slot) return;
  slot.innerHTML = `<div class="vnd-skel">${[1,2,3,4,5,6].map(() => `<div class="vnd-skel-item"></div>`).join('')}</div>`;

  const { data, error } = await supabase
    .from('vendedora')
    .select('id, nome, apelido, email, telefone, observacoes, ativa, criada_em')
    .order('ativa', { ascending: false })
    .order('nome',  { ascending: true });

  if (error) {
    slot.innerHTML = `<p class="vnd-erro">Não foi possível carregar a equipe. ${esc(error.message)}</p>`;
    return;
  }
  TODAS = data || [];
  renderTudo();
}

function renderTudo() {
  renderResumo();
  renderGrid();
}

function renderResumo() {
  const nAtivas   = TODAS.filter(v => v.ativa).length;
  const nInativas = TODAS.length - nAtivas;
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.textContent = String(v); };
  set('#vnd-total', TODAS.length);
  set('#vnd-n-ativas', nAtivas);
  set('#vnd-n-inativas', nInativas);
  set('#vnd-n-todas', TODAS.length);
  document.querySelectorAll('.vnd-filtro').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.f === filtroSituacao)));
}

function listaFiltrada() {
  let lista = TODAS;
  if (filtroSituacao === 'ativas')   lista = lista.filter(v => v.ativa);
  if (filtroSituacao === 'inativas') lista = lista.filter(v => !v.ativa);
  if (busca) {
    lista = lista.filter(v =>
      (v.nome || '').toLowerCase().includes(busca) ||
      (v.apelido || '').toLowerCase().includes(busca));
  }
  return lista;
}

function renderGrid() {
  const slot = document.querySelector('#vnd-conteudo');
  if (!slot) return;
  const lista = listaFiltrada();

  if (lista.length === 0) {
    slot.innerHTML = vazioHtml();
    return;
  }

  slot.innerHTML = `<div class="vnd-grid">${lista.map((v, i) => cardVendedora(v, i)).join('')}</div>`;
  slot.querySelectorAll('[data-vd-acao]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = TODAS.find(x => x.id === btn.dataset.vdId);
      if (!v) return;
      if (btn.dataset.vdAcao === 'editar')    abrirModalVendedora(v, e);
      if (btn.dataset.vdAcao === 'desativar') confirmarDesativar(v);
      if (btn.dataset.vdAcao === 'reativar')  reativar(v);
    });
  });
}

function vazioHtml() {
  let titulo, msg;
  if (TODAS.length === 0) {
    titulo = 'Nenhuma vendedora cadastrada.';
    msg = 'Adicione a primeira pelo botão “Nova vendedora” — ela fica disponível na hora nos lançamentos em dinheiro.';
  } else if (busca) {
    titulo = 'Nada encontrado.';
    msg = `Nenhuma vendedora ${rotuloSituacao()} corresponde a “${esc(busca)}”.`;
  } else {
    titulo = `Nenhuma vendedora ${rotuloSituacao()}.`;
    msg = filtroSituacao === 'inativas'
      ? 'Toda a equipe está ativa — bom sinal.'
      : 'Cadastre uma nova ou veja as outras situações no resumo ao lado.';
  }
  return `
    <div class="vnd-vazio">
      <div class="vnd-vazio-icone" aria-hidden="true">${ICON_EQUIPE}</div>
      <p class="vnd-vazio-title">${titulo}</p>
      <p class="vnd-vazio-msg">${msg}</p>
    </div>`;
}
function rotuloSituacao() {
  return filtroSituacao === 'ativas' ? 'ativa' : filtroSituacao === 'inativas' ? 'inativa' : '';
}

function cardVendedora(v, i) {
  const inicial = (v.nome || '?').trim().charAt(0).toUpperCase();
  const delay = `style="animation-delay:${Math.min(i * 45, 360)}ms"`;

  const acoes = [];
  if (v.ativa) {
    acoes.push(`<button class="vnd-card-btn" data-vd-acao="editar" data-vd-id="${esc(v.id)}">Editar</button>`);
    if (podeEditar) {
      acoes.push(`<button class="vnd-card-btn vnd-card-btn--perigo" data-vd-acao="desativar" data-vd-id="${esc(v.id)}">Desativar</button>`);
    }
  } else if (podeEditar) {
    acoes.push(`<button class="vnd-card-btn" data-vd-acao="editar" data-vd-id="${esc(v.id)}">Editar</button>`);
    acoes.push(`<button class="vnd-card-btn" data-vd-acao="reativar" data-vd-id="${esc(v.id)}">Reativar</button>`);
  }

  const contato = [];
  if (v.email)    contato.push(`<span class="vnd-card-linha">${ICON_MAIL}<span>${esc(v.email)}</span></span>`);
  if (v.telefone) contato.push(`<span class="vnd-card-linha">${ICON_FONE}<span>${esc(v.telefone)}</span></span>`);

  return `
    <article class="vnd-card" data-ativa="${v.ativa}" ${delay}>
      <div class="vnd-card-topo">
        <span class="vnd-card-avatar" aria-hidden="true">${esc(inicial)}</span>
        <div class="vnd-card-id">
          <h3 class="vnd-card-nome">${esc(v.nome)}</h3>
          ${v.apelido ? `<p class="vnd-card-apelido">“${esc(v.apelido)}”</p>` : ''}
        </div>
        <span class="vnd-card-badge" data-tom="${v.ativa ? 'ativa' : 'inativa'}">
          ${v.ativa ? 'Ativa' : 'Inativa'}
        </span>
      </div>
      ${contato.length ? `<div class="vnd-card-contato">${contato.join('')}</div>` : ''}
      ${v.observacoes
        ? `<p class="vnd-card-obs">${esc(v.observacoes.slice(0, 140))}${v.observacoes.length > 140 ? '…' : ''}</p>`
        : ''}
      <div class="vnd-card-rodape">
        <span class="vnd-card-data">desde ${esc(formatarDataCurta(v.criada_em))}</span>
        ${acoes.length ? `<div class="vnd-card-acoes">${acoes.join('')}</div>` : ''}
      </div>
    </article>`;
}

// ─── Modal criar/editar (amplo, centralizado — igual ao de lançamento) ─
function abrirModalVendedora(v, origemEv) {
  const isEdit = !!v;
  const inicial = ((v?.nome || '?').trim().charAt(0) || '?').toUpperCase();

  abrirModal({
    amplo: true,
    origemEvento: origemEv || null,
    eyebrow: isEdit ? `Editando · ${v.nome}` : 'Nova vendedora',
    titulo:  isEdit ? 'Atualizar dados.' : 'Adicionar à equipe.',
    conteudo: `
      <div class="vnd-modal">
        <div class="vnd-modal-split">
          <aside class="vnd-modal-aside">
            <div class="vnd-modal-preview">
              <div class="vnd-modal-av" id="vd-prev-av">${esc(inicial)}</div>
              <p class="vnd-modal-prev-nome ${v?.nome ? '' : 'is-vazio'}" id="vd-prev-nome">${esc(v?.nome || 'Nome da vendedora')}</p>
              <p class="vnd-modal-prev-apelido" id="vd-prev-apelido">${v?.apelido ? '“' + esc(v.apelido) + '”' : ''}</p>
              ${isEdit
                ? `<span class="vnd-card-badge" data-tom="${v.ativa ? 'ativa' : 'inativa'}">${v.ativa ? 'Ativa' : 'Inativa'}</span>`
                : ''}
            </div>
            <div class="vnd-modal-nota">
              <p class="vnd-modal-nota-titulo">Como funciona</p>
              <p class="vnd-modal-nota-txt">
                A vendedora aparece na lista de quem recebe lançamentos
                pagos em dinheiro. Fica disponível assim que você salva — e
                o histórico nunca se perde, mesmo se ela for desativada depois.
              </p>
            </div>
          </aside>

          <div class="vnd-modal-corpo">
            <form id="vd-form" novalidate class="vnd-modal-form">
              <div class="field">
                <label class="field-label" for="vd-nome">Nome *</label>
                <input id="vd-nome" name="nome" required minlength="2" maxlength="80"
                       class="field-input" autocomplete="name" value="${esc(v?.nome || '')}" />
                <span class="field-underline"></span>
              </div>
              <div class="field">
                <label class="field-label" for="vd-apelido">Apelido (interno)</label>
                <input id="vd-apelido" name="apelido" maxlength="40" class="field-input"
                       autocomplete="off" placeholder="opcional, como o time chama"
                       value="${esc(v?.apelido || '')}" />
                <span class="field-underline"></span>
              </div>
              <div class="vnd-2col">
                <div class="field">
                  <label class="field-label" for="vd-email">E-mail</label>
                  <input id="vd-email" name="email" type="email" maxlength="160"
                         class="field-input" autocomplete="email" value="${esc(v?.email || '')}" />
                  <span class="field-underline"></span>
                </div>
                <div class="field">
                  <label class="field-label" for="vd-telefone">Telefone</label>
                  <input id="vd-telefone" name="telefone" maxlength="20" class="field-input"
                         autocomplete="tel" placeholder="(11) 99999-9999"
                         value="${esc(v?.telefone || '')}" />
                  <span class="field-underline"></span>
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="vd-obs">Observações</label>
                <textarea id="vd-obs" name="observacoes" maxlength="600" rows="6"
                          class="field-input" style="resize:vertical"
                          placeholder="opcional — turno, divisão de comissão, etc.">${esc(v?.observacoes || '')}</textarea>
                <span class="field-underline"></span>
              </div>
            </form>
          </div>
        </div>
      </div>
    `,
    rodape: `
      <div id="vd-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="vd-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="vd-form" id="vd-salvar" class="btn-primary">
          ${isEdit ? 'Salvar' : 'Adicionar'}
        </button>
      </div>`,
  });

  const f = (id) => document.querySelector(`#${id}`);
  setTimeout(() => f('vd-nome')?.focus(), 360);

  // Preview ao vivo — avatar + nome/apelido acompanham o que se digita.
  f('vd-nome').addEventListener('input', (e) => {
    const nm = e.target.value.trim();
    f('vd-prev-av').textContent = (nm.charAt(0) || '?').toUpperCase();
    const prev = f('vd-prev-nome');
    prev.textContent = nm || 'Nome da vendedora';
    prev.classList.toggle('is-vazio', !nm);
  });
  f('vd-apelido').addEventListener('input', (e) => {
    const ap = e.target.value.trim();
    f('vd-prev-apelido').textContent = ap ? '“' + ap + '”' : '';
  });
  f('vd-telefone').addEventListener('input', (e) => {
    e.target.value = mascaraTelefone(e.target.value);
  });
  f('vd-cancelar').addEventListener('click', () => fecharModal(false));

  f('vd-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = f('vd-erro');
    const btn    = f('vd-salvar');
    erroEl.classList.add('hidden');

    const nome = f('vd-nome').value.trim();
    if (nome.length < 2) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'O nome precisa ter ao menos 2 caracteres.';
      return;
    }
    const email = f('vd-email').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'E-mail com formato inválido.';
      return;
    }

    const payload = {
      nome,
      apelido:     f('vd-apelido').value.trim() || null,
      email:       email || null,
      telefone:    f('vd-telefone').value.trim() || null,
      observacoes: f('vd-obs').value.trim() || null,
    };

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const resp = isEdit
      ? await supabase.from('vendedora').update(payload).eq('id', v.id)
      : await supabase.from('vendedora').insert(payload);

    btn.removeAttribute('aria-busy');
    if (resp.error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroVendedora(resp.error);
      return;
    }

    fecharModal(true);
    mostrarToast(isEdit ? 'Vendedora atualizada.' : 'Vendedora cadastrada.', 'ok', 2400);
    await carregarLista();
  });
}

// ─── Confirmação desativar (modal centralizado) ─────────────────────
function confirmarDesativar(v) {
  abrirModal({
    eyebrow: 'Equipe',
    titulo: 'Desativar vendedora?',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-2);line-height:1.6">
        <strong style="color:var(--ui-ink);font-weight:700">${esc(v.nome)}</strong>
        fica indisponível em novos lançamentos. O histórico permanece
        preservado, e ela pode ser reativada a qualquer momento.
      </p>
      <p class="text-body" style="margin-top:0.7rem;font-size:0.82rem;color:var(--ui-ink-3)">
        Não há exclusão definitiva — apenas baixa lógica.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="vd-conf-cancelar" class="btn-link">Não, manter ativa</button>
        <button type="button" id="vd-conf-desativar" class="btn-primary"
                style="background:var(--ui-danger);border-color:var(--ui-danger);box-shadow:none">
          Sim, desativar
        </button>
      </div>`,
  });

  document.querySelector('#vd-conf-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#vd-conf-desativar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    const { error } = await supabase.from('vendedora').update({ ativa: false }).eq('id', v.id);
    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      mostrarToast('Não foi possível desativar: ' + error.message, 'erro', 5000);
      return;
    }
    fecharModal(true);
    mostrarToast(`${v.nome} desativada.`, 'ok', 2400);
    await carregarLista();
  });
}

async function reativar(v) {
  const { error } = await supabase.from('vendedora').update({ ativa: true }).eq('id', v.id);
  if (error) {
    mostrarToast('Não foi possível reativar: ' + error.message, 'erro', 5000);
    return;
  }
  mostrarToast(`${v.nome} reativada.`, 'ok', 2400);
  await carregarLista();
}

// ─── Helpers ─────────────────────────────────────────────────────────
function mascaraTelefone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function traduzirErroVendedora(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('duplicate') || m.includes('unique')) {
    return 'Já existe uma vendedora com esse nome.';
  }
  if (m.includes('rls') || m.includes('row-level security') || m.includes('policy')) {
    return 'Você não tem permissão para essa operação.';
  }
  return err.message || 'Erro ao salvar.';
}

function formatarDataCurta(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(ts)).replace('.', '');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
