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
        <div id="dash2-header-cta"></div>
      </header>

      <section class="dash2-kpis" aria-label="Resumo do dia">
        ${kpiSkel()}${kpiSkel()}${kpiSkel()}${kpiSkel()}
      </section>

      <!-- Cards principais em duas colunas independentes — cada uma
           empilha verticalmente com altura natural. Card menor encosta
           no proximo da SUA coluna, sem esticar pra alinhar com o lado. -->
      <div class="dash2-cols">
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

          <article id="bloco-caixa-hoje" class="dash2-card" aria-labelledby="h-caixa">
            <header class="dash2-card-head">
              <div>
                <h2 id="h-caixa" class="dash2-card-title">Caixa de hoje</h2>
                <p class="dash2-card-sub" id="caixa-hoje-sub">—</p>
              </div>
              <a id="caixa-hoje-link" href="/caixa/hoje" data-link class="dash2-link hidden">Ir para o caixa →</a>
            </header>
            <div id="caixa-hoje-conteudo" class="dash2-card-body">
              ${blocoSkel()}
            </div>
          </article>
        </div>

        <div class="dash2-col">
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

      <!-- Linha 3: Distribuicao do mes (largura cheia) -->
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

      <!-- Linha 3: Movimento do mes (largura cheia - chart precisa de espaco) -->
      <article id="bloco-movimento" class="dash2-card" aria-labelledby="h-mov">
        <header class="dash2-card-head">
          <div>
            <h2 id="h-mov" class="dash2-card-title">Movimento do mês</h2>
            <p class="dash2-card-sub" id="mov-resumo">—</p>
          </div>
        </header>
        <div id="mov-conteudo" class="dash2-card-body">
          ${blocoSkel()}
        </div>
      </article>
    </main>
    `,
  });

  ligarShell();
  await carregarResumo(hojeISO);
  await carregarNotificacoes();
  await carregarCriticas();
  await carregarCaixasAbertos(hojeISO);
  await carregarDistribuicaoCategoria();
  await carregarMovimentoMes();
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
  const estadoRot = c.estado === 'aberto' ? 'Aberto' : 'Em conferência';
  const tone = c.estado === 'aberto' ? 'ok' : 'warn';
  const pend = c.total_pendentes ?? 0;

  return `
    <li>
      <a href="/caixa/${c.data}" data-link class="dash2-aberto" data-tone="${tone}">
        <span class="dash2-aberto-dot" aria-hidden="true"></span>
        <span class="dash2-aberto-body">
          <span class="dash2-aberto-head">
            <strong class="dash2-aberto-data">${dataCurta}</strong>
            <span class="dash2-aberto-dia">${esc(diaSemana)}</span>
            <span class="dash2-aberto-badge">${esc(estadoRot)}</span>
          </span>
          <span class="dash2-aberto-meta">
            <span>${c.total_lancamentos ?? 0} lanç.</span>
            <span>•</span>
            <span>${formatBRL(c.total_valor ?? 0)}</span>
            ${pend > 0 ? `<span>•</span><span class="dash2-aberto-pend">${pend} pend.</span>` : ''}
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

  const { data: caixaHoje } = await supabase
    .from('caixa')
    .select('id, total_lancamentos, total_valor, total_pendentes, estado, data, criado_em, aberto_por')
    .eq('data', hojeISO)
    .maybeSingle();

  const { data: caixaOntem } = await supabase
    .from('caixa')
    .select('id, estado, data, total_valor, total_lancamentos, total_pendentes')
    .eq('data', ontemISO)
    .maybeSingle();

  const { count: resolvidasHoje } = await supabase
    .from('lancamento')
    .select('id', { count: 'exact', head: true })
    .gte('resolvido_em', hojeISO + 'T00:00:00')
    .lt('resolvido_em',  hojeISO + 'T23:59:59');

  const { count: resolvidasOntem } = await supabase
    .from('lancamento')
    .select('id', { count: 'exact', head: true })
    .gte('resolvido_em', ontemISO + 'T00:00:00')
    .lt('resolvido_em',  ontemISO + 'T23:59:59');

  // Delta % vs ontem (helper). Tone 'up' = bom, 'down' = ruim — pra
  // pendentes invertemos (menos pendentes e bom).
  const dvalor = pctDelta(caixaHoje?.total_valor ?? 0, caixaOntem?.total_valor ?? 0);
  const dlanc  = pctDelta(caixaHoje?.total_lancamentos ?? 0, caixaOntem?.total_lancamentos ?? 0);
  const dpend  = pctDelta(caixaHoje?.total_pendentes ?? 0, caixaOntem?.total_pendentes ?? 0);
  const dres   = pctDelta(resolvidasHoje ?? 0, resolvidasOntem ?? 0);

  const cards = [
    kpi({
      label: 'Recebido hoje',
      value: formatBRL(caixaHoje?.total_valor ?? 0),
      sub: 'vs ontem',
      delta: dvalor,
      href: '/caixa/hoje',
      icon: svgWallet(),
    }),
    kpi({
      label: 'Lançamentos',
      value: String(caixaHoje?.total_lancamentos ?? 0),
      sub: 'vs ontem',
      delta: dlanc,
      href: '/caixa/hoje',
      icon: svgList(),
    }),
    kpi({
      label: 'Pendentes',
      value: String(caixaHoje?.total_pendentes ?? 0),
      sub: 'vs ontem',
      delta: dpend,
      deltaInvert: true,  // menos pendentes = bom (verde pra baixo)
      href: '/pendencias',
      icon: svgClock(),
    }),
    kpi({
      label: 'Resolvidas hoje',
      value: String(resolvidasHoje ?? 0),
      sub: 'vs ontem',
      delta: dres,
      href: '/pendencias',
      icon: svgCheck(),
    }),
  ].join('');

  const grid = document.querySelector('.dash2-kpis');
  if (grid) grid.innerHTML = cards;

  // Header CTA: so mostra atalho se NAO tem caixa hoje (demais estados
  // tem botoes dedicados no bloco abaixo + na topbar)
  const cta = document.querySelector('#dash2-header-cta');
  if (cta) {
    if (!caixaHoje) {
      cta.innerHTML = `<a href="/caixa/hoje" data-link class="dash2-btn dash2-btn--ghost dash2-btn--sm">Abrir caixa de hoje →</a>`;
    } else {
      cta.innerHTML = '';
    }
  }

  // Dispara evento pra topbar (e quem mais escutar) reagir ao estado
  // do caixa de hoje. Topbar troca label/tone do botao CTA.
  window.dispatchEvent(new CustomEvent('caixa-hoje-mudou', {
    detail: { estado: caixaHoje?.estado ?? null }
  }));

  // Bloco caixa-de-hoje (logo abaixo dos KPIs)
  renderCaixaDeHoje(caixaHoje, hojeISO);
}

function pctDelta(atual, anterior) {
  // Retorna { pct: number|null, tone: 'up'|'down'|'flat'|'new' }
  if (anterior === 0 && atual === 0) return { pct: 0, tone: 'flat' };
  if (anterior === 0 && atual > 0)   return { pct: null, tone: 'up', novo: true };
  if (anterior > 0  && atual === 0)  return { pct: -100, tone: 'down' };
  const p = ((atual - anterior) / anterior) * 100;
  if (Math.abs(p) < 0.5) return { pct: 0, tone: 'flat' };
  return { pct: p, tone: p > 0 ? 'up' : 'down' };
}

function kpi({ label, value, sub, delta, deltaInvert, href, icon }) {
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

  return `
    <a href="${href}" data-link class="dash2-kpi">
      <span class="dash2-kpi-label">
        <span class="dash2-kpi-icon">${icon}</span>
        ${esc(label)}
      </span>
      <span class="dash2-kpi-value">${esc(value)}</span>
      <span class="dash2-kpi-foot">
        ${deltaHtml}
        <span class="dash2-kpi-sub">${esc(sub)}</span>
      </span>
    </a>`;
}

function kpiSkel() {
  return `
    <div class="dash2-kpi" style="cursor:default;pointer-events:none">
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
  const cont = document.querySelector('#caixa-hoje-conteudo');
  const sub  = document.querySelector('#caixa-hoje-sub');
  const link = document.querySelector('#caixa-hoje-link');
  if (!cont) return;

  if (!caixaHoje) {
    if (sub) sub.textContent = 'ainda não aberto';
    if (link) link.classList.add('hidden');
    cont.innerHTML = `
      <div class="dash2-caixa-vazio">
        <p class="dash2-caixa-vazio-title">Comece o dia abrindo o caixa.</p>
        <p class="dash2-caixa-vazio-msg">Sem caixa aberto, lançamentos ficam em buffer e o resumo do dia não atualiza.</p>
        <a href="/caixa/hoje" data-link class="dash2-btn dash2-btn--primary dash2-btn--sm dash2-caixa-vazio-cta">
          ${svgPlus()} Abrir caixa de hoje
        </a>
      </div>`;
    return;
  }

  // Tem caixa hoje — mostra mini stats com tom variando por estado
  const horaAberto = caixaHoje.criado_em
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(caixaHoje.criado_em))
    : '—';
  const estadoMap = {
    aberto:         { rotulo: 'Aberto',         tone: 'ok',      verbo: 'Em operação',  botaoLabel: 'Ir para o caixa →',    botaoTone: 'primary' },
    em_conferencia: { rotulo: 'Em conferência', tone: 'warn',    verbo: 'Aguardando conferência', botaoLabel: 'Conferir agora →',     botaoTone: 'warn' },
    fechado:        { rotulo: 'Fechado',        tone: 'neutral', verbo: 'Concluído',    botaoLabel: 'Ver fechamento →',     botaoTone: 'ghost' },
    arquivado:      { rotulo: 'Arquivado',      tone: 'neutral', verbo: 'Histórico',    botaoLabel: 'Ver caixa →',          botaoTone: 'ghost' },
  };
  const e = estadoMap[caixaHoje.estado] || { rotulo: caixaHoje.estado, tone: 'neutral', verbo: '—', botaoLabel: 'Ver caixa →', botaoTone: 'ghost' };

  if (sub) sub.textContent = `${e.verbo.toLowerCase()} · aberto às ${horaAberto}`;
  if (link) link.classList.remove('hidden');

  // Tambem aplica o tom ao card inteiro (borda + filete)
  const card = document.querySelector('#bloco-caixa-hoje');
  if (card) card.dataset.estado = caixaHoje.estado;

  cont.innerHTML = `
    <div class="dash2-caixa-mini">
      <span class="dash2-caixa-badge" data-tone="${e.tone}">${esc(e.rotulo)}</span>

      <ul class="dash2-caixa-stats" role="list">
        <li>
          <span class="dash2-caixa-stat-label">Lançamentos</span>
          <span class="dash2-caixa-stat-value">${caixaHoje.total_lancamentos ?? 0}</span>
        </li>
        <li>
          <span class="dash2-caixa-stat-label">Recebido</span>
          <span class="dash2-caixa-stat-value">${formatBRL(caixaHoje.total_valor ?? 0)}</span>
        </li>
        <li>
          <span class="dash2-caixa-stat-label">Pendentes</span>
          <span class="dash2-caixa-stat-value" data-tone="${(caixaHoje.total_pendentes ?? 0) > 0 ? 'warn' : 'ok'}">
            ${caixaHoje.total_pendentes ?? 0}
          </span>
        </li>
      </ul>

      <a href="/caixa/hoje" data-link class="dash2-btn dash2-btn--${e.botaoTone} dash2-btn--sm">
        ${esc(e.botaoLabel)}
      </a>
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

// ─── Distribuição por categoria ──────────────────────────────────────
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
    categoria: c.valor,
    rotulo:    c.rotulo,
    total_valor: Number(porCat[c.valor]?.total_valor ?? 0),
  })).filter(l => l.total_valor > 0);

  const totalGeral = linhas.reduce((s, r) => s + r.total_valor, 0);

  if (totalGeral === 0) {
    cont.innerHTML = `
      <div class="dash2-empty">
        <p class="dash2-empty-title">Sem dados ainda.</p>
        <p class="dash2-empty-msg">Categorize lançamentos pra ver a divisão.</p>
      </div>`;
    return;
  }

  linhas.sort((a, b) => b.total_valor - a.total_valor);

  cont.innerHTML = `
    <ul class="dash2-dist">
      ${linhas.map((r) => {
        const pct = (r.total_valor / totalGeral) * 100;
        return `
          <li class="dash2-dist-item">
            <div class="dash2-dist-head">
              <span class="dash2-dist-label">${esc(r.rotulo)}</span>
              <span class="dash2-dist-meta">
                <span class="dash2-dist-pct">${pct.toFixed(0)}%</span>
                <span class="dash2-dist-value">${formatBRL(r.total_valor)}</span>
              </span>
            </div>
            <div class="dash2-dist-track" aria-hidden="true">
              <span class="dash2-dist-fill" style="width:${pct.toFixed(2)}%"></span>
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
async function carregarMovimentoMes() {
  const cont   = document.querySelector('#mov-conteudo');
  const resumo = document.querySelector('#mov-resumo');
  if (!cont) return;

  const hoje = new Date();
  const ano  = hoje.getFullYear();
  const mes  = hoje.getMonth();
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia   = new Date(ano, mes + 1, 0);
  const isoIni = isoData(primeiroDia);
  const isoFim = isoData(ultimoDia);

  const [resCaixas, resFeriados] = await Promise.all([
    supabase
      .from('caixa')
      .select('data, total_valor, total_lancamentos, estado')
      .gte('data', isoIni).lte('data', isoFim)
      .order('data', { ascending: true }),
    supabase
      .from('feriado')
      .select('data, descricao')
      .eq('ativo', true)
      .gte('data', isoIni).lte('data', isoFim),
  ]);

  if (resCaixas.error) {
    cont.innerHTML = `<p class="dash2-empty-msg">Não foi possível carregar o movimento.</p>`;
    return;
  }

  const caixaIndex   = Object.fromEntries((resCaixas.data || []).map(r => [r.data, r]));
  const feriadoIndex = Object.fromEntries((resFeriados.data || []).map(r => [r.data, r]));

  const dias = [];
  for (let d = new Date(primeiroDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
    const iso = isoData(new Date(d));
    const c = caixaIndex[iso];
    dias.push({
      data: iso,
      dia: d.getDate(),
      total_valor: Number(c?.total_valor ?? 0),
      total_lancamentos: Number(c?.total_lancamentos ?? 0),
      estado: c?.estado ?? null,
      feriado: feriadoIndex[iso] || null,
      futuro: new Date(iso) > hoje,
    });
  }

  const hojeISO = isoData(hoje);
  const valores = dias.map(d => d.total_valor).filter(v => v > 0);
  const maxValor = Math.max(...valores, 1);
  const totalPeriodo = dias.reduce((s, d) => s + d.total_valor, 0);
  const totalLanc = dias.reduce((s, d) => s + d.total_lancamentos, 0);

  if (resumo) {
    const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    resumo.textContent = `${fmtMes.format(primeiroDia).replace(/^./, c => c.toUpperCase())} · ${formatBRL(totalPeriodo)} em ${totalLanc} lançamento${totalLanc === 1 ? '' : 's'}`;
  }

  cont.innerHTML = `
    <div class="dash2-mov" style="--mov-cols:${dias.length}">
      ${dias.map(d => colMov(d, hojeISO, maxValor)).join('')}
    </div>`;
}

function colMov(d, hojeISO, maxValor) {
  const isHoje = d.data === hojeISO;
  const pct = d.total_valor > 0 ? (d.total_valor / maxValor) * 100 : 0;
  const label = d.feriado
    ? `${d.dia} — feriado: ${d.feriado.descricao}`
    : `${d.dia} — ${formatBRL(d.total_valor)} (${d.total_lancamentos} lançamentos)`;
  const cls = [
    'dash2-mov-col',
    isHoje  ? 'is-hoje'  : '',
    d.futuro? 'is-futuro': '',
    d.feriado ? 'is-feriado' : '',
  ].filter(Boolean).join(' ');
  const href = d.futuro ? null : `/caixa/${d.data}`;
  const inner = `
    <span class="dash2-mov-track" aria-hidden="true">
      <span class="dash2-mov-fill" style="height:${pct.toFixed(2)}%"></span>
    </span>
    <span class="dash2-mov-num">${d.dia}</span>`;
  if (href) {
    return `<a href="${href}" data-link class="${cls}" title="${esc(label)}">${inner}</a>`;
  }
  return `<span class="${cls}" title="${esc(label)}">${inner}</span>`;
}

// ─── Realtime ────────────────────────────────────────────────────────
function ligarRealtime() {
  canalNotif = supabase.channel('dash-notif')
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacao' },
        () => { carregarNotificacoes(); })
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notificacao' },
        () => { carregarNotificacoes(); })
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
