// configuracoes-feriados.js — /configuracoes/feriados (refator v2).
//
// Os dias em que o caixa não abre. Lista cronológica por ano + resumo
// com filtro por tipo. Modal de adicionar amplo, com prévia em forma
// de página de calendário. Soft-delete via UPDATE ativo=false.
//
// Tabela `feriado`: PK data (date), campos descricao, tipo, ativo.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';

const TIPOS = [
  { v: 'nacional',  rotulo: 'Nacional',  tom: 'accent' },
  { v: 'estadual',  rotulo: 'Estadual',  tom: 'info' },
  { v: 'municipal', rotulo: 'Municipal', tom: 'warn' },
  { v: 'empresa',   rotulo: 'Empresa',   tom: 'ink', rotuloSelect: 'Empresa (ponto facultativo)' },
];
const MAP_TIPO = Object.fromEntries(TIPOS.map(t => [t.v, t.rotulo]));

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_VOLTAR = `<svg ${SVG}><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>`;
const ICON_MAIS   = `<svg viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
const ICON_CAL    = `<svg ${SVG}><rect x="2.2" y="3" width="11.6" height="10.8" rx="1.6"/><path d="M2.2 6.3h11.6M5.4 1.6v2.6M10.6 1.6v2.6"/></svg>`;

let FERIADOS = [];
let anoAtual = new Date().getFullYear();
let filtroTipo = '';

export async function renderFeriados() {
  await carregarPermissoes();
  if (!temPermissaoSync('config.gerenciar_feriados')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: '',
      conteudo: `
        <main class="frd">
          <div class="frd-restrito">
            <p class="frd-restrito-title">Acesso restrito</p>
            <p class="frd-restrito-msg">A gestão de feriados é restrita a administradores.</p>
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  filtroTipo = '';

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: '',
    conteudo: `
    <main id="main" class="frd">
      <a href="/configuracoes" data-link class="frd-voltar">${ICON_VOLTAR} Configurações</a>

      <header class="frd-header">
        <div class="frd-header-texto">
          <p class="frd-eyebrow">Calendário · Operação</p>
          <h1 class="frd-title">Feriados</h1>
          <p class="frd-sub">
            Os dias em que o caixa não abre. Afetam o cálculo de dias
            úteis das pendências — remover é baixa lógica, o histórico fica.
          </p>
        </div>
        <button type="button" id="frd-novo" class="frd-novo">${ICON_MAIS} Adicionar feriado</button>
      </header>

      <div class="frd-layout">
        <div class="frd-main">
          <div class="frd-toolbar">
            <span class="frd-toolbar-label">Ano</span>
            <select id="frd-ano" class="frd-ano"></select>
          </div>
          <section id="frd-conteudo" aria-live="polite"></section>
        </div>

        <aside class="frd-resumo">
          <p class="frd-resumo-eyebrow">Resumo</p>
          <div class="frd-resumo-total">
            <span class="frd-resumo-num" id="frd-total">—</span>
            <span class="frd-resumo-lab">feriados em <strong id="frd-total-ano">${anoAtual}</strong></span>
          </div>
          <div class="frd-resumo-sec">
            <p class="frd-resumo-sec-titulo">Por tipo</p>
            <div class="frd-filtros">
              <button type="button" class="frd-filtro" data-tipo="todos">
                <span class="frd-filtro-dot" aria-hidden="true"></span>
                <span class="frd-filtro-label">Todos</span>
                <span class="frd-filtro-num" id="frd-n-todos">—</span>
              </button>
              ${TIPOS.map(t => `
                <button type="button" class="frd-filtro" data-tipo="${t.v}">
                  <span class="frd-filtro-dot" aria-hidden="true"></span>
                  <span class="frd-filtro-label">${esc(t.rotulo)}</span>
                  <span class="frd-filtro-num" id="frd-n-${t.v}">—</span>
                </button>`).join('')}
            </div>
          </div>
        </aside>
      </div>
    </main>`,
  });

  ligarShell();
  await preencherSelectAno();
  document.querySelector('#frd-ano').addEventListener('change', (e) => {
    anoAtual = Number(e.target.value);
    filtroTipo = '';
    const anoEl = document.querySelector('#frd-total-ano');
    if (anoEl) anoEl.textContent = String(anoAtual);
    carregarLista();
  });
  document.querySelector('#frd-novo').addEventListener('click', (e) => abrirModalFeriado(e));
  document.querySelectorAll('.frd-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tipo;
      filtroTipo = (t === 'todos' || t === filtroTipo) ? '' : t;
      renderTudo();
    });
  });

  await carregarLista();
}

// ─── Anos disponíveis ───────────────────────────────────────────────
async function preencherSelectAno() {
  const sel = document.querySelector('#frd-ano');
  const { data } = await supabase.from('feriado').select('data').order('data', { ascending: true });
  const anos = new Set();
  (data || []).forEach(f => anos.add(new Date(f.data + 'T00:00').getFullYear()));
  const hoje = new Date().getFullYear();
  anos.add(hoje);
  anos.add(hoje + 1);
  const ord = [...anos].sort((a, b) => b - a);
  sel.innerHTML = ord.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('');
}

// ─── Carga e render ──────────────────────────────────────────────────
async function carregarLista() {
  const slot = document.querySelector('#frd-conteudo');
  if (!slot) return;
  slot.innerHTML = `<div class="frd-skel">${[1,2,3,4,5].map(() => `<div class="frd-skel-item"></div>`).join('')}</div>`;

  const { data, error } = await supabase
    .from('feriado')
    .select('data, descricao, tipo, ativo')
    .gte('data', `${anoAtual}-01-01`)
    .lt('data', `${anoAtual + 1}-01-01`)
    .eq('ativo', true)
    .order('data', { ascending: true });

  if (error) {
    slot.innerHTML = `<p class="frd-erro">Não foi possível carregar os feriados. ${esc(error.message)}</p>`;
    return;
  }
  FERIADOS = data || [];
  renderTudo();
}

function renderTudo() {
  renderResumo();
  renderGrid();
}

function renderResumo() {
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.textContent = String(v); };
  set('#frd-total', FERIADOS.length);
  set('#frd-n-todos', FERIADOS.length);
  for (const t of TIPOS) {
    set(`#frd-n-${t.v}`, FERIADOS.filter(f => f.tipo === t.v).length);
  }
  document.querySelectorAll('.frd-filtro').forEach(b => {
    const t = b.dataset.tipo;
    const ativo = filtroTipo ? (t === filtroTipo) : (t === 'todos');
    b.setAttribute('aria-pressed', String(ativo));
  });
}

function renderGrid() {
  const slot = document.querySelector('#frd-conteudo');
  if (!slot) return;
  const lista = filtroTipo ? FERIADOS.filter(f => f.tipo === filtroTipo) : FERIADOS;

  if (lista.length === 0) {
    const qualTipo = filtroTipo ? MAP_TIPO[filtroTipo].toLowerCase() + ' ' : '';
    slot.innerHTML = `
      <div class="frd-vazio">
        <div class="frd-vazio-icone" aria-hidden="true">${ICON_CAL}</div>
        <p class="frd-vazio-title">Nenhum feriado ${qualTipo}em ${anoAtual}.</p>
        <p class="frd-vazio-msg">${FERIADOS.length === 0
          ? 'Adicione o primeiro pelo botão “Adicionar feriado”.'
          : 'Veja os outros tipos no resumo ao lado, ou troque o ano.'}</p>
      </div>`;
    return;
  }

  slot.innerHTML = `<ul class="frd-lista" role="list">${lista.map(cardFeriado).join('')}</ul>`;
  slot.querySelectorAll('[data-frd-remover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = FERIADOS.find(x => x.data === btn.dataset.frdRemover);
      if (f) confirmarRemover(f);
    });
  });
}

function cardFeriado(f, i) {
  const dt = new Date(f.data + 'T00:00');
  const mes = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dt).replace('.', '');
  const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(dt);
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(dt);
  const delay = `style="animation-delay:${Math.min(i * 35, 320)}ms"`;
  return `
    <li class="frd-card" data-tipo="${esc(f.tipo)}" ${delay}>
      <div class="frd-card-data" aria-hidden="true">
        <div class="frd-card-data-mes">${esc(mes)}</div>
        <div class="frd-card-data-dia">${esc(dia)}</div>
      </div>
      <div class="frd-card-corpo">
        <p class="frd-card-nome">${esc(f.descricao)}</p>
        <div class="frd-card-sub">
          <span class="frd-card-semana">${esc(semana)}</span>
          <span class="frd-tipo" data-tipo="${esc(f.tipo)}">${esc(MAP_TIPO[f.tipo] || f.tipo)}</span>
        </div>
      </div>
      <div class="frd-card-acao">
        <button type="button" class="frd-btn" data-frd-remover="${esc(f.data)}">Remover</button>
      </div>
    </li>`;
}

// ─── Modal: adicionar feriado ────────────────────────────────────────
function abrirModalFeriado(origemEv) {
  const dataInicial = `${anoAtual}-01-01`;

  abrirModal({
    amplo: true,
    origemEvento: origemEv || null,
    eyebrow: 'Calendário',
    titulo: 'Adicionar feriado.',
    conteudo: `
      <div class="frd-modal">
        <div class="frd-modal-split">
          <aside class="frd-modal-aside">
            <div class="frd-cal" id="frd-cal" data-tipo="nacional">
              <div class="frd-cal-topo" id="frd-cal-topo">—</div>
              <div class="frd-cal-dia" id="frd-cal-dia">—</div>
              <div class="frd-cal-semana" id="frd-cal-semana">—</div>
              <div class="frd-cal-rodape">
                <div class="frd-cal-nome is-vazio" id="frd-cal-nome">Nome do feriado</div>
                <div class="frd-cal-tipo">
                  <span class="frd-tipo" id="frd-cal-chip" data-tipo="nacional">Nacional</span>
                </div>
              </div>
            </div>
            <div class="frd-modal-nota">
              <p class="frd-modal-nota-txt">
                Feriados entram no cálculo de dias úteis das pendências.
                Se a data já existir como inativa, ela é reativada.
              </p>
            </div>
          </aside>

          <div class="frd-modal-corpo">
            <form id="frd-form" novalidate class="frd-modal-form">
              <div class="field">
                <label class="field-label" for="frd-data">Data *</label>
                <input id="frd-data" name="data" type="date" required class="field-input"
                       value="${dataInicial}">
                <span class="field-underline"></span>
              </div>
              <div class="field">
                <label class="field-label" for="frd-descricao">Nome do feriado *</label>
                <input id="frd-descricao" name="descricao" required minlength="2" maxlength="120"
                       class="field-input" autocomplete="off"
                       placeholder="ex.: Aniversário da cidade">
                <span class="field-underline"></span>
              </div>
              <div class="field">
                <label class="field-label" for="frd-tipo">Tipo *</label>
                <select id="frd-tipo" name="tipo" class="field-input" required>
                  ${TIPOS.map(t => `<option value="${t.v}">${esc(t.rotuloSelect || t.rotulo)}</option>`).join('')}
                </select>
                <span class="field-underline"></span>
              </div>
            </form>
          </div>
        </div>
      </div>
    `,
    rodape: `
      <div id="frd-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="frd-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="frd-form" id="frd-salvar" class="btn-primary">Adicionar</button>
      </div>`,
  });

  const f = (id) => document.querySelector(`#${id}`);
  setTimeout(() => f('frd-descricao')?.focus(), 360);
  atualizarCalPreview();

  f('frd-data').addEventListener('input', atualizarCalPreview);
  f('frd-descricao').addEventListener('input', atualizarCalPreview);
  f('frd-tipo').addEventListener('change', atualizarCalPreview);
  f('frd-cancelar').addEventListener('click', () => fecharModal(false));

  f('frd-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = f('frd-erro');
    const btn = f('frd-salvar');
    erroEl.classList.add('hidden');

    const data = f('frd-data').value;
    const descricao = f('frd-descricao').value.trim();
    const tipo = f('frd-tipo').value;
    if (!data || descricao.length < 2 || !tipo) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Preencha a data, o nome (mín. 2 caracteres) e o tipo.';
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    // Upsert: data já existente (mesmo inativa) é reativada, sem duplicar PK.
    const { error } = await supabase
      .from('feriado')
      .upsert({ data, descricao, tipo, ativo: true }, { onConflict: 'data' });
    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErro(error);
      return;
    }

    fecharModal(true);
    mostrarToast('Feriado adicionado.', 'ok', 2400);
    const anoData = Number(data.slice(0, 4));
    if (anoData !== anoAtual) {
      anoAtual = anoData;
      filtroTipo = '';
      await preencherSelectAno();
      const anoEl = document.querySelector('#frd-total-ano');
      if (anoEl) anoEl.textContent = String(anoAtual);
    }
    await carregarLista();
  });
}

function atualizarCalPreview() {
  const dataV = document.querySelector('#frd-data')?.value || '';
  const desc  = document.querySelector('#frd-descricao')?.value.trim() || '';
  const tipo  = document.querySelector('#frd-tipo')?.value || 'nacional';
  const cal = document.querySelector('#frd-cal');
  if (!cal) return;

  if (dataV) {
    const dt = new Date(dataV + 'T00:00');
    document.querySelector('#frd-cal-topo').textContent =
      new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dt);
    document.querySelector('#frd-cal-dia').textContent =
      new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(dt);
    document.querySelector('#frd-cal-semana').textContent =
      new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(dt);
  } else {
    document.querySelector('#frd-cal-topo').textContent = '—';
    document.querySelector('#frd-cal-dia').textContent = '—';
    document.querySelector('#frd-cal-semana').textContent = 'selecione uma data';
  }

  const nomeEl = document.querySelector('#frd-cal-nome');
  nomeEl.textContent = desc || 'Nome do feriado';
  nomeEl.classList.toggle('is-vazio', !desc);

  cal.dataset.tipo = tipo;
  const chip = document.querySelector('#frd-cal-chip');
  chip.dataset.tipo = tipo;
  chip.textContent = MAP_TIPO[tipo] || tipo;
}

// ─── Confirmação de remoção ─────────────────────────────────────────
function confirmarRemover(f) {
  const dt = new Date(f.data + 'T00:00');
  const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(dt);

  abrirModal({
    eyebrow: 'Calendário',
    titulo: 'Remover feriado?',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-2);line-height:1.6">
        <strong style="color:var(--ui-ink);font-weight:700">${esc(f.descricao)}</strong>
        em <strong>${esc(diaMes)}</strong> sai da lista.
      </p>
      <p class="text-body" style="margin-top:0.7rem;font-size:0.83rem;color:var(--ui-ink-3);line-height:1.5">
        Pode afetar o cálculo de dias úteis de pendências em aberto. O registro
        fica no banco como inativo — dá pra readicionar a qualquer momento.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="frd-conf-cancelar" class="btn-link">Não, manter</button>
        <button type="button" id="frd-conf-remover" class="btn-primary"
                style="background:var(--ui-danger);border-color:var(--ui-danger);box-shadow:none">
          Sim, remover
        </button>
      </div>`,
  });

  document.querySelector('#frd-conf-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#frd-conf-remover').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    const { error } = await supabase.from('feriado').update({ ativo: false }).eq('data', f.data);
    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      mostrarToast('Não foi possível remover: ' + error.message, 'erro', 5000);
      return;
    }
    fecharModal(true);
    mostrarToast('Feriado removido.', 'ok', 2400);
    await carregarLista();
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────
function traduzirErro(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('duplicate') || m.includes('unique')) return 'Já existe um feriado nessa data.';
  if (m.includes('rls') || m.includes('policy')) return 'Você não tem permissão para essa operação.';
  if (m.includes('check')) return 'Tipo inválido.';
  return err.message || 'Erro ao salvar.';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
