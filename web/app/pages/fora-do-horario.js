// fora-do-horario.js — tela mostrada quando o sistema esta fechado
// pela janela operacional (7h-19h seg-sex por padrao).
//
// Mesmo padrao visual das telas de erro (/erros/404, lancamento nao
// encontrado): card centralizado branco com simbolo Ledo + cabec
// + titulo italic accent + texto explicativo + footer admin
// (sessao + relogio). Fundo topografico animado contínuo.

import { dentroDaJanela, pegarConfigJanela } from '../janela.js';
import { pegarSessao } from '../supabase.js';
import { iniciarTopografia } from '../topo-bg.js';

const NOMES_DIA = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb', 7: 'dom' };

// Simbolo Ledo inline (mesmo do erro-404 e sidebar — cores fixas)
const SIMBOLO_LEDO = `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">` +
  `<path fill="#2D4A2E" d="M128,40 L180,40 C180,40 210,70 210,130 C210,190 180,220 128,220 L76,220 C76,220 50,190 50,130 C50,70 80,40 128,40 Z"/>` +
  `<path fill="#E8F0E5" d="M128,40 L160,40 C160,40 175,55 175,85 C175,115 160,130 128,130 C100,130 85,115 85,85 C85,55 100,40 128,40 Z"/>` +
  `</svg>`;

export async function renderForaDoHorario() {
  const sessao = await pegarSessao();
  const cfg = await pegarConfigJanela();
  const horaIni = String(cfg.hora_ini).padStart(2, '0');
  const horaFim = String(cfg.hora_fim).padStart(2, '0');
  const dias = cfg.dias.slice().sort();
  const diasResumo = (dias.length && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1))
    ? `${NOMES_DIA[dias[0]]}–${NOMES_DIA[dias[dias.length - 1]]}`
    : dias.map(d => NOMES_DIA[d]).join(', ');
  const janelaTexto = `${horaIni}h às ${horaFim}h · ${diasResumo}`;

  document.querySelector('#app').innerHTML = `
    <main id="main" class="erro-shell" role="main">
      <canvas id="erro-topo-canvas" class="erro-topo-canvas" aria-hidden="true"></canvas>

      <article class="erro-card">
        <header class="erro-cabec">
          <span class="erro-cabec-simbolo" aria-hidden="true">${SIMBOLO_LEDO}</span>
          <div class="erro-cabec-meta">
            <span class="erro-cabec-codigo">Em pausa</span>
            <span class="erro-cabec-app">Ledo · sistema fora do horário</span>
          </div>
        </header>

        <h1 class="erro-titulo">
          Fora do horário.<br>
          <em id="fdh-tempo">Calculando reabertura…</em>
        </h1>

        <p class="erro-texto">
          O sistema opera em <strong>${esc(janelaTexto)}</strong>
          (horário de São Paulo). Lançamentos e edições ficam pausados
          fora desta janela — a página recarrega sozinha quando reabrir.
        </p>

        <footer class="erro-footer">
          ${sessao?.user ? `
            <div class="erro-footer-item">
              <span class="erro-footer-label">Sessão</span>
              <span class="erro-footer-val">${esc(sessao.user.email || '—')}</span>
              <button type="button" id="fdh-sair" class="erro-footer-btn">sair</button>
            </div>` : `
            <div class="erro-footer-item">
              <span class="erro-footer-label">Sessão</span>
              <span class="erro-footer-val"><em>ninguém logado</em></span>
              <a href="/login" data-link class="erro-footer-btn">ir para login</a>
            </div>`}
          <div class="erro-footer-item">
            <span class="erro-footer-label">Agora</span>
            <span class="erro-footer-val" id="fdh-relogio-val">—</span>
            <span class="erro-footer-pulse" aria-hidden="true"></span>
          </div>
        </footer>
      </article>
    </main>`;

  // Fundo topografico animado (mesmo padrao do /erros/404 e /login)
  const topo = iniciarTopografia(document.querySelector('#erro-topo-canvas'), {
    escala: 0.004, vel: 0.00036, niveis: 14,
  });

  const tick = () => {
    const elRelogio = document.querySelector('#fdh-relogio-val');
    const elTempo   = document.querySelector('#fdh-tempo');
    if (!elRelogio) return;
    const agora = new Date();
    elRelogio.textContent = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(agora).toLowerCase();
    if (elTempo) elTempo.textContent = textoAbertura(agora);
  };
  tick();
  const t = setInterval(tick, 1000);

  // Auto-recheck a cada 30s; se voltou pra dentro, recarrega
  const recheck = setInterval(async () => {
    if (await dentroDaJanela()) {
      clearInterval(recheck);
      clearInterval(t);
      location.replace('/dashboard');
    }
  }, 30000);

  // Cleanup ao navegar
  window.addEventListener('popstate', () => {
    topo.stop();
    clearInterval(t);
    clearInterval(recheck);
  }, { once: true });

  document.querySelector('#fdh-sair')?.addEventListener('click', async () => {
    const { supabase } = await import('../supabase.js');
    await supabase.auth.signOut();
    location.replace('/fora-do-horario');
  });
}

// Frase curta de quando o sistema reabre — vai pro <em> do titulo.
function textoAbertura(agora) {
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hora = sp.getHours();
  const dow  = sp.getDay();   // 0=dom .. 6=sab
  const ehSab = dow === 6, ehDom = dow === 0;

  if (!ehSab && !ehDom && hora < 7) {
    const min = (7 - hora - 1) * 60 + (60 - sp.getMinutes());
    return `Reabre em ${formatarDuracao(min)}, hoje às 07h.`;
  }
  if (!ehSab && !ehDom && hora >= 19) {
    const amanha = new Date(sp); amanha.setDate(sp.getDate() + 1);
    if (amanha.getDay() === 6) return 'Reabre na segunda, às 07h.';
    return 'Reabre amanhã, às 07h.';
  }
  if (ehSab) return 'Reabre na segunda, às 07h.';
  if (ehDom) return 'Reabre amanhã, às 07h.';
  return 'Verificando reabertura…';
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
