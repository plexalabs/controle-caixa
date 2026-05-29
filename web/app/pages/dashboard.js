// dashboard.js — Tela /dashboard (refator visual v2 "Clean Profissional").
// Layout v2-3 (2026-05-20): adiciona delta vs ontem nos KPIs, bloco
// dinamico de "Caixa de hoje" e estatistica geral (movimento do mes).
//
// Ordem das secoes (definida pelo operador):
//   1. KPIs (4 cards com setas delta)
//   2. Avisos
//   3. Pendencias criticas (so aparece se houver)
//   4. Distribuicao do mes
//   5. Caixa de hoje (status + mini stats OU CTA pra abrir)
//   6. Movimento do mes (chart de barras dos dias)

import { supabase, pegarSessao } from '../supabase.js';
import { destinoNotificacao, enriquecerNotificacoes } from '../notificacao-router.js';
import { log } from '../log.js';
import { renderShell, ligarShell } from '../shell.js';
import { saudacaoPorHora, dataLonga, isoData, LABEL_CATEGORIA, CATEGORIAS } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';

let canalNotif = null;

export async function renderDashboard() {
  desmontar();

  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const nome   = (meta.nome || sessao?.user?.email?.split('@')[0] || 'Operador').trim();
  const hoje   = new Date();
  const hojeISO = isoData(hoje);
  // Mobile: dashboard enxuto — só o essencial do dia. Os gráficos
  // analíticos (distribuição / movimento do mês) ficam fora.
  const ehMobile = window.innerWidth < 768;

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'dashboard',
    conteudo: `
    <main id="main" class="dash2">
      <header class="dash2-header">
        <div class="dash2-header-left">
          <p class="dash2-header-data">${dataLonga(hoje)}</p>
          <h1 class="dash2-header-title">
            ${saudacaoPorHora(hoje)}, <span class="dash2-header-name">${esc(nome)}</span>.
          </h1>
        </div>
      </header>

      <section class="dash2-kpis" aria-label="Resumo do dia">
        ${kpiSkel()}${kpiSkel()}${kpiSkel()}${kpiSkel()}${kpiSkel(true)}
      </section>

      <!-- Pendencias criticas — alerta em largura cheia quando aparece -->
      <article id="bloco-criticas" class="dash2-card dash2-card--alert hidden" aria-labelledby="h-crit">
        <header class="dash2-card-head">
          <div>
            <h2 id="h-crit" class="dash2-card-title">Pendências críticas</h2>
            <p class="dash2-card-sub">Mais de 3 dias úteis</p>
          </div>
          <a href="/pendencias" data-link class="dash2-link">Ver todas →</a>
        </header>
        <div id="lista-criticas" class="dash2-criticas"></div>
      </article>

      <!-- 4 cards principais em grade 2x2 (ordem de leitura LTR):
           Linha 1: Caixa de hoje | Avisos
           Linha 2: Distribuicao  | Caixas abertos -->
      <div class="dash2-cols">
        <div class="dash2-col">
          <article id="bloco-caixa-hoje" class="dash2-card" aria-labelledby="h-caixa">
            <header class="dash2-card-head">
              <div>
                <h2 id="h-caixa" class="dash2-card-title">Caixa de hoje</h2>
                <p class="dash2-card-sub" id="caixa-hoje-sub">—</p>
              </div>
              <a id="caixa-hoje-link" href="/caixa/hoje" data-link
                 class="dash2-cta-inline hidden" data-tone="ok">
                <span class="dash2-cta-inline-text">Ir para o caixa</span>
                <span class="dash2-cta-inline-arrow" aria-hidden="true">→</span>
              </a>
            </header>
            <div id="caixa-hoje-conteudo" class="dash2-card-body">
              ${blocoSkel()}
            </div>
          </article>

          ${ehMobile ? '' : `
          <article id="bloco-distribuicao" class="dash2-card" aria-labelledby="h-dist">
            <header class="dash2-card-head">
              <div>
                <h2 id="h-dist" class="dash2-card-title">Distribuição do mês</h2>
                <p class="dash2-card-sub" id="dist-mes-rotulo">—</p>
              </div>
            </header>
            <div id="dist-conteudo" class="dash2-card-body">
              ${blocoSkel()}
            </div>
          </article>
          `}
        </div>

        <div class="dash2-col">
          <article id="bloco-avisos" class="dash2-card" aria-labelledby="h-avisos">
            <header class="dash2-card-head">
              <div>
                <h2 id="h-avisos" class="dash2-card-title">Avisos</h2>
                <p class="dash2-card-sub" id="contagem-notif">—</p>
              </div>
              <a href="/notificacoes" data-link class="dash2-link">Ver todos →</a>
            </header>
            <div id="lista-notif" class="dash2-card-body">
              ${blocoSkel()}
            </div>
          </article>

          <article id="bloco-caixas-abertos" class="dash2-card" aria-labelledby="h-abertos">
            <header class="dash2-card-head">
              <div>
                <h2 id="h-abertos" class="dash2-card-title">Caixas abertos</h2>
                <p class="dash2-card-sub" id="abertos-sub">—</p>
              </div>
              <a href="/caixas" data-link class="dash2-link">Ver todos →</a>
            </header>
            <div id="abertos-conteudo" class="dash2-card-body">
              ${blocoSkel()}
            </div>
          </article>
        </div>
      </div>
    </main>
    `,
  });

  ligarShell();
  await carregarResumo(hojeISO);
  await carregarNotificacoes();
  await carregarCriticas();
  await carregarCaixasAbertos(hojeISO);
  if (!ehMobile) {
    await carregarDistribuicaoCategoria();
  }
  ligarRealtime();
}

// ─── Caixas abertos (de outros dias) ─────────────────────────────────
// Lista compacta dos caixas com estado aberto/em_conferencia (excluindo
// o de hoje, que ja tem bloco proprio). Bullet colorido por estado,
// data + estado + mini stats inline. Click navega pra /caixa/YYYY-MM-DD.
async function carregarCaixasAbertos(hojeISO) {
  const cont = document.querySelector('#abertos-conteudo');
  const sub  = document.querySelector('#abertos-sub');
  if (!cont) return;

  const { data, error } = await supabase
    .from('caixa')
    .select('id, data, estado, total_lancamentos, total_valor, total_pendentes')
    .in('estado', ['aberto', 'em_conferencia'])
    .neq('data', hojeISO)
    .order('data', { ascending: false })
    .limit(6);

  if (error) {
    cont.innerHTML = `<p class="dash2-empty-msg">Não foi possível carregar.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    if (sub) sub.textContent = 'nenhum em aberto';
    cont.innerHTML = `
      <div class="dash2-empty">
        <p class="dash2-empty-title">Nenhum caixa pendente.</p>
        <p class="dash2-empty-msg">Todos os dias anteriores foram fechados — operação em dia.</p>
      </div>`;
    return;
  }

  const total = data.length;
  const totalPend = data.reduce((s, c) => s + (c.total_pendentes || 0), 0);
  if (sub) {
    sub.textContent = totalPend > 0
      ? `${total} dia${total > 1 ? 's' : ''} · ${totalPend} pendência${totalPend > 1 ? 's' : ''} acumulada${totalPend > 1 ? 's' : ''}`
      : `${total} dia${total > 1 ? 's' : ''} sem pendências`;
  }

  cont.innerHTML = `
    <ul class="dash2-abertos" role="list">
      ${data.map(itemAberto).join('')}
    </ul>`;
}

function itemAberto(c) {
  const data = new Date(c.data + 'T00:00:00');
  const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(data).replace('.', '');
  const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(data);
  const estadoRot = c.estado === 'aberto' ? 'aberto' : 'em conferência';
  const tone = c.estado === 'aberto' ? 'ok' : 'warn';
  const pend = c.total_pendentes ?? 0;
  const lanc = c.total_lancamentos ?? 0;

  const metaExtra = pend > 0
    ? `<span class="dash2-aberto-sep" aria-hidden="true">·</span>
       <span class="dash2-aberto-meta" data-pend="sim">
         <span class="dash2-aberto-meta-num">${pend}</span>
         ${pend === 1 ? 'pendente' : 'pendentes'}
       </span>`
    : '';

  return `
    <li>
      <a href="/caixa/${c.data}" data-link class="dash2-aberto" data-tone="${tone}">
        <span class="dash2-aberto-topo">
          <span class="dash2-aberto-data-bloco">
            <span class="dash2-aberto-data">${dataCurta}</span>
            <span class="dash2-aberto-dia">${esc(diaSemana)}</span>
          </span>
          <span class="dash2-aberto-chip" data-tone="${tone}">${esc(estadoRot)}</span>
        </span>
        <span class="dash2-aberto-base">
          <span class="dash2-aberto-valor">${formatBRL(c.total_valor ?? 0)}</span>
          <span class="dash2-aberto-meta-grupo">
            <span class="dash2-aberto-meta">
              <span class="dash2-aberto-meta-num">${lanc}</span>
              ${lanc === 1 ? 'lançamento' : 'lançamentos'}
            </span>
            ${metaExtra}
          </span>
        </span>
      </a>
    </li>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────────
async function carregarResumo(hojeISO) {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = isoData(ontem);

  // O caixa hoje usa criado_por (nao existe aberto_por no schema). Falha
  // aqui era silenciosa — agora o erro vaza pro log pra nao mascarar 0s.
  const { data: caixaHoje, error: errHoje } = await supabase
    .from('caixa')
    .select('id, total_lancamentos, total_valor, total_pendentes, total_resolvidas, estado, data, criado_em, criado_por')
    .eq('data', hojeISO)
    .maybeSingle();
  if (errHoje) log.erro('dash: falha ao carregar caixa hoje', errHoje, { hojeISO });

  const { data: caixaOntem, error: errOntem } = await supabase
    .from('caixa')
    .select('id, estado, data, total_valor, total_lancamentos, total_pendentes')
    .eq('data', ontemISO)
    .maybeSingle();
  if (errOntem) log.erro('dash: falha ao carregar caixa ontem', errOntem, { ontemISO });

  const { count: resolvidasHoje, error: errResHoje } = await supabase
    .from('lancamento')
    .select('id', { count: 'exact', head: true })
    .gte('resolvido_em', hojeISO + 'T00:00:00')
    .lt('resolvido_em',  hojeISO + 'T23:59:59');
  if (errResHoje) log.erro('dash: falha ao contar resolvidas hoje', errResHoje);

  const { count: resolvidasOntem, error: errResOntem } = await supabase
    .from('lancamento')
    .select('id', { count: 'exact', head: true })
    .gte('resolvido_em', ontemISO + 'T00:00:00')
    .lt('resolvido_em',  ontemISO + 'T23:59:59');
  if (errResOntem) log.erro('dash: falha ao contar resolvidas ontem', errResOntem);

  // Acumulado do mes ate hoje + mesmo periodo do mes anterior (pra delta)
  const hojeData = new Date();
  const inicioMes = new Date(hojeData.getFullYear(), hojeData.getMonth(), 1);
  const inicioMesAnt = new Date(hojeData.getFullYear(), hojeData.getMonth() - 1, 1);
  const mesmoDiaAnt = new Date(hojeData.getFullYear(), hojeData.getMonth() - 1, hojeData.getDate());

  const { data: caixaMes, error: errMes } = await supabase
    .from('caixa')
    .select('total_valor')
    .gte('data', isoData(inicioMes))
    .lte('data', hojeISO);
  if (errMes) log.erro('dash: falha ao carregar acumulado mes', errMes);

  const { data: caixaMesAnt, error: errMesAnt } = await supabase
    .from('caixa')
    .select('total_valor')
    .gte('data', isoData(inicioMesAnt))
    .lte('data', isoData(mesmoDiaAnt));
  if (errMesAnt) log.erro('dash: falha ao carregar mes anterior', errMesAnt);

  const totalMes    = (caixaMes    || []).reduce((s, c) => s + Number(c.total_valor || 0), 0);
  const totalMesAnt = (caixaMesAnt || []).reduce((s, c) => s + Number(c.total_valor || 0), 0);
  const diaDoMes = hojeData.getDate();

  // Delta % vs ontem (helper). Tone 'up' = bom, 'down' = ruim — pra
  // pendentes invertemos (menos pendentes e bom).
  const dvalor = pctDelta(caixaHoje?.total_valor ?? 0, caixaOntem?.total_valor ?? 0);
  const dlanc  = pctDelta(caixaHoje?.total_lancamentos ?? 0, caixaOntem?.total_lancamentos ?? 0);
  const dpend  = pctDelta(caixaHoje?.total_pendentes ?? 0, caixaOntem?.total_pendentes ?? 0);
  const dres   = pctDelta(resolvidasHoje ?? 0, resolvidasOntem ?? 0);
  const dmes   = pctDelta(totalMes, totalMesAnt);

  const cards = [
    kpi({
      label: 'Recebido hoje',
      value: formatBRL(caixaHoje?.total_valor ?? 0),
      subPrefix: 'ontem',
      subValue: formatBRL(caixaOntem?.total_valor ?? 0),
      delta: dvalor,
      href: '/caixa/hoje',
      icon: svgWallet(),
      cor: 'dinheiro',
    }),
    kpi({
      label: 'Lançamentos',
      value: String(caixaHoje?.total_lancamentos ?? 0),
      subPrefix: 'ontem',
      subValue: String(caixaOntem?.total_lancamentos ?? 0),
      delta: dlanc,
      href: '/caixa/hoje',
      icon: svgList(),
      cor: 'cartao',
    }),
    kpi({
      label: 'Pendentes',
      value: String(caixaHoje?.total_pendentes ?? 0),
      subPrefix: 'ontem',
      subValue: String(caixaOntem?.total_pendentes ?? 0),
      delta: dpend,
      deltaInvert: true,  // menos pendentes = bom (verde pra baixo)
      href: '/pendencias',
      icon: svgClock(),
      cor: 'warn',
    }),
    kpi({
      label: 'Resolvidas hoje',
      value: String(resolvidasHoje ?? 0),
      subPrefix: 'ontem',
      subValue: String(resolvidasOntem ?? 0),
      delta: dres,
      href: '/pendencias',
      icon: svgCheck(),
      cor: 'pix',
    }),
    kpi({
      label: 'Mês até agora',
      value: formatBRL(totalMes),
      subPrefix: 'mês passado',
      subValue: formatBRL(totalMesAnt),
      delta: dmes,
      href: '/relatorios',
      icon: svgCalendar(),
      cor: 'link',
      xlOnly: true,
    }),
  ].join('');

  const grid = document.querySelector('.dash2-kpis');
  if (grid) grid.innerHTML = cards;

  // Apos renderizar, mede em varios momentos pra cobrir layouts lentos
  // (fontes carregando, sidebar animando, container resize tardio).
  requestAnimationFrame(() => requestAnimationFrame(ajustarKpiMarquee));
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(ajustarKpiMarquee);
  }
  setTimeout(ajustarKpiMarquee, 400);
  setTimeout(ajustarKpiMarquee, 1200);

  // ResizeObserver no container — reage a qualquer mudanca de largura
  // (sidebar abrindo, viewport redimensionando, devtools, zoom).
  if (grid && window.ResizeObserver && !grid.dataset.roBound) {
    const ro = new ResizeObserver(() => ajustarKpiMarquee());
    ro.observe(grid);
    grid.dataset.roBound = '1';
  }

  // Dispara evento pra topbar (e quem mais escutar) reagir ao estado
  // do caixa de hoje. Topbar troca label/tone do botao CTA.
  window.dispatchEvent(new CustomEvent('caixa-hoje-mudou', {
    detail: { estado: caixaHoje?.estado ?? null }
  }));

  // Bloco caixa-de-hoje (logo abaixo dos KPIs)
  renderCaixaDeHoje(caixaHoje, hojeISO);
}

// Detecta overflow no sub do KPI e ativa marquee. Mede a parte
// original (sem clone, sem padding-right de gap) vs o container.
// Como o estado .is-marquee adiciona padding ao part (pro gap entre
// original e clone), tiramos a classe antes de medir pra leitura
// limpa, e depois reaplicamos se necessario.
let kpiResizeTimer = null;
function ajustarKpiMarquee() {
  document.querySelectorAll('.dash2-kpi-sub').forEach(el => {
    el.classList.remove('is-marquee'); // estado limpo pra medir
  });
  // Forca reflow pra garantir que o estilo limpo foi aplicado
  document.body.offsetHeight;
  document.querySelectorAll('.dash2-kpi-sub').forEach(el => {
    const part = el.querySelector('.dash2-kpi-sub-part:not(.dash2-kpi-sub-part--clone)');
    if (!part) return;
    // Tolerancia de 2px pra arredondamento de sub-pixel
    const precisa = part.scrollWidth > el.clientWidth - 2;
    if (precisa) el.classList.add('is-marquee');
  });
}
window.addEventListener('resize', () => {
  clearTimeout(kpiResizeTimer);
  kpiResizeTimer = setTimeout(ajustarKpiMarquee, 120);
});

function pctDelta(atual, anterior) {
  // Retorna { pct: number|null, tone: 'up'|'down'|'flat'|'new' }
  if (anterior === 0 && atual === 0) return { pct: 0, tone: 'flat' };
  if (anterior === 0 && atual > 0)   return { pct: null, tone: 'up', novo: true };
  if (anterior > 0  && atual === 0)  return { pct: -100, tone: 'down' };
  const p = ((atual - anterior) / anterior) * 100;
  if (Math.abs(p) < 0.5) return { pct: 0, tone: 'flat' };
  return { pct: p, tone: p > 0 ? 'up' : 'down' };
}

function kpi({ label, value, sub, subPrefix, subValue, delta, deltaInvert, href, icon, cor, xlOnly }) {
  // Decide cor da seta: tipicamente up=verde, down=vermelho. Pra metricas
  // onde menor e melhor (ex: pendentes), invertemos.
  let tone = delta?.tone || 'flat';
  if (deltaInvert) {
    if (tone === 'up')   tone = 'down';
    else if (tone === 'down') tone = 'up';
  }

  let deltaHtml = '';
  if (delta) {
    if (delta.novo) {
      deltaHtml = `<span class="dash2-kpi-delta" data-tone="up">${svgArrowUp()} novo</span>`;
    } else if (delta.tone === 'flat') {
      deltaHtml = `<span class="dash2-kpi-delta" data-tone="flat">— estável</span>`;
    } else {
      const pct = Math.abs(delta.pct).toFixed(0);
      const arrow = delta.tone === 'up' ? svgArrowUp() : svgArrowDown();
      deltaHtml = `<span class="dash2-kpi-delta" data-tone="${tone}">${arrow} ${pct}%</span>`;
    }
  }

  const attrs = [
    `data-link`,
    `class="dash2-kpi"`,
    cor    ? `data-cor="${cor}"`    : '',
    xlOnly ? `data-xl-only="1"`     : '',
  ].filter(Boolean).join(' ');

  // O sub e renderizado com duas copias do conteudo dentro de um track —
  // quando o texto nao cabe, JS adiciona .is-marquee e a animacao roda
  // em loop infinito. Quando cabe, a duplicata fica escondida. Isso
  // garante alinhamento inline (delta + sub na mesma linha) sempre.
  let subHtml = '';
  if (subValue !== undefined) {
    const part = `<span class="dash2-kpi-sub-part">${esc(subPrefix || '')} <span class="dash2-kpi-sub-val">${esc(subValue)}</span></span>`;
    subHtml = `<span class="dash2-kpi-sub"><span class="dash2-kpi-sub-track">${part}<span class="dash2-kpi-sub-part dash2-kpi-sub-part--clone" aria-hidden="true">${esc(subPrefix || '')} <span class="dash2-kpi-sub-val">${esc(subValue)}</span></span></span></span>`;
  } else if (sub) {
    subHtml = `<span class="dash2-kpi-sub"><span class="dash2-kpi-sub-track"><span class="dash2-kpi-sub-part">${esc(sub)}</span><span class="dash2-kpi-sub-part dash2-kpi-sub-part--clone" aria-hidden="true">${esc(sub)}</span></span></span>`;
  }

  return `
    <a href="${href}" ${attrs}>
      <span class="dash2-kpi-label">
        <span class="dash2-kpi-icon">${icon}</span>
        ${esc(label)}
      </span>
      <span class="dash2-kpi-value">${esc(value)}</span>
      <span class="dash2-kpi-foot">
        ${deltaHtml}
        ${subHtml}
      </span>
    </a>`;
}

function kpiSkel(xlOnly) {
  return `
    <div class="dash2-kpi" ${xlOnly ? 'data-xl-only="1"' : ''} style="cursor:default;pointer-events:none">
      <span class="dash2-kpi-label"><span class="dash2-skel" style="width:5rem;height:0.8rem"></span></span>
      <span class="dash2-skel" style="width:8rem;height:1.6rem;margin-top:0.5rem"></span>
      <span class="dash2-skel" style="width:6rem;height:0.75rem;margin-top:0.5rem"></span>
    </div>`;
}

function blocoSkel() {
  return `
    <div class="dash2-skel" style="height:3rem;margin-bottom:0.5rem"></div>
    <div class="dash2-skel" style="height:3rem;margin-bottom:0.5rem"></div>
    <div class="dash2-skel" style="height:3rem"></div>`;
}

// ─── Caixa de hoje (bloco dinamico) ──────────────────────────────────
function renderCaixaDeHoje(caixaHoje, hojeISO) {
  const cont  = document.querySelector('#caixa-hoje-conteudo');
  const sub   = document.querySelector('#caixa-hoje-sub');
  const link  = document.querySelector('#caixa-hoje-link');
  const card  = document.querySelector('#bloco-caixa-hoje');
  if (!cont) return;

  if (!caixaHoje) {
    if (sub)   sub.textContent = 'ainda não aberto';
    if (link)  link.classList.add('hidden');
    if (card)  { delete card.dataset.estado; delete card.dataset.temLancamento; }
    cont.innerHTML = `
      <div class="dash2-caixa-vazio">
        <p class="dash2-caixa-vazio-title">Comece o dia abrindo o caixa.</p>
        <p class="dash2-caixa-vazio-msg">Sem o caixa aberto, os lançamentos do dia ficam aguardando.</p>
        <a href="/caixa/hoje" data-link class="dash2-btn dash2-btn--primary dash2-caixa-vazio-cta">
          ${svgPlus()} Abrir caixa
        </a>
      </div>`;
    return;
  }

  // Tem caixa hoje — mostra mini stats com tom variando por estado
  const horaAberto = caixaHoje.criado_em
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(caixaHoje.criado_em))
    : '—';
  const estadoMap = {
    aberto:         { rotulo: 'Aberto',         tone: 'ok',      verbo: 'Em operação',  botaoLabel: 'Ir para o caixa →',    botaoTone: 'ok' },
    em_conferencia: { rotulo: 'Em conferência', tone: 'warn',    verbo: 'Aguardando conferência', botaoLabel: 'Conferir agora →',     botaoTone: 'warn' },
    fechado:        { rotulo: 'Fechado',        tone: 'neutral', verbo: 'Concluído',    botaoLabel: 'Ver fechamento →',     botaoTone: 'ghost' },
    arquivado:      { rotulo: 'Arquivado',      tone: 'neutral', verbo: 'Histórico',    botaoLabel: 'Ver caixa →',          botaoTone: 'ghost' },
  };
  const e = estadoMap[caixaHoje.estado] || { rotulo: caixaHoje.estado, tone: 'neutral', verbo: '—', botaoLabel: 'Ver caixa →', botaoTone: 'ghost' };

  if (sub) sub.textContent = `${e.verbo.toLowerCase()} · aberto às ${horaAberto}`;

  // Marca estado + presenca de lancamento no card. O filete lateral
  // (CSS) e aceso so quando ha algum lancamento — sinal de "caixa vivo".
  if (card) {
    card.dataset.estado = caixaHoje.estado;
    if ((caixaHoje.total_lancamentos ?? 0) > 0) card.dataset.temLancamento = '1';
    else delete card.dataset.temLancamento;
  }

  // CTA no cabecalho — texto e tom mudam conforme estado.
  if (link) {
    link.classList.remove('hidden');
    link.dataset.tone = e.botaoTone;
    const textoEl = link.querySelector('.dash2-cta-inline-text');
    if (textoEl) {
      // Tira a seta " →" do botaoLabel — a seta vira span proprio animavel
      textoEl.textContent = e.botaoLabel.replace(/\s*→\s*$/, '');
    }
  }

  // Meta inline (lançamentos · pendentes · resolvidas) — sem zeros chatos,
  // singular/plural corretos, "pendentes" em tom de alerta quando > 0.
  const lanc = caixaHoje.total_lancamentos ?? 0;
  const pend = caixaHoje.total_pendentes   ?? 0;
  const reso = caixaHoje.total_resolvidas  ?? 0;
  const partes = [];
  partes.push(
    `<span class="dash2-caixa-meta-item">` +
      `<span class="dash2-caixa-meta-num">${lanc}</span>` +
      `${lanc === 1 ? 'lançamento' : 'lançamentos'}` +
    `</span>`
  );
  if (pend > 0) {
    partes.push(
      `<span class="dash2-caixa-meta-item" data-tone="warn">` +
        `<span class="dash2-caixa-meta-num">${pend}</span>` +
        `${pend === 1 ? 'pendente' : 'pendentes'}` +
      `</span>`
    );
  }
  if (reso > 0) {
    partes.push(
      `<span class="dash2-caixa-meta-item">` +
        `<span class="dash2-caixa-meta-num">${reso}</span>` +
        `${reso === 1 ? 'resolvida' : 'resolvidas'}` +
      `</span>`
    );
  }
  const meta = partes.join('<span class="dash2-caixa-meta-sep" aria-hidden="true">·</span>');

  cont.innerHTML = `
    <div class="dash2-caixa-mini">
      <div class="dash2-caixa-hero">
        <div class="dash2-caixa-hero-topo">
          <span class="dash2-caixa-hero-valor">${formatBRL(caixaHoje.total_valor ?? 0)}</span>
          <span class="dash2-caixa-badge" data-tone="${e.tone}">${esc(e.rotulo)}</span>
        </div>
        <span class="dash2-caixa-hero-label">recebido hoje</span>
      </div>

      <div class="dash2-caixa-meta">${meta}</div>
    </div>`;
}

// ─── Avisos ─────────────────────────────────────────────────────────
async function carregarNotificacoes() {
  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;

  const { data, error, count } = await supabase
    .from('notificacao')
    .select('id, tipo, severidade, titulo, mensagem, lancamento_id, caixa_id, criada_em, lida_em',
            { count: 'exact' })
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`)
    .is('lida_em', null)
    .is('descartada_em', null)
    .order('criada_em', { ascending: false })
    .limit(4);

  const lista = document.querySelector('#lista-notif');
  const cont  = document.querySelector('#contagem-notif');
  if (!lista) return;

  if (error) {
    lista.innerHTML = `<p class="dash2-empty-msg">Não conseguimos carregar os avisos.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    lista.innerHTML = `
      <div class="dash2-empty">
        <p class="dash2-empty-title">Tudo em ordem.</p>
        <p class="dash2-empty-msg">Quando algo precisar de atenção, aparece aqui.</p>
      </div>`;
    if (cont) cont.textContent = 'nenhum aviso pendente';
    return;
  }

  if (cont) {
    const total = count ?? data.length;
    cont.textContent = total > 4
      ? `mostrando 4 de ${total} avisos não lidos`
      : `${total} aviso${total > 1 ? 's' : ''} não lido${total > 1 ? 's' : ''}`;
  }

  const enriquecidas = await enriquecerNotificacoes(data, supabase);
  lista.innerHTML = `<ul class="dash2-avisos">${enriquecidas.map(itemAviso).join('')}</ul>`;

  lista.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.notifId;
      const notif = enriquecidas.find(n => n.id === id);
      if (notif) marcarENavegar(notif);
    });
  });
}

function itemAviso(n) {
  const tone = n.severidade === 'urgente' ? 'danger'
            : n.severidade === 'aviso'   ? 'warn'
            : 'info';
  return `
    <li>
      <button data-notif-id="${esc(n.id)}" class="dash2-aviso" data-tone="${tone}">
        <span class="dash2-aviso-dot" aria-hidden="true"></span>
        <span class="dash2-aviso-body">
          <span class="dash2-aviso-head">
            <strong class="dash2-aviso-title">${esc(n.titulo)}</strong>
            <time class="dash2-aviso-time">${tempoRelativo(n.criada_em)}</time>
          </span>
          <p class="dash2-aviso-msg">${esc(n.mensagem)}</p>
        </span>
      </button>
    </li>`;
}

async function marcarENavegar(notif) {
  supabase.from('notificacao').update({ lida_em: new Date().toISOString() }).eq('id', notif.id);
  const { url, motivo, erro } = destinoNotificacao(notif);
  if (motivo === 'ok') return navegar(url);
  if (motivo === 'invalida') {
    log.warn(`notificacao ${notif.id} (${notif.tipo}) invalida`, { erro });
    return mostrarToast('Esta notificação não tem destino válido.', 'erro', 3500);
  }
  mostrarToast('Aviso informativo, sem ação direta.', 'info', 2200);
}

function tempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'agora';
  if (min < 60)  return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? 's' : ''}`;
}

// ─── Distribuição por categoria (mês) ────────────────────────────────
// Barras horizontais coloridas por categoria; sumario com total no topo.
// Quando o mes atual nao tem dados, faz fallback pro mes anterior.
async function carregarDistribuicaoCategoria() {
  const cont = document.querySelector('#dist-conteudo');
  const lblMes = document.querySelector('#dist-mes-rotulo');
  if (!cont) return;

  const hoje = new Date();
  const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

  let { data, error } = await supabase.rpc('distribuicao_categoria_mes', {
    p_mes_ref: isoData(inicioMesAtual),
  });
  let mesUsado = inicioMesAtual;

  if (!error && (!data || data.length === 0)) {
    const r = await supabase.rpc('distribuicao_categoria_mes', {
      p_mes_ref: isoData(inicioMesAnterior),
    });
    if (!r.error && r.data && r.data.length > 0) {
      data = r.data;
      mesUsado = inicioMesAnterior;
    }
  }

  if (lblMes) {
    const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    const sufixo = mesUsado.getMonth() === inicioMesAtual.getMonth() ? '' : ' (último mês com dados)';
    lblMes.textContent = fmtMes.format(mesUsado).replace(/^./, c => c.toUpperCase()) + sufixo;
  }

  if (error) {
    cont.innerHTML = `<p class="dash2-empty-msg">Não foi possível carregar a distribuição.</p>`;
    return;
  }

  const TODAS = [...CATEGORIAS, { valor: 'em_analise', rotulo: 'Em análise' }];
  const porCat = Object.fromEntries((data || []).map(r => [r.categoria, r]));
  const linhas = TODAS.map(c => ({
    categoria:   c.valor,
    rotulo:      c.rotulo,
    total_valor: Number(porCat[c.valor]?.total_valor ?? 0),
  })).filter(l => l.total_valor > 0);

  const totalGeral = linhas.reduce((s, r) => s + r.total_valor, 0);

  if (totalGeral === 0) {
    cont.innerHTML = `
      <div class="dash2-empty">
        <p class="dash2-empty-title">Sem dados ainda.</p>
        <p class="dash2-empty-msg">Categorize os lançamentos para ver a divisão por categoria.</p>
      </div>`;
    return;
  }

  linhas.sort((a, b) => b.total_valor - a.total_valor);

  const COR_CAT = {
    cartao:              'var(--cat-cartao-border)',
    pix:                 'var(--cat-pix-border)',
    dinheiro:            'var(--cat-dinheiro-border)',
    cancelado:           'var(--cat-cancelado-border)',
    cartao_link:         'var(--cat-link-border)',
    disponivel_retirada: 'var(--cat-retirada-border)',
    obs:                 'var(--cat-obs-border)',
    em_analise:          'var(--est-analise)',
  };

  const nCat = linhas.length;
  cont.innerHTML = `
    <div class="dash2-dist-sumario">
      <span class="dash2-dist-sumario-valor">${formatBRL(totalGeral)}</span>
      <span class="dash2-dist-sumario-label">total em ${nCat} ${nCat === 1 ? 'categoria' : 'categorias'}</span>
    </div>
    <ul class="dash2-dist">
      ${linhas.map(r => {
        const pct = (r.total_valor / totalGeral) * 100;
        const cor = COR_CAT[r.categoria] || 'var(--ui-accent)';
        return `
          <li class="dash2-dist-item" style="--cat-color:${cor}">
            <div class="dash2-dist-head">
              <span class="dash2-dist-label">
                <span class="dash2-dist-dot" aria-hidden="true"></span>
                ${esc(r.rotulo)}
              </span>
              <span class="dash2-dist-value">${formatBRL(r.total_valor)}</span>
            </div>
            <div class="dash2-dist-barra">
              <div class="dash2-dist-track" aria-hidden="true">
                <span class="dash2-dist-fill" style="width:${pct.toFixed(2)}%"></span>
              </div>
              <span class="dash2-dist-pct">${pct.toFixed(0)}%</span>
            </div>
          </li>`;
      }).join('')}
    </ul>`;
}

// ─── Pendências críticas ─────────────────────────────────────────────
async function carregarCriticas() {
  const { data, error } = await supabase
    .from('pendencia')
    .select('id, numero_nf, cliente_nome, valor_nf, data_caixa, idade_dias_uteis, severidade')
    .eq('severidade', 'urgente')
    .order('idade_dias_uteis', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return;

  const bloco = document.querySelector('#bloco-criticas');
  const lista = document.querySelector('#lista-criticas');
  if (!bloco || !lista) return;

  bloco.classList.remove('hidden');
  lista.innerHTML = data.map(p => `
    <a href="/caixa/${p.data_caixa}" data-link class="dash2-crit-row">
      <span class="dash2-crit-nf">NF ${esc(p.numero_nf)}</span>
      <span class="dash2-crit-cliente">${esc(p.cliente_nome)}</span>
      <span class="dash2-crit-idade">${p.idade_dias_uteis} dias úteis</span>
      <span class="dash2-crit-valor">${formatBRL(p.valor_nf)}</span>
    </a>
  `).join('');
}

// ─── Movimento do mês (estatistica geral dos dias) ───────────────────
// Chart de barras simples: 1 barra por dia do mes atual. Altura
// proporcional ao total_valor do caixa daquele dia. Feriado vira
// barra cinza menor. Dia futuro vira pista vazia.
// ─── Realtime ────────────────────────────────────────────────────────
// Widgets vivos: qualquer mexida em notificacao / caixa / lancamento
// recarrega os blocos relevantes — sem F5, os KPIs reagem na hora.
function ligarRealtime() {
  canalNotif = supabase.channel('dash-feed')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacao' },
        () => { carregarNotificacoes(); })
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'caixa' },
        () => {
          const hojeISO = isoData(new Date());
          carregarResumo(hojeISO);
          carregarCaixasAbertos(hojeISO);
        })
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lancamento' },
        () => {
          const hojeISO = isoData(new Date());
          carregarResumo(hojeISO);
          carregarCriticas();
          carregarDistribuicaoCategoria();  // no-op se elemento ausente (mobile)
        })
    .subscribe();
}

function desmontar() {
  if (canalNotif) {
    supabase.removeChannel(canalNotif).catch(() => {});
    canalNotif = null;
  }
}

// ─── SVGs ───────────────────────────────────────────────────────────
const A = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
function svgPlus()    { return `<svg ${A} stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>`; }
function svgWallet()  { return `<svg ${A}><rect x="2" y="4.5" width="12" height="9" rx="1.5"/><path d="M2 7h12"/><circle cx="11" cy="10" r="0.8" fill="currentColor"/></svg>`; }
function svgList()    { return `<svg ${A}><path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2.5" cy="4" r="0.7" fill="currentColor"/><circle cx="2.5" cy="8" r="0.7" fill="currentColor"/><circle cx="2.5" cy="12" r="0.7" fill="currentColor"/></svg>`; }
function svgClock()   { return `<svg ${A}><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>`; }
function svgCheck()   { return `<svg ${A}><path d="M3 8.5l3 3 7-7"/></svg>`; }
function svgCalendar(){ return `<svg ${A}><rect x="2.5" y="3.5" width="11" height="10" rx="1.2"/><path d="M2.5 6.5h11"/><path d="M5.5 2v2.5M10.5 2v2.5"/><circle cx="5.5" cy="9.5" r="0.6" fill="currentColor"/><circle cx="8" cy="9.5" r="0.6" fill="currentColor"/><circle cx="10.5" cy="9.5" r="0.6" fill="currentColor"/></svg>`; }
function svgArrowUp()   { return `<svg viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7l4-4 3 3 4-4"/><path d="M8 2h4v4"/></svg>`; }
function svgArrowDown() { return `<svg viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3l4 4 3-3 4 4"/><path d="M8 8h4V4"/></svg>`; }
// Cofre ilustrativo — mais marcante que icone de caixa. Estado vazio.
function svgVault() {
  return `
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="7" width="32" height="26" rx="2.5"/>
      <circle cx="20" cy="20" r="7"/>
      <circle cx="20" cy="20" r="2.5"/>
      <path d="M20 13v-2M20 29v-2M13 20h-2M29 20h-2"/>
      <path d="M7 33v3M33 33v3"/>
    </svg>`;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
