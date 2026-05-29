// caixa.js — Tela /caixa/hoje e /caixa/:data (CP3.2, Fase 2).
// Cabeçalho com data, tab strip dos últimos 14 dias, lista de lançamentos
// com cores canônicas, realtime, estado vazio, criar caixa se não existe.

import { supabase } from '../supabase.js';
import { comRetry } from '../supabase-wrapper.js';
import { log } from '../log.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModalAdicionarNF }    from '../../components/modal-adicionar-nf.js';
import { abrirModalEditarLancamento } from '../../components/modal-editar-lancamento.js';
import { abrirModalReabrirCaixa }   from '../../components/modal-reabrir-caixa.js';
import { instalarFilterBar } from '../../components/filter-bar.js';
import { instalarPopSelect } from '../../components/pop-select.js';
import { dataLonga, dataCurta, isoData, hora,
         LABEL_CATEGORIA, LABEL_CATEGORIA_CURTA, ESTADO_CAIXA,
         CATEGORIAS, resumoDetalhes } from '../dominio.js';
import { formatBRL, formatarNumeroNF, formatarNomeCliente } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync } from '../papeis.js';

let canalLanc = null;
let caixaIdAtual = null;
let dataAlvoAtual = null;
let lancCache = [];      // CP5.5: cache para filtros client-side
let fbCtrl = null;
let fbOverlayObs = null;        // observer do data-aberto (mobile overlay)
let fbOverlayResizeFn = null;

export async function renderCaixa({ params }) {
  desmontar();

  // params[0] = /caixa/:data → 'hoje' ou 'YYYY-MM-DD'.
  const slug = params?.[0] ?? 'hoje';
  const dataAlvo = slug === 'hoje' ? isoData(new Date()) : slug;

  // Validação básica de formato YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo)) {
    return mostrarErroEFim('Data inválida.');
  }

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'caixas',
    conteudo: `
    <main id="main" class="cxd">
      <nav class="cxd-breadcrumb" aria-label="Voltar">
        <a href="/caixas" data-link class="cxd-link-back">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12L6 8l4-4"/></svg>
          Todos os caixas
        </a>
      </nav>

      <header class="cxd-header">
        <div class="cxd-header-meta">
          <p class="cxd-eyebrow">Caixa do dia</p>
          <h1 class="cxd-title" id="cab-data">${capitalizarPrimeira(dataLonga(dataAlvo))}</h1>
          <p class="cxd-sub" id="cab-sub">—</p>
        </div>
        <div class="cxd-header-direita">
          <span id="cab-status" class="cxd-badge" data-estado=""></span>
        </div>
      </header>

      <!-- Banner read-only quando caixa fechado -->
      <div id="banner-fechado" class="cxd-banner hidden" role="status">
        <span class="cxd-banner-icone" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2"/>
            <path d="M8 11 V8 a4 4 0 0 1 8 0 v3"/>
          </svg>
        </span>
        <div>
          <p class="cxd-banner-title">Este caixa está fechado.</p>
          <p class="cxd-banner-sub">Apenas leitura — não aceita novos lançamentos.</p>
        </div>
      </div>

      <!-- KPIs do dia (skeleton inicial; preenchido em atualizarRodape) -->
      <section id="rodape" class="cxd-kpis hidden" aria-label="Resumo do dia"></section>

      <!-- Toolbar: filtros (popover) + acoes -->
      <div class="cxd-toolbar">
        <div class="cxd-filter" id="cxd-filter" data-aberto="false">
          <button type="button" class="cxd-filter-trigger" id="cxd-filter-trigger" aria-haspopup="dialog" aria-expanded="false">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12L9.5 9v4l-3-1V9L2 4Z"/></svg>
            <span>Filtros</span>
            <span class="cxd-filter-count" id="cxd-filter-count" hidden>0</span>
            <svg class="cxd-filter-caret" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
          </button>

          <div class="cxd-filter-pop" id="cxd-filter-pop" role="dialog" aria-label="Filtros" hidden>
            <header class="cxd-filter-pop-head">
              <h3 class="cxd-filter-pop-title">Filtros</h3>
              <button type="button" class="cxd-filter-pop-close" id="cxd-filter-close" aria-label="Fechar">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
              </button>
            </header>

            <div class="cxd-filter-body">
              <label class="cxd-filter-field">
                <span class="cxd-filter-label">Categoria</span>
                <select id="cxd-f-categoria" class="cxd-filter-input"
                        data-pop-class="cxd-pop" data-pop-anchor="parent">
                  <option value="">Todas</option>
                  <option value="em_analise">Em análise (sem categoria)</option>
                  ${CATEGORIAS.map(c => `<option value="${c.valor}">${c.rotulo}</option>`).join('')}
                </select>
              </label>

              <label class="cxd-filter-field">
                <span class="cxd-filter-label">Estado</span>
                <select id="cxd-f-estado" class="cxd-filter-input"
                        data-pop-class="cxd-pop" data-pop-anchor="parent">
                  <option value="">Todos</option>
                  <option value="pendente">Em análise</option>
                  <option value="completo">Categorizado</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="cancelado_pos">Cancelado pós-pagamento</option>
                </select>
              </label>

              <label class="cxd-filter-field">
                <span class="cxd-filter-label">Buscar</span>
                <input type="text" id="cxd-f-busca" class="cxd-filter-input" placeholder="NF, cliente ou pedido" />
              </label>

              <label class="cxd-filter-toggle">
                <input type="checkbox" id="cxd-f-ocultar" />
                <span class="cxd-filter-toggle-pill"><span class="cxd-filter-toggle-dot"></span></span>
                <span class="cxd-filter-toggle-label">Ocultar resolvidos</span>
              </label>
            </div>

            <footer class="cxd-filter-pop-foot">
              <button type="button" class="cxd-btn cxd-btn--link cxd-btn--sm" id="cxd-f-limpar">Limpar</button>
              <button type="button" class="cxd-btn cxd-btn--primary cxd-btn--sm" id="cxd-f-aplicar">Aplicar</button>
            </footer>
          </div>
        </div>

        <div class="cxd-acoes">
          <a id="hint-pendencias" class="cxd-hint-pend hidden" href="#" data-link>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>
            <span id="hint-pendencias-texto"></span>
          </a>
          <a id="btn-fechar-dia" class="cxd-btn cxd-btn--ghost cxd-btn--sm hidden" href="#" data-link>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>
            Fechar caixa
          </a>
          <button id="btn-novo" class="cxd-btn cxd-btn--primary cxd-btn--sm" disabled>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3 8h10"/></svg>
            Novo lançamento
          </button>
        </div>
      </div>

      <!-- Lista de lancamentos -->
      <section id="bloco-conteudo" class="cxd-lista">
        ${blocoSkel()}
      </section>
    </main>
  `,
  });

  ligarShell();

  // Carrega caixa do dia. Se não existe, oferece criar.
  await carregarCaixa(dataAlvo);
}

// ─── Carrega caixa + lançamentos ──────────────────────────────────────────
async function carregarCaixa(dataAlvo) {
  const bloco  = document.querySelector('#bloco-conteudo');
  const status = document.querySelector('#cab-status');
  const btnNov = document.querySelector('#btn-novo');

  // Garante cache de permissões populado antes do gating síncrono do botão.
  // Cache TTL de 1min em papeis.js — geralmente já está warmed por main.js.
  const [{ data: caixa, error: errCaixa }] = await Promise.all([
    supabase
      .from('caixa')
      .select('id, data, estado, total_lancamentos, total_pendentes, total_valor, criado_em, criado_por, fechado_em, fechado_por')
      .eq('data', dataAlvo)
      .maybeSingle(),
    carregarPermissoes(),
  ]);

  if (errCaixa) {
    log.erro('falha ao carregar caixa', errCaixa, { dataAlvo });
    bloco.innerHTML = `<p class="alert">Erro ao carregar caixa: ${esc(errCaixa.message)}</p>`;
    return;
  }

  // Se não existe → estado vazio com botão criar (apenas se for hoje ou passado).
  if (!caixa) {
    status.textContent = '';
    btnNov.disabled = true;
    bloco.innerHTML = renderSemCaixa(dataAlvo);

    const btnCriar = document.querySelector('#btn-criar-caixa');
    if (btnCriar) {
      btnCriar.addEventListener('click', async () => {
        btnCriar.setAttribute('aria-busy', 'true');
        btnCriar.disabled = true;
        const { error } = await supabase.rpc('criar_caixa_se_nao_existe', { p_data: dataAlvo });
        if (error) {
          mostrarToast('Não foi possível criar o caixa: ' + error.message, 'erro', 5000);
          btnCriar.removeAttribute('aria-busy');
          btnCriar.disabled = false;
          return;
        }
        mostrarToast('Caixa aberto.', 'ok', 2000);
        await carregarCaixa(dataAlvo);
      });
    }
    return;
  }

  caixaIdAtual = caixa.id;
  dataAlvoAtual = dataAlvo;
  status.textContent = ESTADO_CAIXA[caixa.estado] || caixa.estado;
  status.dataset.estado = caixa.estado;

  // Subtítulo: dia da semana + hora de abertura
  const subEl = document.querySelector('#cab-sub');
  if (subEl) {
    try {
      const d = new Date(dataAlvo + 'T00:00:00');
      const diaSemanaFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d);
      const diaSemana = diaSemanaFmt.split('-')[0];
      const cap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
      let horaAberto = '';
      if (caixa.criado_em) {
        horaAberto = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
          .format(new Date(caixa.criado_em));
      }
      const verbo = caixa.estado === 'fechado' ? 'fechado'
                  : caixa.estado === 'arquivado' ? 'arquivado'
                  : 'aberto';
      subEl.textContent = horaAberto
        ? `${cap} · ${verbo} às ${horaAberto}`
        : cap;
    } catch (_) { subEl.textContent = ''; }
  }

  // Botão de ação principal: comportamento depende do estado + permissão.
  // - aberto/em_conferencia: "+ Novo lançamento" (padrão)
  // - fechado + permissão caixa.reabrir_fechado: "Abrir caixa" (reabre)
  // - fechado sem permissão OU arquivado: esconde (banner já comunica)
  const ehFechado = caixa.estado === 'fechado';
  const ehArquivado = caixa.estado === 'arquivado';
  const podeReabrir = ehFechado && temPermissaoSync('caixa.reabrir_fechado');

  if (ehArquivado || (ehFechado && !podeReabrir)) {
    btnNov.classList.add('hidden');
    btnNov.onclick = null;
  } else if (podeReabrir) {
    btnNov.classList.remove('hidden');
    btnNov.disabled = false;
    btnNov.textContent = 'Abrir caixa';
    btnNov.onclick = (ev) => abrirModalReabrirCaixa({
      caixaId:    caixa.id,
      dataCaixa:  dataAlvo,
      aoConcluir: () => carregarCaixa(dataAlvo),
      origemEvento: ev,
    });
  } else {
    btnNov.classList.remove('hidden');
    btnNov.disabled = false;
    btnNov.textContent = '+ Novo lançamento';
    btnNov.onclick = (ev) =>
      abrirModalAdicionarNF({ dataCaixa: dataAlvo, aoSalvar: () => carregarLancamentos(caixa.id), origemEvento: ev });
  }

  // CP6.2 + FIX: Banner fechado / CTA fechar (só sem pendências) / hint pendências
  const banner    = document.querySelector('#banner-fechado');
  const btnFechar = document.querySelector('#btn-fechar-dia');
  const hintPend  = document.querySelector('#hint-pendencias');
  const hintTxt   = document.querySelector('#hint-pendencias-texto');

  banner?.classList.add('hidden');
  btnFechar?.classList.add('hidden');
  hintPend?.classList.add('hidden');

  if (caixa.estado === 'fechado' || caixa.estado === 'arquivado') {
    banner?.classList.remove('hidden');
  } else if (['aberto', 'em_conferencia'].includes(caixa.estado)) {
    if ((caixa.total_pendentes ?? 0) === 0) {
      // Tudo resolvido — CTA fechar liberado
      btnFechar?.setAttribute('href', `/caixa/${dataAlvo}/fechar`);
      btnFechar?.classList.remove('hidden');
    } else {
      // Há pendências — hint editorial em vez do CTA
      const n = caixa.total_pendentes;
      if (hintTxt) {
        // "Resta 1 pendência" / "Restam 3 pendências".
        hintTxt.innerHTML = n === 1
          ? `Resta <strong>1</strong> pendência`
          : `Restam <strong>${n}</strong> pendências`;
      }
      hintPend?.setAttribute('href', `/pendencias?busca=${dataAlvo}`);
      hintPend?.setAttribute(
        'data-tooltip',
        `Resolva ${n === 1 ? 'a pendência' : `as ${n} pendências`} antes de fechar o caixa`
      );
      hintPend?.setAttribute(
        'aria-label',
        `${n} ${n === 1 ? 'pendência' : 'pendências'} — resolva antes de fechar`
      );
      hintPend?.classList.remove('hidden');
    }
  }

  await carregarLancamentos(caixa.id);
  ligarRealtime(caixa.id);
}

async function carregarLancamentos(caixaId) {
  const bloco  = document.querySelector('#bloco-conteudo');
  if (!bloco) return;

  // Carregar lançamentos do caixa: tolerância a instabilidade transitória
  // via comRetry (3 tentativas, backoff 1s/2s, ativa banner após falha).
  const { data, error } = await comRetry(
    () => supabase
      .from('lancamento')
      .select('id, numero_nf, codigo_pedido, cliente_nome, valor_nf, categoria, estado, dados_categoria, criado_em, resolvido_em, atualizado_em')
      .eq('caixa_id', caixaId)
      .neq('estado', 'excluido')
      .order('criado_em', { ascending: true }),
    'carregar lançamentos'
  );

  if (error) {
    log.erro('falha ao carregar lançamentos do caixa', error, { caixaId });
    bloco.innerHTML = `<p class="alert">Não conseguimos carregar os lançamentos.</p>`;
    return;
  }

  lancCache = data || [];

  if (lancCache.length === 0) {
    document.querySelector('#cxd-filter')?.classList.add('hidden');
    bloco.innerHTML = `
      <div class="cxd-empty cxd-empty--inicial">
        <p class="cxd-empty-eyebrow">Caixa em branco</p>
        <p class="cxd-empty-title">Nenhum lançamento ainda.</p>
        <p class="cxd-empty-msg">Comece pelo botão <strong>+ Novo lançamento</strong> no canto superior direito desta tela ou na barra do topo.</p>
      </div>`;
    atualizarRodape([]);
    return;
  }
  document.querySelector('#cxd-filter')?.classList.remove('hidden');

  // Filtro v2: popover proprio (substitui filter-bar generico)
  ligarFiltroV2();
  renderListaFiltrada();
  atualizarRodape(lancCache);
}

// ─── Filtro v2 (popover flutuante) ────────────────────────────────────
//
// IMPORTANTE: ligarFiltroV2() roda toda vez que o caixa carrega, porque
// o DOM e recriado. Antes tinha um guard `filtroV2Ligado` que impedia
// re-binding apos a 1a visita — mas o trigger button novo (DOM novo)
// ficava sem listener e o popover nao abria. Agora rebindamos sempre,
// e os listeners de documento (mousedown/keydown) sao tracked num holder
// pra serem removidos antes de re-adicionar e em desmontar().
let filtroV2Estado = { categoria: '', estado: '', busca: '', ocultar_resolvidos: false };
let filtroV2DocListeners = null;

function ligarFiltroV2() {
  const trigger = document.querySelector('#cxd-filter-trigger');
  const pop     = document.querySelector('#cxd-filter-pop');
  const close   = document.querySelector('#cxd-filter-close');
  const root    = document.querySelector('#cxd-filter');
  if (!trigger || !pop || !root) return;

  // Substitui <select> nativos pelo pop-select skinado (cxd-pop).
  // Idempotente: pop-select checa dataset.popInstalled antes de re-rodar.
  pop.querySelectorAll('select[data-pop-class]').forEach(instalarPopSelect);

  // Limpa listeners de documento da chamada anterior (root antigo ja
  // foi removido do DOM; manter o handler antigo causa close em loop).
  if (filtroV2DocListeners) {
    document.removeEventListener('mousedown', filtroV2DocListeners.mousedown);
    document.removeEventListener('keydown',   filtroV2DocListeners.keydown);
    filtroV2DocListeners = null;
  }

  // ResizeObserver pra reposicionar o popover quando seu conteudo
  // expande (ex: dropdown interno abre). Detached quando popover fecha.
  let resizeObs = null;

  const ajustarPosicao = () => {
    if (pop.hidden) return;
    // Reset pra medir a posicao "natural" (top: 100% + 6px do trigger)
    pop.style.setProperty('--cxd-pop-translateY', '0px');
    const r = pop.getBoundingClientRect();
    const margem = 12; // respiro do fundo da viewport
    const transbordo = r.bottom - window.innerHeight + margem;
    if (transbordo > 0) {
      // Sobe o quanto necessario, mas nunca passa pra cima do topo
      // visivel (limita a subida pelo topo atual do popover - 8px).
      const subidaMax = Math.max(0, r.top - 8);
      const subida = Math.min(transbordo, subidaMax);
      pop.style.setProperty('--cxd-pop-translateY', `-${subida}px`);
    }
  };

  const abrirFechar = (abrir) => {
    pop.hidden = !abrir;
    trigger.setAttribute('aria-expanded', String(abrir));
    root.dataset.aberto = String(abrir);
    if (abrir) {
      // Ajusta na proxima frame (depois do reflow) e observa mudancas
      // de tamanho (ex: pop-select inline abrindo dentro do filtro).
      requestAnimationFrame(ajustarPosicao);
      if (!resizeObs && typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(() => ajustarPosicao());
        resizeObs.observe(pop);
      }
      window.addEventListener('resize', ajustarPosicao);
    } else {
      pop.style.setProperty('--cxd-pop-translateY', '0px');
      if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
      window.removeEventListener('resize', ajustarPosicao);
    }
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirFechar(pop.hidden);
  });
  close?.addEventListener('click', () => abrirFechar(false));

  filtroV2DocListeners = {
    // Fecha qualquer clique fora do trigger E fora do popover. Permite
    // que cliques no backdrop (mobile bottom sheet) ou em qualquer
    // outro lugar da pagina fechem — sem disparar acoes da pagina
    // (mousedown precede click, entao captura primeiro).
    mousedown: (e) => {
      if (!trigger.contains(e.target) && !pop.contains(e.target)) {
        abrirFechar(false);
      }
    },
    keydown:   (e) => { if (e.key === 'Escape') abrirFechar(false); },
  };
  document.addEventListener('mousedown', filtroV2DocListeners.mousedown);
  document.addEventListener('keydown',   filtroV2DocListeners.keydown);

  // Aplicar / limpar
  document.querySelector('#cxd-f-aplicar')?.addEventListener('click', () => {
    filtroV2Estado = {
      categoria: document.querySelector('#cxd-f-categoria')?.value || '',
      estado:    document.querySelector('#cxd-f-estado')?.value    || '',
      busca:     (document.querySelector('#cxd-f-busca')?.value || '').trim(),
      ocultar_resolvidos: document.querySelector('#cxd-f-ocultar')?.checked || false,
    };
    atualizarBadgeFiltro();
    abrirFechar(false);
    renderListaFiltrada();
  });
  document.querySelector('#cxd-f-limpar')?.addEventListener('click', () => {
    filtroV2Estado = { categoria: '', estado: '', busca: '', ocultar_resolvidos: false };
    const cat = document.querySelector('#cxd-f-categoria'); if (cat) cat.value = '';
    const est = document.querySelector('#cxd-f-estado');    if (est) est.value = '';
    const bus = document.querySelector('#cxd-f-busca');     if (bus) bus.value = '';
    const ocu = document.querySelector('#cxd-f-ocultar');   if (ocu) ocu.checked = false;
    atualizarBadgeFiltro();
    renderListaFiltrada();
  });

  // Submeter com Enter no campo de busca
  document.querySelector('#cxd-f-busca')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.querySelector('#cxd-f-aplicar')?.click();
  });
}

function atualizarBadgeFiltro() {
  const b = document.querySelector('#cxd-filter-count');
  if (!b) return;
  const n = (filtroV2Estado.categoria ? 1 : 0)
          + (filtroV2Estado.estado    ? 1 : 0)
          + (filtroV2Estado.busca     ? 1 : 0)
          + (filtroV2Estado.ocultar_resolvidos ? 1 : 0);
  if (n === 0) { b.hidden = true; b.textContent = '0'; }
  else         { b.hidden = false; b.textContent = String(n); }
}

// Legado — desativado no refactor v2 do /caixa: filter-bar agora fica
// inline e empurra o conteudo naturalmente (sem overlay absoluto que
// quebrava layout). Funcao mantida pra compatibilidade caso outro
// lugar chame, mas e no-op no contexto novo.
function configurarOverlayFiltroMobile() {
  return; // no-op: v2 nao usa mais overlay mobile
  // eslint-disable-next-line no-unreachable
  const row = document.querySelector('.cx-acoes-row');
  const fb  = row?.querySelector('.filter-bar');
  if (!row || !fb) return;

  const recalc = () => {
    const ehMobile = window.innerWidth <= 640;
    const aberto = fb.dataset.aberto === 'true';
    if (!ehMobile || !aberto) {
      row.style.setProperty('--fb-overlay-h', '0px');
      return;
    }
    requestAnimationFrame(() => {
      const h = fb.offsetHeight;
      // 44px é a altura natural da row (botões mobile); o excesso é o
      // que o filter aberto cresceu além dela.
      const excesso = Math.max(0, h - 44);
      row.style.setProperty('--fb-overlay-h', `${excesso}px`);
    });
  };

  if (fbOverlayObs) fbOverlayObs.disconnect();
  fbOverlayObs = new MutationObserver(() => {
    // pequena espera pra animação grid-template-rows propagar a altura
    setTimeout(recalc, 50);
    setTimeout(recalc, 380);  // após a transição completa
  });
  fbOverlayObs.observe(fb, { attributes: true, attributeFilter: ['data-aberto'] });

  if (fbOverlayResizeFn) window.removeEventListener('resize', fbOverlayResizeFn);
  fbOverlayResizeFn = recalc;
  window.addEventListener('resize', fbOverlayResizeFn);

  recalc();
}

function renderListaFiltrada() {
  const bloco = document.querySelector('#bloco-conteudo');
  if (!bloco) return;
  const f = filtroV2Estado;
  const filtrados = aplicarFiltrosCaixa(lancCache, f);

  if (filtrados.length === 0) {
    bloco.innerHTML = `
      <div class="cxd-empty">
        <p class="cxd-empty-title">Nenhum lançamento com esses filtros.</p>
        <p class="cxd-empty-msg">Ajuste os filtros acima ou clique em <em>Limpar filtros</em>.</p>
      </div>`;
    return;
  }

  bloco.innerHTML = `<ul class="cxd-lanc-lista" role="list">${
    filtrados.map(l => `<li>${linhaLancamento(l)}</li>`).join('')
  }</ul>`;

  const porId = Object.fromEntries(filtrados.map(l => [l.id, l]));
  bloco.querySelectorAll('.cxd-lanc').forEach(el => {
    el.addEventListener('click', (ev) => {
      const lanc = porId[el.dataset.id];
      if (!lanc) return;
      abrirModalEditarLancamento({
        lancamento: lanc,
        dataCaixa:  dataAlvoAtual,
        aoSalvar:   () => carregarLancamentos(caixaIdAtual),
        origemEvento: ev,
      });
    });
  });

  // Destaque opcional via ?nf=NUMERO (vindo de notificação `pendencia_aberta`).
  // Localiza a linha, faz scroll suave e pulsa por 4s. Idempotente em re-renders.
  destacarNfDaURL();
}

function destacarNfDaURL() {
  const params = new URLSearchParams(location.search);
  const nf = params.get('nf');
  if (!nf) return;

  // Aguarda o DOM commitar antes de medir/scrollar
  requestAnimationFrame(() => {
    const el = document.querySelector(`.cxd-lanc[data-numero-nf="${cssEsc(nf)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('lanc-row--destacado');
    setTimeout(() => el.classList.remove('lanc-row--destacado'), 4200);
  });
}

function cssEsc(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
}

function aplicarFiltrosCaixa(itens, f) {
  return itens.filter(l => {
    // Ocultar resolvidos = remove finalizados, cancelado_pos, cancelado, resolvido.
    if (f.ocultar_resolvidos &&
        ['finalizado','cancelado_pos','cancelado','resolvido'].includes(l.estado)) {
      return false;
    }
    if (f.categoria) {
      if (f.categoria === 'em_analise') {
        if (l.categoria != null) return false;
      } else {
        if (l.categoria !== f.categoria) return false;
      }
    }
    if (f.estado && l.estado !== f.estado) return false;
    if (f.busca) {
      const q = f.busca.toLowerCase();
      const nf = (l.numero_nf || '').toLowerCase();
      const cli = (l.cliente_nome || '').toLowerCase();
      const ped = (l.codigo_pedido || '').toLowerCase();
      if (!nf.includes(q) && !cli.includes(q) && !ped.includes(q)) return false;
    }
    return true;
  });
}

function linhaLancamento(l) {
  const cat            = l.categoria || '';
  const labelLongo     = cat ? (LABEL_CATEGORIA[cat] || cat) : 'Em análise';
  const labelVertical  = cat ? (LABEL_CATEGORIA_CURTA[cat] || cat.toUpperCase()) : 'EM ANÁLISE';
  const ehAtrasado     = l.estado === 'pendente' && diasUteisDesde(l.criado_em) > 3;
  const ehResolvido    = ['resolvido','finalizado'].includes(l.estado);
  const emAnalise      = !cat;

  // estado_final agora vem do enum real, nao mais do JSON.
  const estadoFinal    = l.estado === 'finalizado' ? 'finalizado'
                       : ['cancelado_pos','cancelado'].includes(l.estado) ? 'cancelado'
                       : '';

  const dataDesfecho   = l.resolvido_em || l.atualizado_em;
  const dataCurtaFmt   = dataDesfecho ? formatarDataBR(dataDesfecho) : '';
  const detalheBase    = cat ? resumoDetalhes(cat, l.dados_categoria) : '';
  const detalheSuffix  = estadoFinal === 'finalizado' ? ` · finalizado${dataCurtaFmt ? ' em ' + dataCurtaFmt : ''}`
                       : estadoFinal === 'cancelado'  ? ` · cancelado pós-pagamento${dataCurtaFmt ? ' em ' + dataCurtaFmt : ''}`
                       : '';

  const detalhe = detalheBase + detalheSuffix;

  // Tom do dot de estado (indicador rapido a esquerda — ajuda o operador
  // a identificar status sem ler badge)
  let statusTone = 'pendente';
  if (ehAtrasado)                          statusTone = 'atrasado';
  else if (estadoFinal === 'finalizado')   statusTone = 'finalizado';
  else if (estadoFinal === 'cancelado')    statusTone = 'cancelado';
  else if (l.estado === 'completo')        statusTone = 'completo';
  else if (l.estado === 'resolvido')       statusTone = 'resolvido';
  else if (emAnalise)                      statusTone = 'analise';

  return `
    <button class="cxd-lanc" data-cat="${esc(cat)}"
            data-em-analise="${emAnalise}"
            data-estado-final="${esc(estadoFinal)}"
            data-resolvido="${ehResolvido}" data-atrasado="${ehAtrasado}"
            data-status="${statusTone}"
            data-id="${esc(l.id)}"
            data-numero-nf="${esc(l.numero_nf || '')}">
      <span class="cxd-lanc-status" aria-hidden="true"></span>

      <div class="cxd-lanc-esq">
        <span class="cxd-lanc-nf">NF ${esc(formatarNumeroNF(l.numero_nf))}</span>
        <time class="cxd-lanc-hora">${hora(l.criado_em)}</time>
      </div>

      <div class="cxd-lanc-meio">
        <span class="cxd-lanc-cliente">${esc(formatarNomeCliente(l.cliente_nome) || '— sem cliente —')}</span>
        ${cat
          ? `<span class="cxd-lanc-detalhe">${esc(detalhe || '—')}</span>`
          : `<span class="cxd-lanc-detalhe cxd-lanc-detalhe--analise">aguardando categorização</span>`}
      </div>

      <div class="cxd-lanc-dir">
        <span class="cxd-lanc-valor">${formatBRL(l.valor_nf)}</span>
        <span class="cxd-lanc-cat" data-cat="${esc(cat)}" data-em-analise="${emAnalise}">
          ${esc(labelLongo)}
        </span>
      </div>
    </button>`;
}

// ─── Resumo do dia ─────────────────────────────────────────────────────────
// 3 blocos em coluna, com label-eyebrow à esquerda e conteúdo à direita.
// Mobile empilha. Cada bloco tem identidade visual propria.
function atualizarRodape(lancamentos) {
  const rod = document.querySelector('#rodape');
  if (!rod) return;
  if (lancamentos.length === 0) { rod.classList.add('hidden'); return; }
  rod.classList.remove('hidden');

  // Categorias filtradas pelo estado real do enum (CP4):
  const ehCancelado = (l) => l.categoria === 'cancelado'
                          || ['cancelado','cancelado_pos'].includes(l.estado);
  const validos    = lancamentos.filter(l => !ehCancelado(l));
  const total      = validos.reduce((s, l) => s + Number(l.valor_nf || 0), 0);

  const emAnalise  = lancamentos.filter(l => !l.categoria);
  const emCurso    = lancamentos.filter(l => l.categoria && l.estado === 'completo');
  const resolvidos = lancamentos.filter(l => ['resolvido','finalizado'].includes(l.estado));
  const cancelados = lancamentos.filter(ehCancelado);

  // Distribuição por categoria (apenas categorizados, exclui em-análise).
  const dist = {};
  for (const l of validos) {
    if (!l.categoria) continue;
    dist[l.categoria] = (dist[l.categoria] || 0) + 1;
  }

  // Layout clean: hierarquia tipográfica vertical + linhas de items.
  // Mobile: linhas viram carrossel horizontal; com n>0 vêm primeiro,
  // zerados ficam atenuados ao fim do scroll. Operador vê de relance
  // o que tem volume e o que ainda não rolou no dia.
  const ordenarPorPresenca = (a, b) => (b.n > 0 ? 1 : 0) - (a.n > 0 ? 1 : 0);

  const itensEstado = [
    { tom: 'analise',   rotulo: 'em análise',  n: emAnalise.length },
    { tom: 'curso',     rotulo: 'em curso',    n: emCurso.length },
    { tom: 'resolvido', rotulo: 'resolvidas',  n: resolvidos.length },
    { tom: 'cancelado', rotulo: 'canceladas',  n: cancelados.length },
  ].sort(ordenarPorPresenca);

  // Distribuição: TODAS as 6 categorias canônicas (mesmo zeradas).
  const itensDist = CATEGORIAS.map(c => ({
    cat: c.valor,
    n: dist[c.valor] || 0,
    nome: c.rotulo,
  })).sort(ordenarPorPresenca);

  // Layout v2 — 4 KPIs no topo (total + estados) + chips de distribuicao
  rod.innerHTML = `
    <div class="cxd-kpi cxd-kpi--total">
      <span class="cxd-kpi-label">Total do dia</span>
      <span class="cxd-kpi-value">${formatBRL(total)}</span>
      <span class="cxd-kpi-sub">${validos.length} ${validos.length === 1 ? 'lançamento válido' : 'lançamentos válidos'}</span>
    </div>
    ${itensEstado.map(i => `
      <div class="cxd-kpi" data-tom="${i.tom}" data-zero="${i.n === 0}">
        <span class="cxd-kpi-label">${i.rotulo}</span>
        <span class="cxd-kpi-value">${i.n}</span>
      </div>
    `).join('')}

    <div class="cxd-kpi-dist">
      <div class="cxd-kpi-dist-head">
        <span class="cxd-kpi-dist-label">Por categoria</span>
        ${(() => {
          const totalCat = itensDist.reduce((s, i) => s + (i.n || 0), 0);
          return totalCat > 0
            ? `<span class="cxd-kpi-dist-total"><strong>${totalCat}</strong> ${totalCat === 1 ? 'lançamento' : 'lançamentos'}</span>`
            : '';
        })()}
      </div>
      <div class="cxd-kpi-dist-chips">
        ${itensDist.filter(i => i.n > 0).map(i => `
          <span class="cxd-kpi-dist-chip" data-cat="${esc(i.cat)}">
            <span class="cxd-kpi-dist-chip-n">${i.n}</span>
            <span class="cxd-kpi-dist-chip-nome">${esc(i.nome)}</span>
          </span>
        `).join('')}
        ${itensDist.every(i => i.n === 0) ? '<span class="cxd-kpi-dist-vazio">Nenhum lançamento categorizado ainda</span>' : ''}
      </div>
    </div>
  `;
}

function renderSemCaixa(dataAlvo) {
  return `
    <div class="vazio">
      <div class="vazio-num">○</div>
      <p class="vazio-titulo">Sem caixa aberto para esta data.</p>
      <p class="vazio-desc">
        O caixa é gerado automaticamente todo dia útil às 06h.
        Se ainda não rolou, abra manualmente abaixo.
      </p>
      <button id="btn-criar-caixa" class="btn-primary mt-4">
        Abrir caixa de ${dataCurta(dataAlvo)}
      </button>
    </div>`;
}

function formatarDataBR(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function diasUteisDesde(ts) {
  const ini = new Date(ts);
  const hoje = new Date();
  let dias = 0;
  const cur = new Date(ini);
  cur.setHours(0,0,0,0);
  hoje.setHours(0,0,0,0);
  while (cur < hoje) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) dias++;
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

// ─── Realtime ─────────────────────────────────────────────────────────────
function ligarRealtime(caixaId) {
  canalLanc = supabase.channel(`caixa-${caixaId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lancamento', filter: `caixa_id=eq.${caixaId}` },
        (payload) => {
          carregarLancamentos(caixaId).then(() => {
            // Pisca a linha que mudou (se ainda estiver no DOM).
            const id = payload.new?.id || payload.old?.id;
            if (!id) return;
            const el = document.querySelector(`.lanc-row[data-id="${id}"]`);
            if (el) el.classList.add('lanc-row--flash');
          });
        })
    .subscribe();
}

function desmontar() {
  if (canalLanc) {
    supabase.removeChannel(canalLanc).catch(() => {});
    canalLanc = null;
  }
  if (fbCtrl) {
    fbCtrl.destruir();
    fbCtrl = null;
  }
  if (fbOverlayObs) {
    fbOverlayObs.disconnect();
    fbOverlayObs = null;
  }
  if (fbOverlayResizeFn) {
    window.removeEventListener('resize', fbOverlayResizeFn);
    fbOverlayResizeFn = null;
  }
  if (filtroV2DocListeners) {
    document.removeEventListener('mousedown', filtroV2DocListeners.mousedown);
    document.removeEventListener('keydown',   filtroV2DocListeners.keydown);
    filtroV2DocListeners = null;
  }
  lancCache = [];
}

function blocoSkel() {
  return `
    <ul class="cxd-lanc-lista">
      ${[1,2,3,4].map(() => `<li><div class="dash2-skel" style="height:4.5rem;border-radius:10px"></div></li>`).join('')}
    </ul>`;
}

function mostrarErroEFim(msg) {
  document.querySelector('#app').innerHTML = `
    <main class="min-h-screen flex items-center justify-center p-8 text-center">
      <div>
        <p class="h-eyebrow" style="color:var(--c-alerta)">Erro</p>
        <h1 class="h-display text-4xl mt-1 mb-4">${esc(msg)}</h1>
        <a href="/dashboard" data-link class="btn-link">Voltar ao painel</a>
      </div>
    </main>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Capitaliza so a primeira letra (preserva "quarta-feira" e "de").
// Substitui o text-transform:capitalize do CSS que estragava datas pt-BR.
function capitalizarPrimeira(s) {
  const str = String(s ?? '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}
