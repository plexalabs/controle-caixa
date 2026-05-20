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
import { dataLonga, dataCurta, isoData, hora,
         LABEL_CATEGORIA, LABEL_CATEGORIA_CURTA, ESTADO_CAIXA,
         CATEGORIAS, resumoDetalhes } from '../dominio.js';
import { formatBRL } from '../utils.js';
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
          <h1 class="cxd-title" id="cab-data">${dataLonga(dataAlvo)}</h1>
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

      <!-- Toolbar: filtros + acoes -->
      <div class="cxd-toolbar">
        <div id="cx-filtros" class="cxd-filtros-slot hidden"></div>
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
  const [{ data: caixa }] = await Promise.all([
    supabase
      .from('caixa')
      .select('id, data, estado, total_lancamentos, total_pendentes, total_valor, criado_em, aberto_por')
      .eq('data', dataAlvo)
      .maybeSingle(),
    carregarPermissoes(),
  ]);

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
    btnNov.onclick = () => abrirModalReabrirCaixa({
      caixaId:    caixa.id,
      dataCaixa:  dataAlvo,
      aoConcluir: () => carregarCaixa(dataAlvo),
    });
  } else {
    btnNov.classList.remove('hidden');
    btnNov.disabled = false;
    btnNov.textContent = '+ Novo lançamento';
    btnNov.onclick = () =>
      abrirModalAdicionarNF({ dataCaixa: dataAlvo, aoSalvar: () => carregarLancamentos(caixa.id) });
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
        hintTxt.innerHTML = `Resolva ${n === 1 ? 'a pendência' : 'as <strong>' + n + '</strong> pendências'} antes de fechar`;
      }
      hintPend?.setAttribute('href', `/pendencias?busca=${dataAlvo}`);
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
    document.querySelector('#cx-filtros')?.classList.add('hidden');
    bloco.innerHTML = `
      <div class="cxd-empty cxd-empty--inicial">
        <p class="cxd-empty-eyebrow">Caixa em branco</p>
        <p class="cxd-empty-title">Nenhum lançamento ainda.</p>
        <p class="cxd-empty-msg">Comece pelo botão <strong>+ Novo lançamento</strong> no canto superior direito desta tela ou na barra do topo.</p>
      </div>`;
    atualizarRodape([]);
    return;
  }

  // CP5.5: instala filter-bar na primeira carga (ou reaplica estado da URL)
  garantirFilterBar();
  renderListaFiltrada();
  atualizarRodape(lancCache);
}

// ─── CP5.5: filter-bar do caixa do dia ────────────────────────────────
function garantirFilterBar() {
  const cont = document.querySelector('#cx-filtros');
  if (!cont) return;
  cont.classList.remove('hidden');
  if (fbCtrl) return;   // já instalado nesta visita

  fbCtrl = instalarFilterBar(cont, {
    filtros: [
      { id: 'categoria', label: 'Categoria', tipo: 'select', opcoes: [
        { valor: '',           rotulo: 'Todas' },
        { valor: 'em_analise', rotulo: 'Em análise (sem categoria)' },
        ...CATEGORIAS.map(c => ({ valor: c.valor, rotulo: c.rotulo })),
      ]},
      { id: 'estado', label: 'Estado', tipo: 'select', opcoes: [
        { valor: '',              rotulo: 'Todos' },
        { valor: 'pendente',      rotulo: 'Em análise' },
        { valor: 'completo',      rotulo: 'Categorizado' },
        { valor: 'finalizado',    rotulo: 'Finalizado' },
        { valor: 'cancelado_pos', rotulo: 'Cancelado pós-pagamento' },
      ]},
      { id: 'busca', label: 'Buscar', tipo: 'texto', placeholder: 'NF ou cliente' },
      { id: 'ocultar_resolvidos', label: 'Ocultar resolvidos', tipo: 'toggle' },
    ],
    onChange: () => renderListaFiltrada(),
  });

  configurarOverlayFiltroMobile();
}

// Em mobile (<=640px), o slot do filter-bar vira overlay position:absolute
// sobre a row quando o filter abre -- cobre os botões. Como ele sai do
// fluxo, a .cx-acoes-row mantém altura natural da .resumo-acao (~44px) e
// a lista de lançamentos NÃO seria empurnada naturalmente. Aqui medimos
// a altura do filter-bar quando abre e aplicamos padding-bottom dinâmico
// na row (--fb-overlay-h) -- a lista desce abaixo do filter expandido.
function configurarOverlayFiltroMobile() {
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
  const f = fbCtrl?.estado() || {};
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
    el.addEventListener('click', () => {
      const lanc = porId[el.dataset.id];
      if (!lanc) return;
      abrirModalEditarLancamento({
        lancamento: lanc,
        dataCaixa:  dataAlvoAtual,
        aoSalvar:   () => carregarLancamentos(caixaIdAtual),
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

  // Tons da categoria pra colorir o chip lateral (rgba leve coerente
  // com /caixas) — sem filete grosso, so background tonal.
  return `
    <button class="cxd-lanc" data-cat="${esc(cat)}"
            data-em-analise="${emAnalise}"
            data-estado-final="${esc(estadoFinal)}"
            data-resolvido="${ehResolvido}" data-atrasado="${ehAtrasado}"
            data-id="${esc(l.id)}"
            data-numero-nf="${esc(l.numero_nf || '')}">
      <div class="cxd-lanc-esq">
        <span class="cxd-lanc-nf">NF ${esc(l.numero_nf)}</span>
        <time class="cxd-lanc-hora">${hora(l.criado_em)}</time>
      </div>

      <div class="cxd-lanc-meio">
        <span class="cxd-lanc-cliente">${esc(l.cliente_nome || '— sem cliente —')}</span>
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

      ${ehAtrasado ? `
        <span class="cxd-lanc-flag" title="Pendente há mais de 3 dias úteis" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13h13Z"/><path d="M8 6.5v3"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>
        </span>
      ` : ''}
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
      <span class="cxd-kpi-dist-label">Por categoria</span>
      <div class="cxd-kpi-dist-chips">
        ${itensDist.filter(i => i.n > 0).map(i => `
          <span class="cxd-kpi-dist-chip" data-cat="${esc(i.cat)}">
            <span class="cxd-kpi-dist-chip-nome">${esc(i.nome)}</span>
            <span class="cxd-kpi-dist-chip-n">${i.n}</span>
          </span>
        `).join('')}
        ${itensDist.every(i => i.n === 0) ? '<span class="cxd-kpi-dist-vazio">— sem lançamentos categorizados</span>' : ''}
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
