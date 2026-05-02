// configuracoes-feriados.js — Os dias em que o caixa não abre (CP7.2).
//
// Lista cronológica filtrada por ano. Drawer para adicionar.
// Soft-delete via UPDATE feriado SET ativo=false (preserva histórico
// para cálculos retroativos de dias úteis em pendências antigas).
//
// Estrutura (não confundir com o spec):
//   PK: data (date)        — não tem id
//   campo principal: descricao (não nome)
//   tipos: nacional, estadual, municipal, empresa (não 'ponto facultativo')

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { pegarPapeis } from '../papeis.js';
import { instalarPopDatasEm } from '../../components/pop-data.js';

const TIPOS = [
  { v: 'nacional',  rotulo: 'Nacional' },
  { v: 'estadual',  rotulo: 'Estadual' },
  { v: 'municipal', rotulo: 'Municipal' },
  { v: 'empresa',   rotulo: 'Empresa (ponto facultativo)' },
];

let ehAdmin = false;
let anoAtual = new Date().getFullYear();

export async function renderFeriados() {
  const papeis = await pegarPapeis();
  ehAdmin = papeis.includes('admin');

  if (!ehAdmin) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'config',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
          <div class="alert mt-6">
            Esta seção é restrita a administradores.
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2" data-etiqueta="ADMIN">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Calendário · Operação</p>
          <h1 class="tela-cabec-titulo">Os dias em que o caixa não abre.</h1>
          <p class="tela-cabec-sub">
            Feriados afetam o cálculo de dias úteis nas pendências.
            Remover não é deletar — fica em histórico para que cálculos
            antigos continuem corretos.
          </p>
        </div>
      </header>

      <div class="fer-toolbar reveal reveal-3">
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="fer-ano">Ano</label>
          <select id="fer-ano" class="field-input fer-ano-select"></select>
          <span class="field-underline"></span>
        </div>
        <button id="fer-novo" class="btn-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1 V13 M1 7 H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          Adicionar feriado
        </button>
      </div>

      <section id="fer-lista" class="reveal reveal-4"></section>
    </main>
  `,
  });

  ligarShell();
  await preencherSelectAno();
  document.querySelector('#fer-ano').addEventListener('change', (e) => {
    anoAtual = Number(e.target.value);
    carregarLista();
  });
  document.querySelector('#fer-novo').addEventListener('click', () => abrirDrawer());
  await carregarLista();
}

// ─── Anos disponíveis ───────────────────────────────────────────────
async function preencherSelectAno() {
  const sel = document.querySelector('#fer-ano');
  const { data, error } = await supabase
    .from('feriado')
    .select('data')
    .order('data', { ascending: true });

  const anos = new Set();
  if (!error && data) {
    data.forEach(f => anos.add(new Date(f.data + 'T00:00').getFullYear()));
  }
  // Garante o ano atual + próximo ano sempre disponíveis
  const hoje = new Date().getFullYear();
  anos.add(hoje);
  anos.add(hoje + 1);

  const ord = [...anos].sort((a, b) => b - a);
  sel.innerHTML = ord.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('');
}

// ─── Lista ──────────────────────────────────────────────────────────
async function carregarLista() {
  const lista = document.querySelector('#fer-lista');
  if (!lista) return;
  lista.innerHTML = `
    <div class="fer-grid">
      ${[1,2,3,4,5].map(() => `<div class="skel" style="height:5rem"></div>`).join('')}
    </div>`;

  const inicio = `${anoAtual}-01-01`;
  const fim    = `${anoAtual + 1}-01-01`;

  const { data, error } = await supabase
    .from('feriado')
    .select('data, descricao, tipo, ativo')
    .gte('data', inicio)
    .lt('data', fim)
    .eq('ativo', true)
    .order('data', { ascending: true });

  if (error) {
    lista.innerHTML = `<p class="alert">Não foi possível carregar feriados. ${esc(error.message)}</p>`;
    return;
  }

  const fers = data || [];
  if (fers.length === 0) {
    lista.innerHTML = `
      <div class="vazio">
        <div class="vazio-num">∅</div>
        <p class="vazio-titulo">Nenhum feriado em ${anoAtual}.</p>
        <p class="vazio-desc">
          Adicione o primeiro pelo botão <strong>+ Adicionar feriado</strong>.
        </p>
      </div>`;
    return;
  }

  lista.innerHTML = `
    <div class="fer-grid">
      ${fers.map((f, i) => cardFeriado(f, i)).join('')}
    </div>`;

  document.querySelectorAll('[data-fer-acao="remover"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = btn.dataset.ferData;
      const f = fers.find(x => x.data === data);
      if (f) confirmarRemover(f);
    });
  });
}

function cardFeriado(f, i) {
  const dt = new Date(f.data + 'T00:00');
  const diaSem = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(dt);
  const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(dt);
  const tipoRotulo = TIPOS.find(t => t.v === f.tipo)?.rotulo || f.tipo;

  return `
    <article class="fer-card" style="animation-delay:${i * 40}ms">
      <div class="fer-data">
        <span class="fer-data-dia">${esc(diaSem)}</span>
        ${esc(diaMes)}
      </div>
      <div class="fer-info">
        <span class="fer-nome">${esc(f.descricao)}</span>
        <span class="fer-tipo fer-tipo--${esc(f.tipo)}">${esc(tipoRotulo)}</span>
      </div>
      <div class="fer-acao">
        <button class="vd-card-btn" data-fer-acao="remover" data-fer-data="${esc(f.data)}">
          Remover
        </button>
      </div>
    </article>`;
}

// ─── Drawer adicionar ───────────────────────────────────────────────
function abrirDrawer() {
  const corpo = `
    <form id="fer-form" novalidate>
      <div class="field">
        <label class="field-label" for="fer-data-input">Data *</label>
        <input id="fer-data-input" name="data" type="date" required
               class="field-input" />
        <span class="field-underline"></span>
      </div>

      <div class="field">
        <label class="field-label" for="fer-descricao">Nome do feriado *</label>
        <input id="fer-descricao" name="descricao" required minlength="2" maxlength="120"
               class="field-input" autocomplete="off"
               placeholder="ex.: Aniversário da cidade" />
        <span class="field-underline"></span>
      </div>

      <div class="field">
        <label class="field-label" for="fer-tipo-input">Tipo *</label>
        <select id="fer-tipo-input" name="tipo" class="field-input" required>
          ${TIPOS.map(t => `<option value="${t.v}">${esc(t.rotulo)}</option>`).join('')}
        </select>
        <span class="field-underline"></span>
      </div>
    </form>
  `;

  abrirModal({
    lateral: true,
    eyebrow: 'Calendário',
    titulo: 'Adicionar feriado',
    conteudo: corpo,
    rodape: `
      <div id="fer-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="fer-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="fer-form" id="fer-salvar" class="btn-primary">Adicionar</button>
      </div>`,
  });

  // Pré-preenche data com hoje + 1 mês como sugestão neutra.
  const sugestao = new Date();
  sugestao.setMonth(sugestao.getMonth() + 1);
  document.querySelector('#fer-data-input').value =
    sugestao.toISOString().slice(0, 10);

  // Instala pop-data customizado.
  instalarPopDatasEm(document.querySelector('#fer-form'));

  setTimeout(() => document.querySelector('#fer-descricao')?.focus(), 360);

  document.querySelector('#fer-cancelar').addEventListener('click', () => fecharModal(false));

  document.querySelector('#fer-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = document.querySelector('#fer-erro');
    const btn = document.querySelector('#fer-salvar');
    erroEl.classList.add('hidden');

    const data = document.querySelector('#fer-data-input').value;
    const descricao = document.querySelector('#fer-descricao').value.trim();
    const tipo = document.querySelector('#fer-tipo-input').value;

    if (!data || !descricao || !tipo) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Preencha data, nome e tipo.';
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    // Upsert: se a data já existe (inativa por exemplo), reativa em vez de duplicar PK.
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
    // Atualiza ano selecionado se a data caiu em outro
    const anoData = Number(data.slice(0, 4));
    if (anoData !== anoAtual) {
      anoAtual = anoData;
      await preencherSelectAno();
    }
    await carregarLista();
  });
}

// ─── Confirmação de remoção ─────────────────────────────────────────
function confirmarRemover(f) {
  const dt = new Date(f.data + 'T00:00');
  const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(dt);

  abrirModal({
    titulo: 'Remover feriado?',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55">
        <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta);font-size:1.05rem">${esc(f.descricao)}</strong>
        em <strong>${esc(diaMes)}</strong> sai da lista.
      </p>
      <p class="text-body" style="margin-top:0.6rem;font-size:0.86rem;color:var(--c-tinta-3);line-height:1.5">
        Isso pode afetar o cálculo de <em>dias úteis</em> de pendências em aberto.
        O registro continua no banco como inativo — pode ser readicionado a qualquer momento.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="fer-conf-cancelar" class="btn-link">Não, manter</button>
        <button type="button" id="fer-conf-remover" class="btn-primary"
                style="background:var(--c-alerta);box-shadow:0 1px 0 0 rgba(154,42,31,0.4) inset, 0 6px 14px -8px rgba(154,42,31,0.45)">
          Sim, remover
        </button>
      </div>`,
  });

  document.querySelector('#fer-conf-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#fer-conf-remover').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase
      .from('feriado')
      .update({ ativo: false })
      .eq('data', f.data);

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
  if (m.includes('check')) return 'Tipo inválido. Use Nacional, Estadual, Municipal ou Empresa.';
  return err.message || 'Erro ao salvar.';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
