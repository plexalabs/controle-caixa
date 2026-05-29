// caixa-fechar.js — Tela /caixa/:data/fechar refator v2.
// Namespace .fch-*. Mesma linguagem visual de caixa-v2/pendencias-v2/
// lancamento-v2. Fluxo formal de fechamento: header + KPIs + avisos
// (se houver) + checklist + justificativa + rodape sticky com acao.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { dataLonga, isoData, ESTADO_CAIXA } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';

let caixaAtual = null;
let pendentesAtual = [];

export async function renderCaixaFechar({ params }) {
  const dataAlvo = params?.[0] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo)) {
    return mostrarErroFull('Data inválida.', '/dashboard');
  }

  // Carrega caixa com totais auditaveis
  const { data: caixa, error } = await supabase
    .from('caixa')
    .select('id, data, estado, total_lancamentos, total_pendentes, total_resolvidas, total_valor, total_cancelado_pos, valor_cancelado_pos, total_finalizado, valor_finalizado, observacao_fechamento')
    .eq('data', dataAlvo)
    .maybeSingle();

  if (error) return mostrarErroFull('Não foi possível carregar o caixa: ' + error.message, '/dashboard');
  if (!caixa)  return mostrarErroFull('Não há caixa nessa data.', '/dashboard');

  caixaAtual = caixa;

  if (caixa.estado === 'fechado' || caixa.estado === 'arquivado') {
    mostrarToast('Este caixa já está fechado.', 'info', 3000);
    return navegar(`/caixa/${dataAlvo}`);
  }

  // Carrega pendentes pra checklist + justificativa logic
  const { data: pend } = await supabase
    .from('lancamento')
    .select('id, numero_nf, cliente_nome, valor_nf, estado, categoria')
    .eq('caixa_id', caixa.id)
    .in('estado', ['pendente','em_preenchimento','completo'])
    .neq('estado', 'excluido');
  pendentesAtual = pend || [];

  const ehHoje = dataAlvo === isoData(new Date());
  const temPendencias = pendentesAtual.length > 0;
  const dataFormatada = capitalizarPrimeira(dataLonga(dataAlvo));

  // Layout v2
  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'caixas',
    conteudo: `
    <main id="main" class="fch">
      <nav class="fch-breadcrumb" aria-label="Voltar">
        <a href="/caixa/${esc(dataAlvo)}" data-link class="fch-link-back">
          ${svgChevronLeft()}
          Voltar ao caixa
        </a>
      </nav>

      <header class="fch-header">
        <p class="fch-eyebrow">Fechamento formal · ${esc(ESTADO_CAIXA[caixa.estado] || caixa.estado)}</p>
        <h1 class="fch-title">Fechar caixa de ${esc(dataFormatada)}</h1>
        <p class="fch-sub">
          Confira os totais, marque a checklist com atenção, registre divergências
          se houver, e finalize. Após o fechamento, este caixa não aceita novos lançamentos.
        </p>
      </header>

      <section class="fch-kpis" aria-label="Resumo do dia">
        ${kpi({
          label: 'Valor líquido',
          value: formatBRL(caixa.total_valor),
          sub: 'sem cancelados',
          tom: 'destaque',
        })}
        ${kpi({
          label: 'Lançamentos',
          value: caixa.total_lancamentos,
          sub: caixa.total_lancamentos === 1 ? 'NF no dia' : 'NFs no dia',
        })}
        ${kpi({
          label: 'Pendências',
          value: caixa.total_pendentes,
          subHtml: caixa.total_pendentes > 0
            ? `<a href="/pendencias?busca=${esc(dataAlvo)}" data-link>resolver</a>`
            : 'tudo resolvido',
          tom: caixa.total_pendentes > 0 ? 'warn' : 'good',
        })}
        ${kpi({
          label: 'Finalizados',
          value: formatBRL(caixa.valor_finalizado),
          sub: `${caixa.total_finalizado} ${caixa.total_finalizado === 1 ? 'NF' : 'NFs'}`,
          tom: 'good',
        })}
        ${kpi({
          label: 'Cancelados',
          value: formatBRL(caixa.valor_cancelado_pos),
          sub: `${caixa.total_cancelado_pos} pós-pgto`,
          tom: caixa.total_cancelado_pos > 0 ? 'alerta' : '',
        })}
      </section>

      ${!ehHoje ? aviso({
        tom: 'danger',
        eyebrow: 'Fechamento retroativo',
        textoHtml: `Você está fechando o caixa de <strong>${esc(dataFormatada)}</strong>, que não é hoje. A justificativa abaixo é obrigatória (mínimo 10 caracteres).`,
      }) : ''}

      ${temPendencias ? aviso({
        tom: 'warn',
        eyebrow: 'Atenção',
        textoHtml: `<strong>${pendentesAtual.length} ${pendentesAtual.length === 1 ? 'lançamento' : 'lançamentos'} ainda em aberto.</strong> Se prosseguir sem resolver, justifique com pelo menos 20 caracteres.`,
      }) : ''}

      <section class="fch-card" aria-label="Checklist de fechamento">
        <header class="fch-card-head">
          <h2 class="fch-card-title">Checklist de fechamento</h2>
          <p class="fch-card-sub" id="check-progresso">0 de 4 marcados</p>
        </header>
        <ol class="fch-itens">
          ${itemCheck(1, 'check-totais',     'Conferi os totais do dia')}
          ${itemCheck(2, 'check-pendencias', 'Resolvi todas as pendências possíveis',
                       temPendencias ? 'Há pendências em aberto — siga apenas se ciente.' : null)}
          ${itemCheck(3, 'check-mybucks',    'Comparei com o relatório do mybucks')}
          ${itemCheck(4, 'check-ciencia',    'Estou ciente que este caixa não receberá mais lançamentos')}
        </ol>
      </section>

      ${(() => {
        const minChars = temPendencias ? 20 : (!ehHoje ? 10 : 0);
        const obrigatorio = minChars > 0;
        const titulo = obrigatorio ? 'Justificativa' : 'Observação';
        const hint = temPendencias
          ? 'Obrigatória · mínimo 20 caracteres'
          : !ehHoje
            ? 'Obrigatória · mínimo 10 caracteres'
            : 'Opcional · anote divergências, se houver';
        const placeholder = temPendencias
          ? 'Por que está fechando com pendências em aberto?'
          : !ehHoje
            ? 'Por que este caixa não foi fechado no dia?'
            : 'Anote divergências com o mybucks ou ajustes manuais feitos.';
        return `
          <section class="fch-card" aria-label="${esc(titulo)}">
            <header class="fch-card-head">
              <h2 class="fch-card-title">
                ${esc(titulo)}${obrigatorio ? '<span class="fch-card-title-req" aria-hidden="true">*</span>' : ''}
              </h2>
              <p class="fch-card-sub">${esc(hint)}</p>
            </header>
            <textarea id="obs-fechamento" class="fch-justif-textarea"
                      rows="4" maxlength="800"
                      data-min-chars="${minChars}"
                      aria-label="${esc(titulo + ' — ' + hint)}"
                      placeholder="${esc(placeholder)}"></textarea>
          </section>`;
      })()}

      <div id="erro-fechamento" role="alert" aria-live="polite" class="fch-erro hidden"></div>

      <footer class="fch-rodape">
        <a href="/caixa/${esc(dataAlvo)}" data-link class="fch-btn fch-btn--link">Voltar sem fechar</a>
        <button id="btn-fechar" type="button" class="fch-btn fch-btn--primary" disabled>
          Fechar caixa do dia
          ${svgChevronRight()}
        </button>
      </footer>
    </main>
    `,
  });

  ligarShell();
  ligarComportamento(dataAlvo);
  instalarKpiMarquee();
}

// ─── Comportamento ──────────────────────────────────────────────────
function ligarComportamento(dataAlvo) {
  const checks = ['#check-totais', '#check-pendencias', '#check-mybucks', '#check-ciencia']
    .map(s => document.querySelector(s));
  const btn = document.querySelector('#btn-fechar');
  const obs = document.querySelector('#obs-fechamento');
  const erroEl = document.querySelector('#erro-fechamento');
  const progresso = document.querySelector('#check-progresso');

  function reavaliarBtn() {
    const marcados = checks.filter(c => c?.checked).length;
    const total = checks.length;
    btn.disabled = marcados < total;
    if (progresso) {
      progresso.textContent = `${marcados} de ${total} marcados`;
      progresso.dataset.estado = marcados === total ? 'completo' : (marcados > 0 ? 'parcial' : 'vazio');
    }
  }

  checks.forEach(c => c?.addEventListener('change', reavaliarBtn));
  obs?.addEventListener('input', () => erroEl.classList.add('hidden'));
  // Inicializa estado do progresso
  reavaliarBtn();

  btn.addEventListener('click', async () => {
    erroEl.classList.add('hidden');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const justificativa = (obs.value || '').trim() || null;
    const temPendencias = pendentesAtual.length > 0;
    const ehHoje = dataAlvo === isoData(new Date());

    if (temPendencias && (!justificativa || justificativa.length < 20)) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Há pendências em aberto. Justifique com pelo menos 20 caracteres no campo abaixo.';
      obs.focus();
      return;
    }
    if (!temPendencias && !ehHoje && (!justificativa || justificativa.length < 10)) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Fechamento retroativo exige justificativa de pelo menos 10 caracteres.';
      obs.focus();
      return;
    }

    const { error } = await supabase.rpc('fechar_caixa', {
      p_caixa_id:      caixaAtual.id,
      p_forcar:        temPendencias,
      p_justificativa: justificativa,
    });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErro(error);
      return;
    }

    mostrarToast(`Caixa de ${formatarDataCurta(dataAlvo)} fechado com sucesso.`, 'ok', 3200);
    navegar(`/caixa/${dataAlvo}`);
  });
}

function traduzirErro(err) {
  const m = err.message || '';
  const ml = m.toLowerCase();
  if (ml.includes('retroativo')) {
    return 'Fechamento retroativo exige justificativa de pelo menos 10 caracteres.';
  }
  if (ml.includes('justificativa')) {
    return 'Justificativa obrigatória (mínimo 20 caracteres) ao forçar fechamento com pendências.';
  }
  if (ml.includes('ja esta fechado') || ml.includes('já está fechado')) {
    return 'Este caixa já foi fechado por outra sessão. Recarregue a página.';
  }
  if (ml.includes('pendencias') || ml.includes('pendências')) {
    return m;
  }
  return 'Não foi possível fechar o caixa: ' + m;
}

// ─── Helpers de markup ──────────────────────────────────────────────

function kpi({ label, value, sub, subHtml, tom = '' }) {
  const cls = tom ? `fch-kpi fch-kpi--${tom}` : 'fch-kpi';
  const subContent = subHtml || esc(sub || '');
  const valEsc = esc(String(value));
  // Estrutura marquee: track com original + clone (a duplicata fica
  // escondida quando o valor cabe; quando nao cabe, JS adiciona
  // .is-marquee e ambos formam o loop infinito).
  return `
    <article class="${cls}">
      <p class="fch-kpi-label">${esc(label)}</p>
      <div class="fch-kpi-value">
        <span class="fch-kpi-value-track">
          <span class="fch-kpi-value-part">${valEsc}</span>
          <span class="fch-kpi-value-part fch-kpi-value-part--clone" aria-hidden="true">${valEsc}</span>
        </span>
      </div>
      <p class="fch-kpi-sub">${subContent}</p>
    </article>`;
}

// Detecta overflow no valor de cada KPI e ativa o marquee. Tolerancia
// generosa de 8px — so dispara quando o texto REALMENTE nao cabe (nao
// por uns pixelzinhos). Se sobrar ate 8px, mantem estatico (sem loop).
let fchKpiResizeTimer = null;
function ajustarKpiMarquee() {
  const valores = document.querySelectorAll('.fch-kpi-value');
  valores.forEach(el => el.classList.remove('is-marquee'));
  document.body.offsetHeight;  // forca reflow pra medida limpa
  valores.forEach(el => {
    const part = el.querySelector('.fch-kpi-value-part:not(.fch-kpi-value-part--clone)');
    if (!part) return;
    // Threshold +8px: o valor precisa estourar a largura por mais de
    // 8 pixels pra disparar o loop. Espaco curtinho fica estatico.
    const precisa = part.scrollWidth > el.clientWidth + 8;
    if (precisa) el.classList.add('is-marquee');
  });
}

function instalarKpiMarquee() {
  // Mede no proximo frame + apos fontes carregarem + 400ms (delays
  // pra capturar Manrope que pode demorar a aplicar)
  requestAnimationFrame(() => requestAnimationFrame(ajustarKpiMarquee));
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(ajustarKpiMarquee);
  }
  setTimeout(ajustarKpiMarquee, 400);
  setTimeout(ajustarKpiMarquee, 1200);

  // Re-mede em qualquer mudanca de largura do container
  const grid = document.querySelector('.fch-kpis');
  if (grid && window.ResizeObserver && !grid.dataset.roBound) {
    const ro = new ResizeObserver(() => ajustarKpiMarquee());
    ro.observe(grid);
    grid.dataset.roBound = '1';
  }
  // Window resize com debounce
  window.addEventListener('resize', () => {
    clearTimeout(fchKpiResizeTimer);
    fchKpiResizeTimer = setTimeout(ajustarKpiMarquee, 120);
  });
}

function aviso({ tom, eyebrow, textoHtml }) {
  return `
    <aside class="fch-aviso fch-aviso--${esc(tom)}" role="alert">
      <span class="fch-aviso-icone" aria-hidden="true">
        ${tom === 'danger' ? svgAlerta() : svgAtencao()}
      </span>
      <div class="fch-aviso-corpo">
        <p class="fch-aviso-eyebrow">${esc(eyebrow)}</p>
        <p class="fch-aviso-texto">${textoHtml}</p>
      </div>
    </aside>`;
}

function itemCheck(num, id, rotulo, aviso = null) {
  // Estrutura: <label> envolve TUDO -> card inteiro vira touch target.
  // Input nativo fica visualmente oculto (a11y mantida) e o .fch-item-mark
  // renderiza o visual custom (checkbox arredondado que vira tick verde).
  return `
    <li>
      <label class="fch-item" for="${id}">
        <input type="checkbox" id="${id}" class="fch-item-input" />
        <span class="fch-item-num" aria-hidden="true">${String(num).padStart(2, '0')}</span>
        <span class="fch-item-corpo">
          <span class="fch-item-texto">${esc(rotulo)}</span>
          ${aviso ? `<span class="fch-item-aviso">${esc(aviso)}</span>` : ''}
        </span>
        <span class="fch-item-mark" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8.5l3.5 3.5L13 5"/>
          </svg>
        </span>
      </label>
    </li>`;
}

// ─── SVG icons ───────────────────────────────────────────────────────
function svgChevronLeft() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12L6 8l4-4"/></svg>`;
}
function svgChevronRight() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`;
}
function svgAtencao() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v3.5M8 11h.01M8 1.5 1 14h14L8 1.5Z"/></svg>`;
}
function svgAlerta() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11h.01"/></svg>`;
}

// ─── Utilidades ──────────────────────────────────────────────────────
function capitalizarPrimeira(s) {
  const str = String(s ?? '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatarDataCurta(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function mostrarErroFull(msg, voltar) {
  document.querySelector('#app').innerHTML = `
    <main class="fch-erro-full" role="main">
      <div class="fch-erro-full-inner">
        <p class="fch-erro-full-eyebrow">Erro</p>
        <h1 class="fch-erro-full-title">${esc(msg)}</h1>
        <a href="${esc(voltar)}" data-link class="fch-btn fch-btn--primary" style="display:inline-flex">Voltar</a>
      </div>
    </main>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
