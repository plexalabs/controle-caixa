// topbar.js — Barra superior global do app autenticado.
// Renderizada pelo shell.js logo apos a sidebar. Mostra search
// global + bell + botao 'CTA do caixa' (label e tom dinamicos
// conforme estado do caixa de hoje).
//
// O botao reage ao evento global 'caixa-hoje-mudou' disparado
// pelas telas que conhecem o estado (dashboard, caixa.js, etc).
//   window.dispatchEvent(new CustomEvent('caixa-hoje-mudou', {
//     detail: { estado: 'aberto' | 'em_conferencia' | 'fechado' |
//                       'arquivado' | null }
//   }));
// Se ainda nao chegou evento, default e null (sem caixa aberto).

import { navegar } from '../app/router.js';
import { supabase, pegarSessao } from '../app/supabase.js';
import { isoData } from '../app/dominio.js';

// Mapa { estado -> { label, tone, descricao } }. Tone determina
// o estilo do botao na topbar (primary verde, warn amber, ghost cinza).
const CTA_POR_ESTADO = {
  null: {
    label: 'Abrir caixa',
    tone:  'primary',
  },
  aberto: {
    label: 'Novo lançamento',
    tone:  'primary',
  },
  em_conferencia: {
    label: 'Conferir caixa',
    tone:  'warn',
  },
  fechado: {
    label: 'Ver caixa de hoje',
    tone:  'ghost',
  },
  arquivado: {
    label: 'Ver caixa de hoje',
    tone:  'ghost',
  },
};

let estadoAtual = null;     // estado mais recente conhecido

export function renderTopbar() {
  return `
    <header class="tb" role="banner">
      <form class="tb-search" id="tb-search" role="search" autocomplete="off">
        <span class="tb-search-icon" aria-hidden="true">${svgSearch()}</span>
        <input type="search" id="tb-search-input"
               placeholder="Buscar NF, pedido, cliente, valor…"
               aria-label="Busca global" />
        <kbd class="tb-search-kbd">/</kbd>
      </form>

      <div class="tb-actions">
        <button type="button" class="tb-icon" id="tb-bell"
                aria-label="Notificações" aria-haspopup="dialog" aria-expanded="false">
          ${svgBell()}
          <span class="tb-icon-dot" id="tb-bell-dot" hidden></span>
        </button>
        <a href="/caixa/hoje" data-link class="tb-btn tb-btn--primary"
           id="tb-cta" data-tone="primary">
          ${svgPlus()} <span class="tb-cta-label">Abrir caixa</span>
        </a>
      </div>
    </header>
  `;
}

// Aplica o estado dinamico ao botao da topbar (label/tone/icone).
// Roda quando o evento global 'caixa-hoje-mudou' eh disparado E
// 1x no boot (descobre o estado via query leve).
function atualizarCtaTopbar(estado) {
  const btn = document.querySelector('#tb-cta');
  if (!btn) return;
  estadoAtual = estado;

  const conf = CTA_POR_ESTADO[estado] ?? CTA_POR_ESTADO[null];
  btn.dataset.tone = conf.tone;
  btn.className = `tb-btn tb-btn--${conf.tone}`;

  const labelEl = btn.querySelector('.tb-cta-label');
  if (labelEl) labelEl.textContent = conf.label;

  // Icone muda — +  pra 'novo lancamento' / chave pra abrir / olho pra ver
  const slotIcone = btn.querySelector('svg');
  if (slotIcone) {
    const novoIcone = estado === 'aberto' ? svgPlus()
                    : (!estado)          ? svgKey()
                    : estado === 'em_conferencia' ? svgCheck()
                    : svgEye();
    slotIcone.outerHTML = novoIcone;
  }
}

// Boot: descobre estado do caixa de hoje via query leve. Resultado
// e disparado como o evento, pra demais componentes tambem
// receberem (ex: badge na sidebar futura).
async function carregarEstadoCaixaHoje() {
  try {
    const sessao = await pegarSessao();
    if (!sessao) return;
    const hojeISO = isoData(new Date());
    const { data } = await supabase
      .from('caixa').select('estado').eq('data', hojeISO).maybeSingle();
    const estado = data?.estado ?? null;
    window.dispatchEvent(new CustomEvent('caixa-hoje-mudou', { detail: { estado }}));
  } catch (_) { /* silencia */ }
}

export function ligarTopbar() {
  const form  = document.querySelector('#tb-search');
  const input = document.querySelector('#tb-search-input');
  if (!form || !input) return;

  // Tecla "/" foca a busca (fora de inputs)
  document.addEventListener('keydown', onSlash);

  // Esc limpa + tira foco
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    navegar(`/pendencias?busca=${encodeURIComponent(q)}`);
  });

  // Reage ao evento global de mudanca de estado do caixa de hoje
  window.addEventListener('caixa-hoje-mudou', onCaixaMudou);

  // Boot: descobre estado uma vez (caso o dashboard nao seja a
  // primeira tela carregada — ex: usuario veio direto pra /caixas)
  if (estadoAtual === null) carregarEstadoCaixaHoje();
  else atualizarCtaTopbar(estadoAtual);
}

function onCaixaMudou(e) {
  atualizarCtaTopbar(e.detail?.estado ?? null);
}

function onSlash(e) {
  if (e.key !== '/') return;
  const ativo = document.activeElement;
  const dentroInput = ativo && (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA');
  if (dentroInput) return;
  e.preventDefault();
  document.querySelector('#tb-search-input')?.focus();
}

export function desmontarTopbar() {
  document.removeEventListener('keydown', onSlash);
  window.removeEventListener('caixa-hoje-mudou', onCaixaMudou);
}

// ─── SVGs ───────────────────────────────────────────────────────────
const A = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
function svgSearch() { return `<svg ${A}><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>`; }
function svgBell()   { return `<svg ${A} stroke-width="1.5"><path d="M3 6a5 5 0 0 1 10 0v3l1.5 2H1.5L3 9V6Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`; }
function svgPlus()   { return `<svg ${A} stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>`; }
function svgKey()    { return `<svg ${A}><circle cx="5" cy="11" r="2.5"/><path d="M7 9l5-5M10 4l2 2M12 6l1.5 1.5"/></svg>`; }
function svgCheck()  { return `<svg ${A}><path d="M3 8.5l3 3 7-7"/></svg>`; }
function svgEye()    { return `<svg ${A}><path d="M1 8c2-3 4-4.5 7-4.5S13 5 15 8c-2 3-4 4.5-7 4.5S3 11 1 8Z"/><circle cx="8" cy="8" r="2"/></svg>`; }
