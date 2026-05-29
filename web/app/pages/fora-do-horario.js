// fora-do-horario.js — tela mostrada quando o sistema esta fechado
// pela janela operacional (7h-19h seg-sex por padrao).
//
// Visual quieto e simples: card branco centralizado, texto curto e
// direto, relogio + status de reabertura. Sem efeitos pesados.

import { dentroDaJanela, pegarConfigJanela } from '../janela.js';
import { pegarSessao } from '../supabase.js';
import { iniciarTopografia } from '../topo-bg.js';

const NOMES_DIA = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb', 7: 'dom' };

export async function renderForaDoHorario() {
  const sessao = await pegarSessao();
  const cfg = await pegarConfigJanela();
  const horaIni = String(cfg.hora_ini).padStart(2, '0');
  const horaFim = String(cfg.hora_fim).padStart(2, '0');
  // Resumo de dias: range continuo "seg-sex" OU lista "seg, qua, sex"
  const dias = cfg.dias.slice().sort();
  const diasResumo = (dias.length && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1))
    ? `${NOMES_DIA[dias[0]]} → ${NOMES_DIA[dias[dias.length - 1]]}`
    : dias.map(d => NOMES_DIA[d]).join(', ');

  const conteudo = `
    <main id="main" class="fdh-main">
      <article class="fdh-card">
        <!-- ZONA 1: STATUS — quem somos e estado atual -->
        <header class="fdh-cabec">
          <p class="fdh-eyebrow">
            <span class="fdh-eyebrow-dot" aria-hidden="true"></span>
            <span>Ledo</span>
          </p>
          <h1 class="fdh-titulo">
            <span class="fdh-titulo-fora">Fora do </span><span class="fdh-titulo-horario">horário.</span>
          </h1>
        </header>

        <!-- ZONA 2: HERO — o que o operador PRECISA saber agora:
             quando volta a funcionar. Eyebrow + relogio-grande + meta. -->
        <section class="fdh-hero" aria-label="Próxima abertura">
          <p class="fdh-hero-label">Reabre</p>
          <p class="fdh-hero-tempo" id="fdh-hero-tempo">—</p>
          <p class="fdh-hero-meta"   id="fdh-hero-meta">calculando…</p>
        </section>

        <!-- ZONA 3: CONTEXTO — qual e a janela operacional -->
        <section class="fdh-janela" aria-label="Janela operacional">
          <p class="fdh-janela-label">Janela operacional</p>
          <div class="fdh-janela-horas">
            <span class="fdh-janela-num">${horaIni}<small>h</small></span>
            <span class="fdh-janela-seta" aria-hidden="true">→</span>
            <span class="fdh-janela-num">${horaFim}<small>h</small></span>
          </div>
          <p class="fdh-janela-dias">${esc(diasResumo)} · horário de São Paulo</p>
        </section>

        <!-- ZONA 4: EXPLICACAO — por que existe esse bloqueio -->
        <p class="fdh-corpo">
          Lançamentos e edições ficam pausados fora desta janela.
          A página recarrega sozinha quando reabrir.
        </p>

        <!-- ZONA 5: FOOTER — info administrativa/diagnostica -->
        <footer class="fdh-footer">
          ${sessao?.user ? `
            <div class="fdh-footer-item">
              <span class="fdh-footer-label">Sessão</span>
              <span class="fdh-footer-val">${esc(sessao.user.email || '—')}</span>
              <button type="button" id="fdh-sair" class="fdh-footer-btn">sair</button>
            </div>` : `
            <div class="fdh-footer-item">
              <span class="fdh-footer-label">Sessão</span>
              <span class="fdh-footer-val"><em>ninguém logado</em></span>
              <a href="/login" data-link class="fdh-footer-btn">ir para login</a>
            </div>`}
          <div class="fdh-footer-item">
            <span class="fdh-footer-label">Agora</span>
            <span class="fdh-footer-val" id="fdh-relogio-val">—</span>
            <span class="fdh-footer-pulse" aria-hidden="true"></span>
          </div>
        </footer>
      </article>
    </main>`;

  document.querySelector('#app').innerHTML = `
    <div class="fdh-fundo">
      <canvas id="fdh-topo-canvas" class="fdh-topo-canvas" aria-hidden="true"></canvas>
      ${conteudo}
    </div>`;

  // Background topografico animado — configs do gosto do operador:
  // escala 0.004 (ondas amplas), velocidade 0.00036 (45% do max,
  // movimento lento e contemplativo), niveis 14 (denso).
  const topo = iniciarTopografia(document.querySelector('#fdh-topo-canvas'), {
    escala: 0.004,
    vel:    0.00036,
    niveis: 14,
  });
  window.addEventListener('popstate', () => topo.stop(), { once: true });

  const tick = () => {
    const relogio  = document.querySelector('#fdh-relogio-val');
    const heroTempo = document.querySelector('#fdh-hero-tempo');
    const heroMeta  = document.querySelector('#fdh-hero-meta');
    if (!relogio) return;
    const agora = new Date();
    // Relogio do footer — formato curto pra economizar espaco
    relogio.textContent = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(agora).toLowerCase();
    // HERO — "10h59" (tempo restante) + "amanhã às 07h" (meta)
    if (heroTempo && heroMeta) {
      const info = infoAbertura(agora);
      heroTempo.textContent = info.principal;
      heroMeta.textContent  = info.secundario;
    }
  };
  tick();
  const t = setInterval(tick, 1000);
  window.addEventListener('popstate', () => clearInterval(t), { once: true });

  const recheck = setInterval(async () => {
    if (await dentroDaJanela()) {
      clearInterval(recheck);
      clearInterval(t);
      location.replace('/dashboard');
    }
  }, 30000);

  document.querySelector('#fdh-sair')?.addEventListener('click', async () => {
    const { supabase } = await import('../supabase.js');
    await supabase.auth.signOut();
    location.replace('/fora-do-horario');
  });
}

// Info de proxima abertura — { principal, secundario }
//   principal:  destaque, ex: "10h59" ou "amanhã"
//   secundario: contexto, ex: "hoje às 07h" ou "segunda às 07h"
function infoAbertura(agora) {
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hora = sp.getHours();
  const dow  = sp.getDay();   // 0=dom .. 6=sab
  const ehSab = dow === 6, ehDom = dow === 0;

  if (!ehSab && !ehDom && hora < 7) {
    const min = (7 - hora - 1) * 60 + (60 - sp.getMinutes());
    return { principal: `em ${formatarDuracao(min)}`, secundario: 'hoje às 07h' };
  }
  if (!ehSab && !ehDom && hora >= 19) {
    const amanha = new Date(sp); amanha.setDate(sp.getDate() + 1);
    if (amanha.getDay() === 6) return { principal: 'segunda', secundario: 'às 07h' };
    return { principal: 'amanhã', secundario: 'às 07h' };
  }
  if (ehSab) return { principal: 'segunda', secundario: 'às 07h' };
  if (ehDom) return { principal: 'amanhã', secundario: 'às 07h' };
  return { principal: 'em breve', secundario: 'verificando…' };
}

function formatarDuracao(totalMin) {
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
