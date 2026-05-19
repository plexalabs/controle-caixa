// dashboard.js — Tela /dashboard (refator visual v2 "Clean Profissional").
// Logica de dados PRESERVADA (queries, RPCs, realtime). Markup novo
// usando namespace .dash2-* + tokens --ui-*. Sidebar nova ja vem via shell.
//
// Layout:
//   header (data + saudacao + acao primaria)
//   KPIs (4 cards: hoje, pendentes, retiradas, caixa de ontem)
//   2 colunas: Avisos + Distribuicao mensal
//   Pendencias criticas (so aparece se houver)
//
// Charts de movimento do mes ficaram fora desta iteracao — podem voltar
// se solicitado.

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
        <a href="/caixa/hoje" data-link class="dash2-btn dash2-btn--ghost dash2-btn--sm">
          Abrir caixa de hoje →
        </a>
      </header>

      <section class="dash2-kpis" aria-label="Resumo do dia">
        ${kpiSkel()}${kpiSkel()}${kpiSkel()}${kpiSkel()}
      </section>

      <div class="dash2-split">
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
      </div>

      <article id="bloco-criticas" class="dash2-card dash2-card--alert hidden" aria-labelledby="h-crit">
        <header class="dash2-card-head">
          <div>
            <h2 id="h-crit" class="dash2-card-title">Pendências críticas</h2>
            <p class="dash2-card-sub">Mais de 3 dias úteis sem resolução</p>
          </div>
          <a href="/pendencias" data-link class="dash2-link">Ver todas →</a>
        </header>
        <div id="lista-criticas" class="dash2-criticas"></div>
      </article>
    </main>
    `,
  });

  ligarShell();
  await carregarResumo(hojeISO);
  await carregarNotificacoes();
  await carregarCriticas();
  await carregarDistribuicaoCategoria();
  ligarRealtime();
}

// ─── KPIs ─────────────────────────────────────────────────────────────
async function carregarResumo(hojeISO) {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = isoData(ontem);

  const { data: caixaHoje } = await supabase
    .from('caixa')
    .select('id, total_lancamentos, total_valor, total_pendentes, estado')
    .eq('data', hojeISO)
    .maybeSingle();

  const { data: caixaOntem } = await supabase
    .from('caixa')
    .select('id, estado, data')
    .eq('data', ontemISO)
    .maybeSingle();

  const { count: resolvidasHoje } = await supabase
    .from('lancamento')
    .select('id', { count: 'exact', head: true })
    .gte('resolvido_em', hojeISO + 'T00:00:00')
    .lt('resolvido_em',  hojeISO + 'T23:59:59');

  const pendentes = caixaHoje?.total_pendentes ?? 0;
  const ontemFechado = caixaOntem?.estado === 'fechado';

  const cards = [
    kpi({
      label: 'Hoje',
      value: formatBRL(caixaHoje?.total_valor ?? 0),
      sub: `${caixaHoje?.total_lancamentos ?? 0} lançamento${(caixaHoje?.total_lancamentos ?? 0) === 1 ? '' : 's'}`,
      href: '/caixa/hoje',
      icon: svgWallet(),
      tone: 'neutral',
    }),
    kpi({
      label: 'Pendentes',
      value: String(pendentes),
      sub: pendentes > 0 ? 'aguardando ação' : 'tudo resolvido',
      href: '/pendencias',
      icon: svgClock(),
      tone: pendentes > 0 ? 'warn' : 'ok',
    }),
    kpi({
      label: 'Resolvidas hoje',
      value: String(resolvidasHoje ?? 0),
      sub: 'pendências fechadas',
      href: '/pendencias',
      icon: svgCheck(),
      tone: 'ok',
    }),
    kpi({
      label: 'Caixa de ontem',
      value: ontemFechado ? 'Fechado' : (caixaOntem ? 'Em aberto' : '—'),
      sub: caixaOntem ? `referência ${ontemISO.slice(8,10)}/${ontemISO.slice(5,7)}` : 'sem registro',
      href: caixaOntem ? `/caixa/${caixaOntem.data}` : '/caixa/hoje',
      icon: svgArchive(),
      tone: ontemFechado ? 'ok' : 'warn',
    }),
  ].join('');

  const grid = document.querySelector('.dash2-kpis');
  if (grid) grid.innerHTML = cards;
}

function kpi({ label, value, sub, href, icon, tone = 'neutral' }) {
  return `
    <a href="${href}" data-link class="dash2-kpi" data-tone="${tone}">
      <span class="dash2-kpi-label">
        <span class="dash2-kpi-icon">${icon}</span>
        ${esc(label)}
      </span>
      <span class="dash2-kpi-value">${esc(value)}</span>
      <span class="dash2-kpi-sub">${esc(sub)}</span>
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
function svgClock()   { return `<svg ${A}><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>`; }
function svgCheck()   { return `<svg ${A}><path d="M3 8.5l3 3 7-7"/></svg>`; }
function svgArchive() { return `<svg ${A}><rect x="2" y="3" width="12" height="3" rx="0.5"/><path d="M3 6v7h10V6M6.5 9h3"/></svg>`; }

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
