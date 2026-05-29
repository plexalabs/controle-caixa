// configuracoes-sistema.js — /configuracoes/sistema/<grupo> (refator v2).
//
// Cada GRUPO de parâmetros é uma tela separada — acessada pela sidebar de
// Configurações. /configuracoes/sistema sem grupo cai no primeiro.
// Boolean alterna no próprio cartão (optimistic); número / horário / data
// / texto abrem um editor em modal. Auditoria visível por item.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_VOLTAR = `<svg ${SVG}><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>`;
const ICON_ALERTA = `<svg ${SVG}><path d="M8 1.8 14.7 13.5H1.3L8 1.8Z"/><path d="M8 6.3v3.4M8 11.6h.01"/></svg>`;
const ICON_LAPIS  = `<svg ${SVG}><path d="M11.6 2.4a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3 8.1-8.1Z"/></svg>`;

// Ícones nomeados — dão rosto a cada parâmetro e grupo.
const ICONS = {
  calendario: `<svg ${SVG}><rect x="2.2" y="3" width="11.6" height="10.8" rx="1.6"/><path d="M2.2 6.3h11.6M5.4 1.6v2.6M10.6 1.6v2.6"/></svg>`,
  sol: `<svg ${SVG}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M2.4 2.4l1 1M12.6 12.6l1 1M1.5 8H3M13 8h1.5M2.4 13.6l1-1M12.6 3.4l1-1"/></svg>`,
  lua: `<svg ${SVG}><path d="M13 9.3A5.6 5.6 0 0 1 6.7 3 5.6 5.6 0 1 0 13 9.3Z"/></svg>`,
  intervalo: `<svg ${SVG}><path d="M3.5 5.6h6.2a2.8 2.8 0 0 1 2.8 2.8M12.5 10.4H6.3a2.8 2.8 0 0 1-2.8-2.8"/><path d="M8.3 3.4 10.5 5.6 8.3 7.8M7.7 12.6 5.5 10.4 7.7 8.2"/></svg>`,
  alerta: `<svg ${SVG}><path d="M8 2.2 14.5 13.4H1.5L8 2.2Z"/><path d="M8 6.4v3.3M8 11.5h.01"/></svg>`,
  sync: `<svg ${SVG}><path d="M2.7 6.6A5.5 5.5 0 0 1 12 4.4M13.3 9.4A5.5 5.5 0 0 1 4 11.6"/><path d="M11.6 1.9v2.6H9M4.4 14.1v-2.6H7"/></svg>`,
  caixa: `<svg ${SVG}><rect x="2" y="4.6" width="12" height="8.4" rx="1.3"/><path d="M2 7.6h12M6.3 4.6V3.1h3.4v1.5"/></svg>`,
  janela: `<svg ${SVG}><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6"/><path d="M8 2.4v11.2M2.4 8h11.2"/></svg>`,
  sino: `<svg ${SVG}><path d="M4.7 6.7a3.3 3.3 0 0 1 6.6 0c0 3.2 1.4 4.1 1.4 4.1H3.3s1.4-.9 1.4-4.1Z"/><path d="M6.6 13a1.6 1.6 0 0 0 2.8 0"/></svg>`,
  etiqueta: `<svg ${SVG}><path d="M2.6 7.4 7.4 2.6h4.4a1.4 1.4 0 0 1 1.4 1.4v4.4L8.4 13.2 2.6 7.4Z"/><circle cx="10" cy="6" r="1"/></svg>`,
  arquivo: `<svg ${SVG}><rect x="2" y="2.8" width="12" height="3.3" rx="1"/><path d="M3 6.1v6.4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.1"/><path d="M6.3 9h3.4"/></svg>`,
  dominio: `<svg ${SVG}><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 1.8 2.2 10.2 0 12M8 2c-2.2 1.8-2.2 10.2 0 12"/></svg>`,
  antena: `<svg ${SVG}><path d="M8 9.7v4.3"/><circle cx="8" cy="7.6" r="1.5"/><path d="M5.4 10.2a3.7 3.7 0 0 1 0-5.2M10.6 5a3.7 3.7 0 0 1 0 5.2M3.6 12a6.2 6.2 0 0 1 0-8.8M12.4 3.2a6.2 6.2 0 0 1 0 8.8"/></svg>`,
  ajuste: `<svg ${SVG}><path d="M3 4.5h10M3 8h10M3 11.5h10"/><circle cx="6" cy="4.5" r="1.7" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1.7" fill="currentColor" stroke="none"/><circle cx="5.5" cy="11.5" r="1.7" fill="currentColor" stroke="none"/></svg>`,
};

// Grupos — cada um é uma tela própria, listada na sidebar de configurações.
const GRUPOS = [
  { v: 'caixa', tom: 'accent', icon: 'caixa', rotulo: 'Caixas',
    desc: 'Quando o caixa diário é aberto automaticamente, sem ninguém precisar pedir.' },
  { v: 'janela', tom: 'info', icon: 'janela', rotulo: 'Janela operacional',
    desc: 'Os dias e os horários em que o sistema pode ser usado.' },
  { v: 'notificacao', tom: 'warn', icon: 'sino', rotulo: 'Notificações',
    desc: 'Quando e com que frequência o sistema avisa a equipe — e os dados do serviço de push.' },
  { v: 'lancamento', tom: 'accent', icon: 'etiqueta', rotulo: 'Lançamentos e pendências',
    desc: 'Prazos de edição dos lançamentos e quando uma pendência ganha urgência.' },
  { v: 'dados', tom: 'ink', icon: 'sync', rotulo: 'Sincronização e dados',
    desc: 'A ponte com a planilha Excel e por quanto tempo os registros ficam guardados.' },
  { v: 'acesso', tom: 'danger', icon: 'dominio', rotulo: 'Acesso',
    desc: 'Quem pode criar uma conta no sistema.' },
];
const MAP_GRUPO = Object.fromEntries(GRUPOS.map(g => [g.v, g]));

// METADADOS por chave — nome amigável, grupo, descrição, ícone e limites.
const META = {
  // ── Caixas ──
  'caixa.gerar_sabado': {
    grupo: 'caixa', icon: 'calendario',
    titulo: 'Gerar caixa aos sábados',
    desc: 'Quando ativo, o sistema abre um caixa novo automaticamente todo sábado de manhã.',
    onText: 'Sábado conta', offText: 'Sábado de fora',
  },
  'caixa.gerar_domingo': {
    grupo: 'caixa', icon: 'calendario',
    titulo: 'Gerar caixa aos domingos',
    desc: 'Quando ativo, o sistema abre um caixa novo automaticamente todo domingo de manhã.',
    onText: 'Domingo conta', offText: 'Domingo de fora',
  },
  'caixa.auto_fechar_vazio': {
    grupo: 'caixa', icon: 'arquivo',
    titulo: 'Fechar caixas vazios sozinho',
    desc: 'Quando ativo, o sistema fecha automaticamente os caixas que passaram do dia sem nenhum lançamento. Roda 1x por dia, de manhã, sem incomodar ninguém.',
    onText: 'Auto-fechar ativo', offText: 'Manual',
  },
  'caixa.auto_fechar_vazio_dias': {
    grupo: 'caixa', icon: 'intervalo',
    titulo: 'Espera antes de auto-fechar',
    desc: 'Quantos dias depois da data do caixa o sistema espera antes de fechar sozinho. Em 1, o caixa de ontem fecha hoje de manhã. Em 7, espera uma semana inteira sem lançamento.',
    unidade: 'dias', unidadeSing: 'dia',
    min: 1, max: 30, step: 1, sugestoes: [1, 2, 3, 7],
  },

  // ── Janela operacional ──
  'janela_op_ativa': {
    grupo: 'janela', icon: 'janela',
    titulo: 'Restrição de horário',
    desc: 'Quando ativa, o sistema só pode ser usado dentro da janela operacional definida abaixo.',
    onText: 'Janela ativa', offText: 'Sem restrição',
  },
  'janela_op_dias_semana': {
    grupo: 'janela', icon: 'calendario',
    titulo: 'Dias da semana ativos',
    desc: 'Em quais dias o sistema fica disponível. Números de 1 (segunda) a 7 (domingo), separados por vírgula.',
  },
  'janela_op_hora_ini': {
    grupo: 'janela', icon: 'sol',
    titulo: 'Hora de abertura',
    desc: 'Hora em que o sistema abre para uso, nos dias ativos.',
    min: 0, max: 23, step: 1, sugestoes: [6, 7, 8, 9],
  },
  'janela_op_hora_fim': {
    grupo: 'janela', icon: 'lua',
    titulo: 'Hora de fechamento',
    desc: 'Hora em que o sistema fecha para uso.',
    min: 0, max: 23, step: 1, sugestoes: [18, 19, 20, 22],
  },

  // ── Notificações ──
  'notificacao.horario_inicio': {
    grupo: 'notificacao', icon: 'sol',
    titulo: 'Início das notificações',
    desc: 'A partir desse horário, o sistema começa a enviar alertas para a equipe.',
    unidade: 'horário', sufixo: 'da manhã',
  },
  'notificacao.horario_fim': {
    grupo: 'notificacao', icon: 'lua',
    titulo: 'Fim das notificações',
    desc: 'Hora limite para envio de alertas. Depois disso, o sistema fica em silêncio.',
    unidade: 'horário', sufixo: 'da noite',
  },
  'notificacao.intervalo_horas': {
    grupo: 'notificacao', icon: 'intervalo',
    titulo: 'Frequência das notificações',
    desc: 'Quantas horas entre cada envio durante a janela ativa.',
    unidade: 'horas', unidadeSing: 'hora',
    min: 1, max: 12, step: 1, sugestoes: [2, 4, 6, 8],
  },
  'push_vapid_public_key': {
    grupo: 'notificacao', icon: 'antena',
    titulo: 'Chave pública de push',
    desc: 'Chave técnica (VAPID) do serviço de notificação push. Não altere sem orientação.',
  },
  'push_vapid_subject': {
    grupo: 'notificacao', icon: 'antena',
    titulo: 'Contato do serviço de push',
    desc: 'E-mail de contato exigido pelo protocolo de push (VAPID).',
  },

  // ── Lançamentos e pendências ──
  'lancamento.editar_categoria_minutos': {
    grupo: 'lancamento', icon: 'etiqueta',
    titulo: 'Prazo para trocar a categoria',
    desc: 'Por quantos minutos, depois de criar um lançamento, ainda dá pra mudar a categoria.',
    unidade: 'minutos', unidadeSing: 'minuto',
    min: 0, max: 240, step: 5, sugestoes: [15, 30, 60, 120],
  },
  'pendencia.dias_alerta_atraso': {
    grupo: 'lancamento', icon: 'alerta',
    titulo: 'Dias até a pendência virar urgente',
    desc: 'Quantos dias úteis uma pendência fica em aberto antes de ganhar destaque vermelho no painel.',
    unidade: 'dias úteis', unidadeSing: 'dia útil',
    min: 1, max: 30, step: 1, sugestoes: [3, 5, 7, 15],
  },

  // ── Sincronização e dados ──
  'sync.intervalo_minutos': {
    grupo: 'dados', icon: 'sync',
    titulo: 'Intervalo entre sincronizações',
    desc: 'Tempo entre cada sincronização da planilha Excel com o sistema.',
    unidade: 'minutos', unidadeSing: 'minuto',
    min: 1, max: 60, step: 1, sugestoes: [5, 15, 30, 60],
  },
  'dias_retencao_arquivamento': {
    grupo: 'dados', icon: 'arquivo',
    titulo: 'Retenção antes de arquivar',
    desc: 'Quantos dias um registro permanece ativo antes de ir para o arquivo.',
    unidade: 'dias', unidadeSing: 'dia',
    min: 30, max: 1825, step: 5, sugestoes: [180, 365, 730],
  },

  // ── Acesso ──
  'auth.dominio_permitido': {
    grupo: 'acesso', icon: 'dominio',
    titulo: 'Domínio de e-mail permitido',
    desc: 'Só e-mails desse domínio podem criar conta no sistema. Ex.: empresa.com.br',
  },
};
const FALLBACK_META = (chave) => ({
  grupo: 'acesso',
  titulo: chave.replace(/[._]/g, ' ').replace(/^./, c => c.toUpperCase()),
  desc: '',
  icon: 'ajuste',
});

let configs = [];

function grupoDaURL() {
  const m = location.pathname.match(/^\/configuracoes\/sistema\/([\w-]+)/);
  const g = m && m[1];
  return MAP_GRUPO[g] ? g : GRUPOS[0].v;
}

export async function renderSistema() {
  await carregarPermissoes();
  if (!temPermissaoSync('config.editar_sistema')) {
    document.querySelector('#app').innerHTML = await renderShell({
      conteudo: `
        <main class="sst">
          <div class="sst-restrito">
            <p class="sst-restrito-title">Acesso restrito</p>
            <p class="sst-restrito-msg">Os parâmetros do sistema são restritos a administradores.</p>
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  // /configuracoes/sistema "puro" → primeiro grupo (URL e sidebar batem).
  if (location.pathname === '/configuracoes/sistema') {
    history.replaceState({}, '', `/configuracoes/sistema/${GRUPOS[0].v}`);
  }
  const grupo = grupoDaURL();
  const def = MAP_GRUPO[grupo];

  document.querySelector('#app').innerHTML = await renderShell({
    conteudo: `
    <main id="main" class="sst">
      <a href="/configuracoes" data-link class="sst-voltar">${ICON_VOLTAR} Configurações</a>

      <header class="sst-header" data-tom="${esc(def.tom)}">
        <span class="sst-header-icone" aria-hidden="true">${ICONS[def.icon] || ICONS.ajuste}</span>
        <div class="sst-header-txt">
          <p class="sst-eyebrow">Parâmetros do sistema</p>
          <h1 class="sst-title">${esc(def.rotulo)}</h1>
          <p class="sst-sub">${esc(def.desc)}</p>
        </div>
      </header>

      <div class="sst-aviso">
        ${ICON_ALERTA}
        <span><strong>Atenção:</strong> alterações entram em vigor na próxima
        execução de cada job — notificações e geração de caixa usam o valor
        no momento de rodar.</span>
      </div>

      <section id="sst-conteudo" aria-live="polite"></section>
    </main>`,
  });

  ligarShell();
  await carregarConfigs(grupo);
}

// ─── Carga ───────────────────────────────────────────────────────────
async function carregarConfigs(grupo) {
  const slot = document.querySelector('#sst-conteudo');
  if (slot) slot.innerHTML = `<div class="sst-skel">${[1,2,3].map(() => `<div class="sst-skel-item"></div>`).join('')}</div>`;

  const { data, error } = await supabase.from('config_visualizacao').select('*').order('chave');
  if (error) {
    if (slot) slot.innerHTML = `<p class="sst-erro">Não foi possível carregar. ${esc(error.message)}</p>`;
    return;
  }
  configs = (data || []).map(c => ({ ...c, _meta: META[c.chave] || FALLBACK_META(c.chave) }));
  renderGrupo(grupo);
}

function renderGrupo(grupo) {
  const slot = document.querySelector('#sst-conteudo');
  if (!slot) return;
  const def = MAP_GRUPO[grupo];
  const itens = configs.filter(c => c._meta.grupo === grupo);

  if (itens.length === 0) {
    slot.innerHTML = `<p class="sst-erro">Nenhum parâmetro neste grupo.</p>`;
    return;
  }

  slot.innerHTML = `<div class="sst-lista">${itens.map((c, i) => cardItem(c, i, def?.tom)).join('')}</div>`;

  slot.querySelectorAll('[data-sst-toggle]').forEach(el => {
    el.addEventListener('change', (e) => onToggleBoolean(el.dataset.sstToggle, e.target.checked));
  });
  slot.querySelectorAll('[data-sst-abrir]').forEach(card => {
    card.addEventListener('click', () => abrirModalEdicao(card.dataset.sstAbrir));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModalEdicao(card.dataset.sstAbrir); }
    });
  });
}

function cardItem(c, i, tom) {
  const m = c._meta;
  const audit = `Atualizado ${formatarRelativo(c.atualizado_em)}`
              + (c.atualizado_por_email ? ' · por ' + esc(c.atualizado_por_email) : '');
  const delay = `style="animation-delay:${Math.min(i * 45, 320)}ms"`;
  const icone = `<span class="sst-item-icone" aria-hidden="true">${ICONS[m.icon] || ICONS.ajuste}</span>`;
  const corpo = `
    <div class="sst-item-corpo">
      <p class="sst-item-titulo">${esc(m.titulo)}</p>
      ${m.desc ? `<p class="sst-item-desc">${esc(m.desc)}</p>` : ''}
      <p class="sst-item-audit">${audit}</p>
    </div>`;

  if (c.tipo === 'boolean') {
    const on = c.valor === true;
    return `
      <article class="sst-item" data-tom="${esc(tom || '')}" ${delay}>
        ${icone}
        ${corpo}
        <div class="sst-bool">
          <span class="sst-bool-rotulo" data-sst-rotulo>${esc(on ? (m.onText || 'Ativo') : (m.offText || 'Inativo'))}</span>
          <label class="sst-switch">
            <input type="checkbox" data-sst-toggle="${esc(c.chave)}" ${on ? 'checked' : ''}
                   aria-label="${esc(m.titulo)}">
            <span class="sst-switch-trilho"><span class="sst-switch-dot"></span></span>
          </label>
        </div>
      </article>`;
  }

  return `
    <article class="sst-item sst-item--clicavel" data-tom="${esc(tom || '')}" data-sst-abrir="${esc(c.chave)}"
             role="button" tabindex="0" ${delay}>
      ${icone}
      ${corpo}
      <div class="sst-item-valor">
        <span class="sst-valor-num">${esc(formatarValorVisivel(c, m))}</span>
        ${m.unidade ? `<span class="sst-valor-unid">${esc(unidadeRotulo(c.valor, m))}</span>` : ''}
        <span class="sst-valor-lapis" aria-hidden="true">${ICON_LAPIS}</span>
      </div>
    </article>`;
}

// ─── Toggle boolean (inline, optimistic) ─────────────────────────────
async function onToggleBoolean(chave, novoValor) {
  const card = document.querySelector(`[data-sst-toggle="${cssEsc(chave)}"]`)?.closest('.sst-item');
  if (!card) return;
  const c = configs.find(x => x.chave === chave);
  if (!c) return;
  const m = c._meta || META[chave] || FALLBACK_META(chave);
  const rot = card.querySelector('[data-sst-rotulo]');
  if (rot) rot.textContent = novoValor ? (m.onText || 'Ativo') : (m.offText || 'Inativo');

  const { error } = await supabase.rpc('atualizar_config', { p_chave: chave, p_valor: novoValor });

  if (error) {
    const inp = card.querySelector('input[data-sst-toggle]');
    if (inp) inp.checked = !novoValor;
    if (rot) rot.textContent = !novoValor ? (m.onText || 'Ativo') : (m.offText || 'Inativo');
    mostrarToast('Não foi possível salvar: ' + error.message, 'erro', 4500);
    return;
  }

  c.valor = novoValor;
  c.atualizado_em = new Date().toISOString();
  const auditEl = card.querySelector('.sst-item-audit');
  if (auditEl) auditEl.textContent = 'Atualizado agora há pouco';
  mostrarToast('Atualizado.', 'ok', 1800);
}

// ─── Modal de edição ─────────────────────────────────────────────────
function abrirModalEdicao(chave) {
  const c = configs.find(x => x.chave === chave);
  if (!c) return;
  const m = c._meta || META[chave] || FALLBACK_META(chave);

  let corpo = '';
  if (c.tipo === 'number')    corpo = corpoNumber(c, m);
  else if (c.tipo === 'time') corpo = corpoTime(c, m);
  else if (c.tipo === 'date') corpo = corpoDate(c);
  else                        corpo = corpoText(c);

  abrirModal({
    eyebrow: 'Sistema',
    titulo: m.titulo,
    conteudo: `${m.desc ? `<p class="sst-modal-desc">${esc(m.desc)}</p>` : ''}${corpo}`,
    rodape: `
      <div id="sst-modal-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="sst-modal-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="sst-modal-salvar" class="btn-primary">Salvar</button>
      </div>`,
  });

  if (c.tipo === 'number')    ligarNumber(c, m);
  else if (c.tipo === 'time') ligarTime(c);
  else if (c.tipo === 'date') ligarDate(c);
  else                        ligarText(c);

  document.querySelector('#sst-modal-cancelar')?.addEventListener('click', () => fecharModal(false));
}

// ── NUMBER ──
function corpoNumber(c, m) {
  const v = Number(c.valor) || 0;
  const min = m.min ?? -Infinity;
  const max = m.max ?? Infinity;
  return `
    <div class="sst-num-stepper">
      <button type="button" class="sst-num-btn" data-num="-" aria-label="Diminuir" ${v <= min ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
      <div class="sst-num-display">
        <input type="number" id="sst-num-input" class="sst-num-input" value="${esc(v)}"
               ${m.min !== undefined ? `min="${m.min}"` : ''} ${m.max !== undefined ? `max="${m.max}"` : ''}
               step="${m.step ?? 1}" inputmode="numeric" aria-label="${esc(m.titulo)}">
        ${m.unidade ? `<span class="sst-num-unidade" id="sst-num-unidade">${esc(unidadeRotulo(v, m))}</span>` : ''}
      </div>
      <button type="button" class="sst-num-btn" data-num="+" aria-label="Aumentar" ${v >= max ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
    </div>
    ${m.min !== undefined && m.max !== undefined ? `
      <div class="sst-num-range">
        <span>${m.min}</span>
        <input type="range" id="sst-num-range" min="${m.min}" max="${m.max}" step="${m.step ?? 1}" value="${esc(v)}" aria-label="Slider">
        <span>${m.max}</span>
      </div>` : ''}
    ${m.sugestoes?.length ? `
      <div class="sst-num-sugestoes">
        <span class="sst-num-sugestoes-rot">Comuns</span>
        ${m.sugestoes.map(s => `<button type="button" class="sst-num-sug ${s === v ? 'is-ativo' : ''}" data-sug="${s}">
          ${s} <span class="sst-num-sug-unid">${esc(unidadeRotulo(s, m))}</span>
        </button>`).join('')}
      </div>` : ''}`;
}

function ligarNumber(c, m) {
  const inp = document.querySelector('#sst-num-input');
  const rng = document.querySelector('#sst-num-range');
  const unid = document.querySelector('#sst-num-unidade');
  const erro = document.querySelector('#sst-modal-erro');
  const btnSalvar = document.querySelector('#sst-modal-salvar');
  const min = m.min ?? -Infinity;
  const max = m.max ?? Infinity;
  const step = m.step ?? 1;

  function setValor(v, de) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = Number(c.valor) || (Number.isFinite(min) ? min : 0);
    n = Math.max(min, Math.min(max, n));
    if (de !== 'input') inp.value = n;
    if (de !== 'range' && rng) rng.value = n;
    if (unid && m.unidade) unid.textContent = unidadeRotulo(n, m);
    document.querySelectorAll('.sst-num-btn').forEach(b => {
      if (b.dataset.num === '-') b.disabled = n <= min;
      if (b.dataset.num === '+') b.disabled = n >= max;
    });
    document.querySelectorAll('.sst-num-sug').forEach(s => {
      s.classList.toggle('is-ativo', Number(s.dataset.sug) === n);
    });
    erro.classList.add('hidden');
  }

  inp.addEventListener('input', () => setValor(inp.value, 'input'));
  rng?.addEventListener('input', () => setValor(rng.value, 'range'));
  document.querySelectorAll('.sst-num-btn').forEach(b => {
    b.addEventListener('click', () => {
      const cur = Number(inp.value) || 0;
      setValor(b.dataset.num === '+' ? cur + step : cur - step, 'btn');
    });
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
  document.querySelectorAll('.sst-num-sug').forEach(s => {
    s.addEventListener('click', () => setValor(Number(s.dataset.sug), 'sug'));
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

// ── TIME ──
function corpoTime(c, m) {
  const [hh, mm] = (typeof c.valor === 'string' ? c.valor : '00:00').split(':');
  return `
    <div class="sst-time-editor">
      <div class="sst-time-grupo">
        <button type="button" class="sst-time-btn" data-time="hh" data-dir="up" aria-label="Hora +">▲</button>
        <input type="number" id="sst-time-hh" min="0" max="23" value="${esc(String(Number(hh) || 0).padStart(2, '0'))}" aria-label="Hora">
        <button type="button" class="sst-time-btn" data-time="hh" data-dir="down" aria-label="Hora −">▼</button>
        <span class="sst-time-rot">hora</span>
      </div>
      <span class="sst-time-sep" aria-hidden="true">:</span>
      <div class="sst-time-grupo">
        <button type="button" class="sst-time-btn" data-time="mm" data-dir="up" aria-label="Minuto +">▲</button>
        <input type="number" id="sst-time-mm" min="0" max="59" value="${esc(String(Number(mm) || 0).padStart(2, '0'))}" aria-label="Minuto">
        <button type="button" class="sst-time-btn" data-time="mm" data-dir="down" aria-label="Minuto −">▼</button>
        <span class="sst-time-rot">minuto</span>
      </div>
    </div>
    ${m.sufixo ? `<p class="sst-time-sufixo">${esc(m.sufixo)}</p>` : ''}`;
}

function ligarTime(c) {
  const hh = document.querySelector('#sst-time-hh');
  const mm = document.querySelector('#sst-time-mm');
  const erro = document.querySelector('#sst-modal-erro');
  const btnSalvar = document.querySelector('#sst-modal-salvar');

  function clamp(el, max) {
    let n = parseInt(el.value, 10);
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.min(max, n));
    el.value = String(n).padStart(2, '0');
  }
  hh.addEventListener('blur', () => clamp(hh, 23));
  mm.addEventListener('blur', () => clamp(mm, 59));

  document.querySelectorAll('.sst-time-btn').forEach(b => {
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

// ── DATE ──
function corpoDate(c) {
  return `
    <div class="field" style="margin-bottom:0">
      <input type="date" id="sst-date-input" class="field-input" value="${esc(c.valor || '')}">
      <span class="field-underline"></span>
    </div>`;
}
function ligarDate(c) {
  const inp = document.querySelector('#sst-date-input');
  const erro = document.querySelector('#sst-modal-erro');
  const btnSalvar = document.querySelector('#sst-modal-salvar');
  setTimeout(() => inp.focus(), 50);
  btnSalvar.addEventListener('click', async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) {
      erro.classList.remove('hidden');
      erro.textContent = 'Data inválida.';
      return;
    }
    await salvarRPC(c.chave, inp.value);
  });
}

// ── TEXT ──
function corpoText(c) {
  const v = c.valor ?? '';
  return `
    <div class="field" style="margin-bottom:0">
      <input type="text" id="sst-text-input" class="field-input" value="${esc(v)}" maxlength="240" placeholder="Novo valor">
      <span class="field-underline"></span>
      <p class="sst-text-contador" id="sst-text-contador">${String(v).length}/240</p>
    </div>`;
}
function ligarText(c) {
  const inp = document.querySelector('#sst-text-input');
  const cont = document.querySelector('#sst-text-contador');
  const erro = document.querySelector('#sst-modal-erro');
  const btnSalvar = document.querySelector('#sst-modal-salvar');
  inp.addEventListener('input', () => { cont.textContent = `${inp.value.length}/240`; });
  setTimeout(() => { inp.focus(); inp.select?.(); }, 50);
  btnSalvar.addEventListener('click', async () => {
    if (inp.value.length > 240) {
      erro.classList.remove('hidden');
      erro.textContent = 'Texto longo demais (máx. 240).';
      return;
    }
    await salvarRPC(c.chave, inp.value);
  });
}

// ─── Salvar ──────────────────────────────────────────────────────────
async function salvarRPC(chave, valor) {
  const btn = document.querySelector('#sst-modal-salvar');
  const erro = document.querySelector('#sst-modal-erro');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  const { error } = await supabase.rpc('atualizar_config', { p_chave: chave, p_valor: valor });
  btn.removeAttribute('aria-busy');

  if (error) {
    btn.disabled = false;
    erro.classList.remove('hidden');
    erro.textContent = error.message || 'Erro ao salvar.';
    return;
  }

  fecharModal(true);
  mostrarToast('Configuração atualizada.', 'ok', 2200);
  await carregarConfigs(grupoDaURL());
}

// ─── Helpers ─────────────────────────────────────────────────────────
function unidadeRotulo(v, m) {
  if (!m.unidade || m.unidade === 'horário') return '';
  return Number(v) === 1 && m.unidadeSing ? m.unidadeSing : m.unidade;
}

function formatarValorVisivel(c, m) {
  const v = c.valor;
  if (c.tipo === 'time' && typeof v === 'string') return v;
  if (c.tipo === 'boolean') return v ? (m.onText || 'Ativo') : (m.offText || 'Inativo');
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  // Textos longos (chaves técnicas) entram truncados no cartão.
  if (c.tipo === 'text' && s.length > 22) return s.slice(0, 22) + '…';
  return s;
}

function formatarRelativo(ts) {
  if (!ts) return 'nunca';
  const d = new Date(ts);
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora há pouco';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 86400 * 7) return `há ${Math.floor(seg / 86400)} dias`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(d).replace('.', '');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function cssEsc(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
}
