// configuracoes-sistema.js — Os parâmetros internos do caderno (CP7.3 / refeito).
//
// Cada chave tem METADADOS (nome amigável, descrição rica, agrupamento,
// limites). A tela mostra esses nomes em vez das chaves técnicas.
//
// Interação:
//   * boolean  → toggle inline direto no card; salva ao tocar (optimistic).
//                Reverte visualmente se a RPC falhar.
//   * number   → modal grande com stepper +/−, sugestões clicáveis e unidade.
//   * time     → modal com dois steppers (hora + minuto).
//   * date     → modal com date picker custom.
//   * text     → modal com input grande + contador de caracteres.
//
// Validação dupla: client antes de chamar a RPC + RPC valida no servidor.
// Auditoria visível: cada item mostra atualizado_em + email do último editor.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';
import { instalarPopDatasEm } from '../../components/pop-data.js';

// ─── METADADOS por chave ─────────────────────────────────────────────
// Centraliza nome amigável, descrição, agrupamento e config-específica
// (min/max/step/sugestoes/unidade). Chaves novas que aparecerem no banco
// e não estiverem aqui caem em FALLBACK_META — sem quebrar a tela.
const META = {
  // ─── Geração automática de caixas ─────────────────────────────────
  'caixa.gerar_sabado': {
    grupo: 'caixa',
    titulo: 'Gerar caixa aos sábados',
    desc: 'Quando ativo, o sistema abre um caixa novo automaticamente todo sábado de manhã.',
    onText: 'Sábado conta',
    offText: 'Sábado fica de fora',
  },
  'caixa.gerar_domingo': {
    grupo: 'caixa',
    titulo: 'Gerar caixa aos domingos',
    desc: 'Quando ativo, o sistema abre um caixa novo automaticamente todo domingo de manhã.',
    onText: 'Domingo conta',
    offText: 'Domingo fica de fora',
  },

  // ─── Alertas e notificações ───────────────────────────────────────
  'notificacao.horario_inicio': {
    grupo: 'notificacao',
    titulo: 'Início das notificações',
    desc: 'A partir desse horário, o sistema começa a enviar alertas para a equipe.',
    unidade: 'horário',
    sufixo: 'da manhã',
  },
  'notificacao.horario_fim': {
    grupo: 'notificacao',
    titulo: 'Fim das notificações',
    desc: 'Hora limite para envio de alertas. Após esse horário, o sistema fica em silêncio.',
    unidade: 'horário',
    sufixo: 'da noite',
  },
  'notificacao.intervalo_horas': {
    grupo: 'notificacao',
    titulo: 'Frequência das notificações',
    desc: 'Quantas horas entre cada envio durante a janela ativa.',
    unidade: 'horas',
    unidadeSing: 'hora',
    min: 1, max: 12, step: 1,
    sugestoes: [2, 4, 6, 8],
  },

  // ─── Pendências ────────────────────────────────────────────────────
  'pendencia.dias_alerta_atraso': {
    grupo: 'pendencia',
    titulo: 'Dias até virar urgente',
    desc: 'Quantos dias úteis uma pendência fica em aberto antes de ganhar destaque vermelho no painel.',
    unidade: 'dias úteis',
    unidadeSing: 'dia útil',
    min: 1, max: 30, step: 1,
    sugestoes: [3, 5, 7, 15],
  },

  // ─── Sincronização com Excel ──────────────────────────────────────
  'sync.intervalo_minutos': {
    grupo: 'sync',
    titulo: 'Intervalo entre sincronizações',
    desc: 'Tempo entre cada sincronização do Excel para o Supabase.',
    unidade: 'minutos',
    unidadeSing: 'minuto',
    min: 1, max: 60, step: 1,
    sugestoes: [5, 15, 30, 60],
  },
};

const GRUPOS = [
  { v: 'caixa',        rotulo: 'Geração automática de caixas',
    desc: 'Quando o caixa diário é aberto sem ninguém precisar pedir.' },
  { v: 'notificacao',  rotulo: 'Alertas e notificações',
    desc: 'Quando e com que frequência o sistema avisa a equipe sobre pendências.' },
  { v: 'pendencia',    rotulo: 'Pendências',
    desc: 'Como o sistema trata NFs em aberto.' },
  { v: 'sync',         rotulo: 'Sincronização com Excel',
    desc: 'Velocidade da ponte com a planilha .xlsm da contação.' },
];

const FALLBACK_META = (chave) => ({
  grupo: chave.split('.')[0] || 'outros',
  titulo: chave,
  desc: '',
});

let configs = [];

export async function renderSistema() {
  // RBAC Sessao 3: troca papeis.includes('admin') por permissao do RBAC.
  // config.editar_sistema eh exclusiva de super_admin no desenho da Sessao 1
  // (admins futuros precisarao de override pontual via Sessao 4).
  await carregarPermissoes();
  const ehAdmin = temPermissaoSync('config.editar_sistema');

  if (!ehAdmin) {
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

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2" data-etiqueta="ADMIN">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Bastidores · Sistema</p>
          <h1 class="tela-cabec-titulo">Os parâmetros internos do caderno.</h1>
          <p class="tela-cabec-sub">
            Valores que afetam o comportamento global. Mude com cuidado —
            tudo é auditado e visível para outros admins.
          </p>
        </div>
      </header>

      <div class="sis-aviso reveal reveal-3">
        <strong>Atenção:</strong> alterações entram em vigor na próxima execução
        de cada job. Notificações e geração de caixa diário usam os valores
        no momento de rodar.
      </div>

      <section id="sis-lista" class="reveal reveal-4"></section>
    </main>
  `,
  });

  ligarShell();
  await carregarLista();
}

// ─── Lista ──────────────────────────────────────────────────────────
async function carregarLista() {
  const lista = document.querySelector('#sis-lista');
  if (!lista) return;
  lista.innerHTML = `
    <div>
      ${[1,2,3,4,5,6].map(() => `<div class="skel" style="height:5.5rem;margin-bottom:0.5rem"></div>`).join('')}
    </div>`;

  const { data, error } = await supabase
    .from('config_visualizacao')
    .select('*')
    .order('chave');

  if (error) {
    lista.innerHTML = `<p class="alert">Não foi possível carregar configurações. ${esc(error.message)}</p>`;
    return;
  }

  configs = data || [];
  if (configs.length === 0) {
    lista.innerHTML = `<div class="vazio"><p class="vazio-titulo">Sem chaves cadastradas.</p></div>`;
    return;
  }

  // Agrupa pela definição de GRUPOS (preserva ordem editorial), com fallback
  // para grupos não-mapeados. Cada chave usa META (ou FALLBACK_META).
  const porGrupo = new Map();
  for (const c of configs) {
    const meta = META[c.chave] || FALLBACK_META(c.chave);
    const g = meta.grupo || 'outros';
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push({ ...c, _meta: meta });
  }

  // Ordem: primeiro os grupos definidos em GRUPOS, depois resto.
  const ordemGrupos = [
    ...GRUPOS.map(g => g.v).filter(v => porGrupo.has(v)),
    ...[...porGrupo.keys()].filter(g => !GRUPOS.find(x => x.v === g)),
  ];

  let html = '';
  for (const g of ordemGrupos) {
    const def = GRUPOS.find(x => x.v === g);
    html += `
      <div class="sis-grupo">
        <div class="sis-grupo-cabec">
          <h2 class="sis-grupo-titulo-novo">${esc(def?.rotulo || g)}</h2>
          ${def?.desc ? `<p class="sis-grupo-desc">${esc(def.desc)}</p>` : ''}
        </div>
        <div class="sis-grupo-cards">
          ${porGrupo.get(g).map((c, i) => cardConfig(c, i)).join('')}
        </div>
      </div>`;
  }
  lista.innerHTML = html;

  // Wire listeners
  document.querySelectorAll('[data-sis-toggle]').forEach(el => {
    el.addEventListener('change', (e) => onToggleBoolean(el.dataset.sisToggle, e.target.checked));
  });
  document.querySelectorAll('[data-sis-abrir]').forEach(btn => {
    btn.addEventListener('click', () => abrirModalEdicao(btn.dataset.sisAbrir));
  });
}

function cardConfig(c, i) {
  const m = c._meta;
  const audit = `Atualizado ${formatarRelativo(c.atualizado_em)}`
              + (c.atualizado_por_email ? ' · por ' + esc(c.atualizado_por_email) : '');
  const delay = `style="animation-delay:${i * 35}ms"`;

  if (c.tipo === 'boolean') {
    const checked = c.valor === true;
    return `
      <article class="sis-card sis-card--bool" ${delay}>
        <div class="sis-card-conteudo">
          <h3 class="sis-card-titulo">${esc(m.titulo)}</h3>
          ${m.desc ? `<p class="sis-card-desc">${esc(m.desc)}</p>` : ''}
          <p class="sis-card-audit">${audit}</p>
        </div>
        <label class="sis-toggle ${checked ? 'is-on' : 'is-off'}" aria-label="${esc(m.titulo)}">
          <input type="checkbox" data-sis-toggle="${esc(c.chave)}" ${checked ? 'checked' : ''}>
          <span class="sis-toggle-trilho">
            <span class="sis-toggle-handle" aria-hidden="true"></span>
          </span>
          <span class="sis-toggle-rotulo" data-sis-toggle-rotulo>
            ${esc(checked ? (m.onText || 'Ativo') : (m.offText || 'Inativo'))}
          </span>
        </label>
      </article>`;
  }

  // Tipos com modal
  return `
    <article class="sis-card sis-card--clickable" data-sis-abrir="${esc(c.chave)}" ${delay}
             role="button" tabindex="0">
      <div class="sis-card-conteudo">
        <h3 class="sis-card-titulo">${esc(m.titulo)}</h3>
        ${m.desc ? `<p class="sis-card-desc">${esc(m.desc)}</p>` : ''}
        <p class="sis-card-audit">${audit}</p>
      </div>
      <div class="sis-card-valor">
        <span class="sis-valor-num">${esc(formatarValorVisivel(c, m))}</span>
        ${m.unidade ? `<span class="sis-valor-unid">${esc(unidadeRotulo(c.valor, m))}</span>` : ''}
        <span class="sis-card-edit-icone" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 1.5 L12.5 5 L4 13.5 H0.5 V10 Z M8.5 2.5 L11.5 5.5"
                  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
    </article>`;
}

// Faz tecla Enter no card abrir modal (acessibilidade do role=button)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const c = e.target.closest?.('[data-sis-abrir]');
  if (!c) return;
  e.preventDefault();
  abrirModalEdicao(c.dataset.sisAbrir);
});

// ─── Toggle inline (boolean) ────────────────────────────────────────
async function onToggleBoolean(chave, novoValor) {
  const card = document.querySelector(`[data-sis-toggle="${cssEsc(chave)}"]`)?.closest('.sis-card');
  if (!card) return;
  const c = configs.find(x => x.chave === chave);
  if (!c) return;
  const m = c._meta || META[chave] || FALLBACK_META(chave);

  // Optimistic UI
  card.querySelector('.sis-toggle')?.classList.toggle('is-on', novoValor);
  card.querySelector('.sis-toggle')?.classList.toggle('is-off', !novoValor);
  const rot = card.querySelector('[data-sis-toggle-rotulo]');
  if (rot) rot.textContent = novoValor ? (m.onText || 'Ativo') : (m.offText || 'Inativo');

  const { error } = await supabase.rpc('atualizar_config', {
    p_chave: chave,
    p_valor: novoValor,
  });

  if (error) {
    // Reverte visual + estado
    const inp = card.querySelector('input[data-sis-toggle]');
    if (inp) inp.checked = !novoValor;
    card.querySelector('.sis-toggle')?.classList.toggle('is-on', !novoValor);
    card.querySelector('.sis-toggle')?.classList.toggle('is-off', novoValor);
    if (rot) rot.textContent = !novoValor ? (m.onText || 'Ativo') : (m.offText || 'Inativo');
    mostrarToast('Não foi possível salvar: ' + error.message, 'erro', 4500);
    return;
  }

  c.valor = novoValor;
  c.atualizado_em = new Date().toISOString();
  // Atualiza linha de auditoria sem recarregar lista inteira
  const auditEl = card.querySelector('.sis-card-audit');
  if (auditEl) auditEl.textContent = `Atualizado agora há pouco`;
  mostrarToast('Atualizado.', 'ok', 1800);
}

// ─── Modal de edição (number / time / date / text) ──────────────────
function abrirModalEdicao(chave) {
  const c = configs.find(x => x.chave === chave);
  if (!c) return;
  const m = c._meta || META[chave] || FALLBACK_META(chave);

  let corpo = '';
  if (c.tipo === 'number') corpo = corpoNumber(c, m);
  else if (c.tipo === 'time') corpo = corpoTime(c, m);
  else if (c.tipo === 'date') corpo = corpoDate(c, m);
  else corpo = corpoText(c, m);

  abrirModal({
    eyebrow: 'Sistema',
    titulo: m.titulo,
    conteudo: `
      <p class="sis-modal-desc">${esc(m.desc || '')}</p>
      ${corpo}
    `,
    rodape: `
      <div id="sis-modal-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="sis-modal-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="sis-modal-salvar" class="btn-primary">Salvar</button>
      </div>`,
  });

  if (c.tipo === 'number') ligarNumber(c, m);
  else if (c.tipo === 'time') ligarTime(c, m);
  else if (c.tipo === 'date') ligarDate(c, m);
  else ligarText(c, m);

  document.querySelector('#sis-modal-cancelar')?.addEventListener('click', () => fecharModal(false));
}

// ─── NUMBER editor: stepper grande + sugestões clicáveis ───────────
function corpoNumber(c, m) {
  const v = Number(c.valor) || 0;
  const min = m.min ?? -Infinity;
  const max = m.max ?? Infinity;
  return `
    <div class="sis-num-editor">
      <div class="sis-num-stepper">
        <button type="button" class="sis-num-btn" data-num="-" aria-label="Diminuir"
                ${v <= min ? 'disabled' : ''}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 12 H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="sis-num-display">
          <input type="number" id="sis-num-input"
                 value="${esc(v)}"
                 ${m.min !== undefined ? `min="${m.min}"` : ''}
                 ${m.max !== undefined ? `max="${m.max}"` : ''}
                 ${m.step ? `step="${m.step}"` : 'step="1"'}
                 inputmode="numeric"
                 aria-label="${esc(m.titulo)}">
          ${m.unidade ? `<span class="sis-num-unidade" id="sis-num-unidade">${esc(unidadeRotulo(v, m))}</span>` : ''}
        </div>
        <button type="button" class="sis-num-btn" data-num="+" aria-label="Aumentar"
                ${v >= max ? 'disabled' : ''}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 12 H19 M12 5 V19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      ${m.min !== undefined && m.max !== undefined ? `
        <div class="sis-num-range">
          <span>${m.min}</span>
          <input type="range" id="sis-num-range" min="${m.min}" max="${m.max}"
                 step="${m.step ?? 1}" value="${esc(v)}" aria-label="Slider">
          <span>${m.max}</span>
        </div>
      ` : ''}

      ${m.sugestoes?.length ? `
        <div class="sis-num-sugestoes">
          <span class="sis-num-sugestoes-rot">Comuns:</span>
          ${m.sugestoes.map(s => `
            <button type="button" class="sis-num-sug ${s === v ? 'is-ativo' : ''}" data-sug="${s}">
              ${s} <span class="sis-num-sug-unid">${esc(unidadeRotulo(s, m))}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
}

function ligarNumber(c, m) {
  const inp  = document.querySelector('#sis-num-input');
  const rng  = document.querySelector('#sis-num-range');
  const unid = document.querySelector('#sis-num-unidade');
  const erro = document.querySelector('#sis-modal-erro');
  const btnSalvar = document.querySelector('#sis-modal-salvar');
  const min = m.min ?? -Infinity;
  const max = m.max ?? Infinity;
  const step = m.step ?? 1;

  function setValor(v, de) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = Number(c.valor) || min;
    n = Math.max(min, Math.min(max, n));
    if (de !== 'input') inp.value = n;
    if (de !== 'range' && rng) rng.value = n;
    if (unid && m.unidade) unid.textContent = unidadeRotulo(n, m);
    document.querySelectorAll('.sis-num-btn').forEach(b => {
      if (b.dataset.num === '-') b.disabled = n <= min;
      if (b.dataset.num === '+') b.disabled = n >= max;
    });
    document.querySelectorAll('.sis-num-sug').forEach(s => {
      s.classList.toggle('is-ativo', Number(s.dataset.sug) === n);
    });
    erro.classList.add('hidden');
    btnSalvar.disabled = false;
  }

  inp.addEventListener('input', () => setValor(inp.value, 'input'));
  rng?.addEventListener('input', () => setValor(rng.value, 'range'));
  document.querySelectorAll('.sis-num-btn').forEach(b => {
    b.addEventListener('click', () => {
      const cur = Number(inp.value) || 0;
      const novo = b.dataset.num === '+' ? cur + step : cur - step;
      setValor(novo, 'btn');
    });
  });
  document.querySelectorAll('.sis-num-sug').forEach(s => {
    s.addEventListener('click', () => setValor(Number(s.dataset.sug), 'sug'));
  });

  // Long-press no +/− pra acelerar (incrementa 5x após 600ms)
  document.querySelectorAll('.sis-num-btn').forEach(b => {
    let timer = null, accel = null;
    const inicia = () => {
      timer = setTimeout(() => {
        accel = setInterval(() => {
          const cur = Number(inp.value) || 0;
          setValor(b.dataset.num === '+' ? cur + step : cur - step, 'btn');
        }, 80);
      }, 500);
    };
    const para = () => { clearTimeout(timer); clearInterval(accel); };
    b.addEventListener('pointerdown', inicia);
    b.addEventListener('pointerup', para);
    b.addEventListener('pointerleave', para);
    b.addEventListener('pointercancel', para);
  });

  inp.focus(); inp.select?.();

  btnSalvar.addEventListener('click', async () => {
    const n = Number(inp.value);
    if (!Number.isFinite(n) || n < min || n > max) {
      erro.classList.remove('hidden');
      erro.textContent = `Informe um número entre ${min} e ${max}.`;
      return;
    }
    await salvarRPC(c.chave, n);
  });
}

// ─── TIME editor: dois steppers HH e MM ────────────────────────────
function corpoTime(c, m) {
  const [hh, mm] = (typeof c.valor === 'string' ? c.valor : '00:00').split(':');
  return `
    <div class="sis-time-editor">
      <div class="sis-time-grupo">
        <button type="button" class="sis-time-btn" data-time="hh" data-dir="up" aria-label="Hora +">▲</button>
        <input type="number" id="sis-time-hh" min="0" max="23" value="${esc(Number(hh) || 0)}" aria-label="Hora">
        <button type="button" class="sis-time-btn" data-time="hh" data-dir="down" aria-label="Hora −">▼</button>
        <span class="sis-time-rot">hora</span>
      </div>
      <span class="sis-time-sep" aria-hidden="true">:</span>
      <div class="sis-time-grupo">
        <button type="button" class="sis-time-btn" data-time="mm" data-dir="up" aria-label="Minuto +">▲</button>
        <input type="number" id="sis-time-mm" min="0" max="59" value="${esc(Number(mm) || 0)}" aria-label="Minuto">
        <button type="button" class="sis-time-btn" data-time="mm" data-dir="down" aria-label="Minuto −">▼</button>
        <span class="sis-time-rot">minuto</span>
      </div>
    </div>
    ${m.sufixo ? `<p class="sis-time-sufixo">${esc(m.sufixo)}</p>` : ''}
  `;
}

function ligarTime(c, m) {
  const hh = document.querySelector('#sis-time-hh');
  const mm = document.querySelector('#sis-time-mm');
  const erro = document.querySelector('#sis-modal-erro');
  const btnSalvar = document.querySelector('#sis-modal-salvar');

  function clamp(el, max) {
    let n = parseInt(el.value, 10);
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.min(max, n));
    el.value = String(n).padStart(2, '0');
  }
  hh.addEventListener('blur', () => clamp(hh, 23));
  mm.addEventListener('blur', () => clamp(mm, 59));

  document.querySelectorAll('.sis-time-btn').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.time === 'hh' ? hh : mm;
      const max = b.dataset.time === 'hh' ? 23 : 59;
      let n = parseInt(t.value, 10) || 0;
      n = b.dataset.dir === 'up' ? (n + 1) % (max + 1) : (n - 1 + max + 1) % (max + 1);
      t.value = String(n).padStart(2, '0');
    });
  });

  hh.focus(); hh.select?.();

  btnSalvar.addEventListener('click', async () => {
    clamp(hh, 23); clamp(mm, 59);
    const v = `${hh.value}:${mm.value}`;
    if (!/^\d{2}:\d{2}$/.test(v)) {
      erro.classList.remove('hidden');
      erro.textContent = 'Horário inválido.';
      return;
    }
    await salvarRPC(c.chave, v);
  });
}

// ─── DATE editor ────────────────────────────────────────────────────
function corpoDate(c, m) {
  return `
    <div class="sis-date-editor">
      <input type="date" id="sis-date-input" class="field-input" value="${esc(c.valor || '')}" />
    </div>`;
}
function ligarDate(c) {
  const inp = document.querySelector('#sis-date-input');
  instalarPopDatasEm(document.querySelector('.sis-date-editor'));
  const erro = document.querySelector('#sis-modal-erro');
  const btnSalvar = document.querySelector('#sis-modal-salvar');
  setTimeout(() => inp.focus(), 50);
  btnSalvar.addEventListener('click', async () => {
    const v = inp.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      erro.classList.remove('hidden');
      erro.textContent = 'Data inválida.';
      return;
    }
    await salvarRPC(c.chave, v);
  });
}

// ─── TEXT editor: input grande com contador ────────────────────────
function corpoText(c, m) {
  const v = c.valor ?? '';
  return `
    <div class="sis-text-editor">
      <input type="text" id="sis-text-input" class="sis-text-input"
             value="${esc(v)}" maxlength="200"
             placeholder="Novo valor" />
      <p class="sis-text-contador" id="sis-text-contador">${String(v).length}/200</p>
    </div>`;
}
function ligarText(c) {
  const inp = document.querySelector('#sis-text-input');
  const cont = document.querySelector('#sis-text-contador');
  const erro = document.querySelector('#sis-modal-erro');
  const btnSalvar = document.querySelector('#sis-modal-salvar');
  inp.addEventListener('input', () => { cont.textContent = `${inp.value.length}/200`; });
  setTimeout(() => { inp.focus(); inp.select?.(); }, 50);
  btnSalvar.addEventListener('click', async () => {
    const v = inp.value;
    if (v.length > 200) {
      erro.classList.remove('hidden');
      erro.textContent = 'Texto longo demais (máx 200).';
      return;
    }
    await salvarRPC(c.chave, v);
  });
}

// ─── Salvar ─────────────────────────────────────────────────────────
async function salvarRPC(chave, valor) {
  const btn = document.querySelector('#sis-modal-salvar');
  const erro = document.querySelector('#sis-modal-erro');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  const { error } = await supabase.rpc('atualizar_config', {
    p_chave: chave,
    p_valor: valor,
  });

  btn.removeAttribute('aria-busy');

  if (error) {
    btn.disabled = false;
    erro.classList.remove('hidden');
    erro.textContent = error.message || 'Erro ao salvar.';
    return;
  }

  fecharModal(true);
  mostrarToast('Configuração atualizada.', 'ok', 2200);
  await carregarLista();
}

// ─── Helpers ─────────────────────────────────────────────────────────
function unidadeRotulo(v, m) {
  if (!m.unidade) return '';
  if (m.unidade === 'horário') return '';
  const n = Number(v);
  return n === 1 && m.unidadeSing ? m.unidadeSing : m.unidade;
}

function formatarValorVisivel(c, m) {
  const v = c.valor;
  if (c.tipo === 'time' && typeof v === 'string') return v;
  if (c.tipo === 'boolean') return v ? (m.onText || 'Ativo') : (m.offText || 'Inativo');
  if (v === null || v === undefined) return '—';
  return String(v);
}

function formatarRelativo(ts) {
  if (!ts) return 'nunca';
  const d = new Date(ts);
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora há pouco';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 86400 * 7) return `há ${Math.floor(seg / 86400)} dias`;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d).replace('.', '');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function cssEsc(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
}
