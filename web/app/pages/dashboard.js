// dashboard.js — Tela /dashboard (CP3.1, Fase 2).
// Saudação por hora, 4 cards de resumo, notificações realtime, pendências
// críticas, botão grande para o caixa do dia.

import { supabase, pegarSessao } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { saudacaoPorHora, dataLonga, isoData, LABEL_CATEGORIA, CATEGORIAS } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';

let canalNotif = null;

export async function renderDashboard() {
  // Limpa subscriptions de visualizações anteriores (se houver).
  desmontar();

  const sessao = await pegarSessao();
  const meta   = sessao?.user?.user_metadata ?? {};
  const nome   = (meta.nome || sessao?.user?.email?.split('@')[0] || 'Operador').trim();
  const hoje   = new Date();
  const hojeISO = isoData(hoje);

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'dashboard',
    conteudo: `
    <main id="main" class="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <!-- Saudação editorial -->
      <div class="reveal reveal-1">
        <p class="saudacao-data">${dataLonga(hoje)}</p>
        <h1 class="saudacao-titulo">${saudacaoPorHora(hoje)}, <strong>${esc(nome)}</strong>.</h1>
      </div>

      <!-- Cards de resumo (skeleton até carregar) -->
      <section class="stat-grid mt-10 reveal reveal-2" aria-label="Resumo do dia">
        ${cardSkel()}${cardSkel()}${cardSkel()}${cardSkel()}
      </section>
      <div id="stat-cards" class="hidden"></div>

      <!-- Linha de ação: botão principal + atalhos -->
      <section class="mt-8 flex flex-wrap items-center gap-4 reveal reveal-3">
        <a href="/caixa/hoje" data-link class="btn-primary" style="padding:1rem 1.75rem;font-size:1rem">
          Abrir caixa de hoje
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M3 9 H15 M11 5 L15 9 L11 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <a href="/pendencias" data-link class="btn-link">Ver pendências</a>
      </section>

      <!-- Linha 1: dois quadros lado a lado — Avisos + Por categoria -->
      <div class="dash-grid mt-12 reveal reveal-4">
        <!-- Quadro: Avisos (5 últimos + ver todos) -->
        <article id="bloco-avisos" class="dash-quadro" aria-labelledby="h-notif">
          <header class="dash-quadro-cabec">
            <div>
              <p class="h-eyebrow">Atenção</p>
              <h2 id="h-notif" class="dash-quadro-titulo">Avisos</h2>
            </div>
            <span id="contagem-notif" class="dash-quadro-meta"></span>
          </header>
          <div id="lista-notif" class="dash-quadro-corpo">
            ${blocoSkel()}
          </div>
          <footer class="dash-quadro-rodape">
            <a href="/notificacoes" data-link class="dash-quadro-cta">
              Ver todos os avisos
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                <path d="M1 5 H12 M8 1 L12 5 L8 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </footer>
        </article>

        <!-- Quadro: Distribuição por categoria -->
        <article id="bloco-distribuicao" class="dash-quadro" aria-labelledby="h-dist">
          <header class="dash-quadro-cabec">
            <div>
              <p class="h-eyebrow">Distribuição</p>
              <h2 id="h-dist" class="dash-quadro-titulo">Por categoria</h2>
            </div>
            <span id="dist-mes-rotulo" class="dash-quadro-meta"></span>
          </header>
          <div id="dist-conteudo" class="dash-quadro-corpo">
            <div class="skel" style="height:8rem"></div>
          </div>
        </article>
      </div>

      <!-- Pendências críticas (>3 dias úteis) — só renderiza se houver -->
      <section id="bloco-criticas" class="mt-8 hidden reveal reveal-5" aria-labelledby="h-crit">
        <header class="flex items-baseline justify-between mb-4">
          <h2 id="h-crit" class="h-display text-2xl" style="font-style:normal;font-weight:500">
            Pendências críticas
          </h2>
          <a href="/pendencias" data-link class="btn-link">Ver todas</a>
        </header>
        <div id="lista-criticas" class="space-y-2"></div>
      </section>

      <!-- Linha 2: Movimento 30 dias (largura inteira) -->
      <article id="bloco-movimento" class="dash-quadro dash-quadro--full mt-8 reveal reveal-6" aria-labelledby="h-mov">
        <header class="dash-quadro-cabec">
          <div>
            <p class="h-eyebrow">Movimento</p>
            <h2 id="h-mov" class="dash-quadro-titulo">Últimos 30 dias</h2>
          </div>
          <span id="mov-resumo" class="dash-quadro-meta"></span>
        </header>
        <div id="mov-conteudo" class="dash-quadro-corpo">
          <div class="skel" style="height:6rem"></div>
        </div>
      </article>
    </main>
  `,
  });

  ligarShell();
  await carregarResumo(hojeISO);
  await carregarNotificacoes();
  await carregarCriticas();
  await carregarDistribuicaoCategoria();
  await carregarMovimento30d();
  ligarRealtime();
}

// ─── CP6.4: Distribuição por categoria (mês corrente, fallback mês anterior) ──
async function carregarDistribuicaoCategoria() {
  const cont = document.querySelector('#dist-conteudo');
  const lblMes = document.querySelector('#dist-mes-rotulo');
  if (!cont) return;

  const hoje = new Date();
  const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

  // Tenta mês atual; se vazio, usa mês anterior pra exibir algo.
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
    const sufixo = mesUsado.getMonth() === inicioMesAtual.getMonth() ? '' : ' (fallback)';
    lblMes.textContent = fmtMes.format(mesUsado) + sufixo;
  }

  if (error) {
    cont.innerHTML = `<p class="alert">Não foi possível carregar a distribuição.</p>`;
    return;
  }

  // Lista completa de categorias a exibir: 6 canônicas + "em análise"
  // (lançamentos sem categoria definida). Categorias zeradas aparecem
  // com 0% pra dar comparação visual completa em qualquer mês.
  const TODAS = [
    ...CATEGORIAS,
    { valor: 'em_analise', rotulo: 'Em análise' },
  ];

  // Mapa categoria → totais retornados pela RPC. Categorias ausentes ficam zeradas.
  const porCat = Object.fromEntries((data || []).map(r => [r.categoria, r]));
  const linhas = TODAS.map(c => ({
    categoria: c.valor,
    rotulo:    c.rotulo,
    total_valor:        Number(porCat[c.valor]?.total_valor ?? 0),
    total_lancamentos:  Number(porCat[c.valor]?.total_lancamentos ?? 0),
  }));

  const totalGeral = linhas.reduce((s, r) => s + r.total_valor, 0);

  if (totalGeral === 0) {
    cont.innerHTML = `
      <div class="dash-quadro-vazio">
        <p class="dash-quadro-vazio-titulo">Sem distribuição neste mês ainda.</p>
        <p class="dash-quadro-vazio-desc">Categorize lançamentos para ver a divisão.</p>
      </div>`;
    return;
  }

  cont.innerHTML = `
    <div class="chart-dist">
      ${linhas.map((r, i) => {
        const pct = (r.total_valor / totalGeral) * 100;
        const ehZero = r.total_valor === 0;
        return `
          <div class="chart-dist-linha" data-zero="${ehZero}" style="animation-delay:${i * 60}ms">
            <span class="chart-dist-rotulo">${esc(r.rotulo)}</span>
            <div class="chart-dist-trilha" aria-label="${pct.toFixed(1)} por cento">
              <span class="chart-dist-barra" data-cat="${esc(r.categoria)}"
                    style="--alvo:${pct.toFixed(2)}%"></span>
            </div>
            <span class="chart-dist-meta">
              <span class="chart-dist-pct">${pct.toFixed(0)}%</span>
              <span class="chart-dist-valor">${formatBRL(r.total_valor)}</span>
            </span>
          </div>`;
      }).join('')}
    </div>`;

  // Trigger anim
  requestAnimationFrame(() => {
    cont.querySelectorAll('.chart-dist-barra').forEach(el => el.classList.add('is-animado'));
  });
}

// ─── CP6.4: Movimento dos últimos 30 dias ──────────────────────────────
async function carregarMovimento30d() {
  const cont = document.querySelector('#mov-conteudo');
  const resumo = document.querySelector('#mov-resumo');
  if (!cont) return;

  const { data, error } = await supabase.rpc('serie_diaria_caixa', { p_dias_atras: 30 });
  if (error) {
    cont.innerHTML = `<p class="alert">Não foi possível carregar o movimento.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    cont.innerHTML = `
      <div class="vazio" style="padding:2rem 1.5rem">
        <p class="vazio-titulo" style="font-size:1.05rem">Sem caixas registrados nos últimos 30 dias.</p>
      </div>`;
    return;
  }

  // Garante range completo de 30 dias (preenche dias faltantes com null)
  const hoje = new Date();
  const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 29);
  const dataIndex = Object.fromEntries(data.map(r => [r.data, r]));
  const dias = [];
  for (let d = new Date(inicio); d <= hoje; d.setDate(d.getDate() + 1)) {
    const iso = isoData(new Date(d));
    dias.push(dataIndex[iso] || { data: iso, total_valor: 0, total_lancamentos: 0, estado: null });
  }

  const valores = dias.map(d => Number(d.total_valor || 0));
  const maxValor = Math.max(...valores, 1);
  const totalPeriodo = valores.reduce((s, v) => s + v, 0);
  const totalLanc = dias.reduce((s, d) => s + Number(d.total_lancamentos || 0), 0);

  if (resumo) {
    resumo.textContent = `${formatBRL(totalPeriodo)} · ${totalLanc} ${totalLanc === 1 ? 'lançamento' : 'lançamentos'}`;
  }

  cont.innerHTML = `
    <div class="chart-mov">
      <div class="chart-mov-barras" role="list" aria-label="Movimento diário">
        ${dias.map((d, i) => {
          const v = Number(d.total_valor || 0);
          const altura = maxValor > 0 ? Math.round((v / maxValor) * 100) : 0;
          const dt = new Date(d.data + 'T00:00:00');
          const ehHoje = d.data === isoData(new Date());
          const fim = dt.getDay() === 0 || dt.getDay() === 6;
          const titulo = `${dataLonga(d.data)} — ${formatBRL(v)} · ${d.total_lancamentos} ${d.total_lancamentos === 1 ? 'lançamento' : 'lançamentos'}${d.estado ? ' (' + d.estado + ')' : ' (sem caixa)'}`;
          return `
            <a class="chart-mov-coluna" data-link
               role="listitem"
               href="/caixa/${esc(d.data)}"
               title="${esc(titulo)}"
               data-fim="${fim}"
               data-hoje="${ehHoje}"
               data-vazio="${v === 0}"
               style="animation-delay:${i * 18}ms">
              <span class="chart-mov-barra" style="--alvo:${altura}%"></span>
              <span class="chart-mov-rot">${dt.getDate()}</span>
            </a>`;
        }).join('')}
      </div>
      <div class="chart-mov-base" aria-hidden="true"></div>
      <div class="chart-mov-eixo">${esc(rotuloEixoMov(dias))}</div>
    </div>`;

  requestAnimationFrame(() => {
    cont.querySelectorAll('.chart-mov-barra').forEach(el => el.classList.add('is-animado'));
  });
}

// Eixo: se o intervalo cai num único mês, mostra "abril 2026". Se atravessa
// dois meses, mostra "abril → maio 2026" (ou anos diferentes se aplicável).
function rotuloEixoMov(dias) {
  if (!dias.length) return '';
  const fmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const ini = new Date(dias[0].data + 'T00:00:00');
  const fim = new Date(dias[dias.length - 1].data + 'T00:00:00');
  const labIni = fmt.format(ini);
  const labFim = fmt.format(fim);
  return labIni === labFim ? labIni : `${labIni}  →  ${labFim}`;
}

// ─── Cards de resumo via dashboard_resumo + queries auxiliares ────────────
async function carregarResumo(hojeISO) {
  // RPC dashboard_resumo já cobre os 30 últimos dias por padrão.
  // Para os cards de hoje + ontem, fazemos queries adicionais leves.
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = isoData(ontem);

  // Hoje: total de lançamentos válidos + valor.
  const { data: caixaHoje } = await supabase
    .from('caixa')
    .select('id, total_lancamentos, total_valor, total_pendentes, estado')
    .eq('data', hojeISO)
    .maybeSingle();

  // Ontem: status do caixa.
  const { data: caixaOntem } = await supabase
    .from('caixa')
    .select('id, estado, data')
    .eq('data', ontemISO)
    .maybeSingle();

  // Resolvidas hoje — count de lançamentos com resolvido_em entre hoje 00h e agora.
  const { count: resolvidasHoje } = await supabase
    .from('lancamento')
    .select('id', { count: 'exact', head: true })
    .gte('resolvido_em', hojeISO + 'T00:00:00')
    .lt('resolvido_em',  hojeISO + 'T23:59:59');

  const cards = [
    cardEstat({
      eyebrow: 'Lançamentos hoje',
      numero:  caixaHoje?.total_lancamentos ?? 0,
      sub:     formatBRL(caixaHoje?.total_valor ?? 0),
      href:    '/caixa/hoje',
    }),
    cardEstat({
      eyebrow: 'Pendentes',
      numero:  caixaHoje?.total_pendentes ?? 0,
      sub:     (caixaHoje?.total_pendentes ?? 0) > 0 ? 'aguardando ação' : 'tudo resolvido',
      href:    '/pendencias',
      tom:     (caixaHoje?.total_pendentes ?? 0) > 0 ? 'is-warn' : 'is-good',
    }),
    cardEstat({
      eyebrow: 'Caixa de ontem',
      numero:  caixaOntem?.estado === 'fechado' ? '✓' : '○',
      sub:     caixaOntem
        ? (caixaOntem.estado === 'fechado' ? 'fechado' : 'em aberto')
        : 'sem registro',
      href:    caixaOntem ? `/caixa/${caixaOntem.data}` : '/caixa/hoje',
      tom:     caixaOntem?.estado === 'fechado' ? 'is-good' : 'is-warn',
    }),
    cardEstat({
      eyebrow: 'Resolvidas hoje',
      numero:  resolvidasHoje ?? 0,
      sub:     'pendências fechadas',
      href:    '/pendencias',
      tom:     'is-good',
    }),
  ].join('');

  // Substitui skeleton pelos cards reais.
  const grid = document.querySelector('section.stat-grid');
  if (grid) grid.innerHTML = cards;
}

function cardEstat({ eyebrow, numero, sub, href, tom = '' }) {
  return `
    <a href="${href}" data-link class="stat-card" aria-label="${esc(eyebrow)}: ${esc(String(numero))} — ${esc(sub)}">
      <span class="stat-card-eyebrow">${esc(eyebrow)}</span>
      <span class="stat-card-num ${tom}">${esc(String(numero))}</span>
      <span class="stat-card-sub">${esc(sub)}</span>
    </a>`;
}

function cardSkel() {
  return `
    <div class="stat-card" aria-hidden="true" style="cursor:default;pointer-events:none">
      <span class="skel" style="display:block;height:0.7rem;width:7rem"></span>
      <span class="skel" style="display:block;height:2.4rem;width:5rem;margin-top:0.7rem"></span>
      <span class="skel" style="display:block;height:0.85rem;width:9rem;margin-top:0.5rem"></span>
    </div>`;
}
function blocoSkel() {
  return `
    <div class="skel" style="height:3.2rem;border-radius:2px"></div>
    <div class="skel" style="height:3.2rem;border-radius:2px"></div>
    <div class="skel" style="height:3.2rem;border-radius:2px"></div>`;
}

// ─── Notificações ativas (não-lidas) — quadro do dashboard ──────────────
// Mostra os 5 mais recentes; conta o total real (até 100) pra exibir
// "5 de N" no meta-rotulo. "Ver todos os avisos" leva pra /notificacoes.
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
    .limit(3);

  const lista = document.querySelector('#lista-notif');
  const cont  = document.querySelector('#contagem-notif');
  if (!lista) return;

  if (error) {
    lista.innerHTML = `<p class="text-sm" style="color:var(--c-tinta-3);padding:0.5rem 0">
      Não conseguimos carregar os avisos agora.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    lista.innerHTML = `
      <div class="dash-quadro-vazio">
        <p class="dash-quadro-vazio-titulo">Sem avisos no momento.</p>
        <p class="dash-quadro-vazio-desc">Quando algo precisar de atenção, aparece aqui.</p>
      </div>`;
    if (cont) cont.textContent = '';
    return;
  }

  if (cont) {
    const total = count ?? data.length;
    cont.textContent = total > 3
      ? `mostrando 3 de ${total}`
      : `${total} aviso${total > 1 ? 's' : ''}`;
  }
  lista.innerHTML = data.map(n => itemNotif(n)).join('');

  // Click → marca como lida + navega.
  lista.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', () => marcarENavegar(el.dataset.notifId, el.dataset.alvo));
  });
}

function itemNotif(n) {
  const tom = n.severidade === 'urgente' ? 'urgente'
           : n.severidade === 'aviso'   ? 'aviso'
           : 'info';

  let alvo = '/dashboard';
  if (n.caixa_id) alvo = `/caixa/${n.caixa_id}`;
  return `
    <button data-notif-id="${esc(n.id)}" data-alvo="${esc(alvo)}"
            class="dash-aviso" data-tom="${tom}">
      <div class="dash-aviso-cabec">
        <strong class="dash-aviso-titulo">${esc(n.titulo)}</strong>
        <time class="dash-aviso-tempo">${tempoRelativo(n.criada_em)}</time>
      </div>
      <p class="dash-aviso-msg">${esc(n.mensagem)}</p>
    </button>`;
}

async function marcarENavegar(id, alvo) {
  // Marca lida em background, sem aguardar — UX prioriza navegação.
  supabase.from('notificacao').update({ lida_em: new Date().toISOString() }).eq('id', id);
  navegar(alvo || '/dashboard');
}

function tempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'agora há pouco';
  if (min < 60)  return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

// ─── Pendências críticas (>3 dias úteis) ──────────────────────────────────
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
    <a href="/caixa/${p.data_caixa}" data-link
       style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem;
              background:var(--c-papel);border:1px solid var(--c-papel-3);
              border-left:3px solid var(--c-alerta);padding:0.85rem 1rem;
              text-decoration:none;color:inherit;font-family:'Manrope',sans-serif;
              transition:border-color 180ms">
      <div>
        <strong style="color:var(--c-tinta);font-size:0.95rem">NF ${esc(p.numero_nf)}</strong>
        <span style="color:var(--c-tinta-3);margin:0 0.5rem">·</span>
        <span style="color:var(--c-tinta-2)">${esc(p.cliente_nome)}</span>
      </div>
      <div style="text-align:right">
        <span class="h-meta" style="color:var(--c-alerta);font-size:0.85rem">
          ${p.idade_dias_uteis} dias úteis
        </span>
        <div style="font-family:'Fraunces',serif;font-variant-numeric:tabular-nums;
                    color:var(--c-tinta);font-size:1.05rem">${formatBRL(p.valor_nf)}</div>
      </div>
    </a>
  `).join('');
}

// ─── Realtime: atualiza lista de notif ao chegar nova ─────────────────────
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
