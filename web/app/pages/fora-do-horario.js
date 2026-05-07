// fora-do-horario.js — tela mostrada quando o sistema esta fechado
// pela janela operacional (6h-20h seg-sex por padrao).
//
// Editorial e quieto: numero romano grande (Fraunces italic) + linha
// horaria + verso explicativo. Sem botoes — quem esta aqui ta esperando
// horario abrir, nao tem nada pra clicar.

import { renderShell, ligarShell } from '../shell.js';
import { descricaoJanela, dentroDaJanela } from '../janela.js';
import { pegarSessao } from '../supabase.js';

export async function renderForaDoHorario() {
  const sessao = await pegarSessao();
  const desc = await descricaoJanela();

  const conteudo = `
    <main id="main" class="fdh-main">
      <article class="fdh-card reveal reveal-1">
        <p class="fdh-eyebrow">Caixa Boti · Fechado</p>
        <h1 class="fdh-titulo">
          <span class="fdh-titulo-fora">Fora do</span>
          <span class="fdh-titulo-horario">horário.</span>
        </h1>

        <div class="fdh-divisor reveal reveal-2" aria-hidden="true">
          <span class="fdh-divisor-traco"></span>
          <span class="fdh-divisor-glifo">⌖</span>
          <span class="fdh-divisor-traco"></span>
        </div>

        <p class="fdh-corpo reveal reveal-3">
          O sistema opera <strong>${desc}</strong> (horário de São Paulo).
          Volte dentro da janela pra continuar.
        </p>

        ${sessao?.user ? `
          <p class="fdh-meta reveal reveal-4">
            sessão ativa de <strong>${esc(sessao.user.email || '—')}</strong>
            <button type="button" id="fdh-sair" class="btn-link" style="margin-left:0.6rem">sair</button>
          </p>` : `
          <p class="fdh-meta reveal reveal-4">
            ninguém logado · <a href="/login" data-link class="btn-link">ir para login</a>
            (também só funciona dentro do horário)
          </p>`}

        <p class="fdh-relogio reveal reveal-5" aria-live="polite" id="fdh-relogio"></p>
      </article>
    </main>`;

  // Pode ou nao ter sessao — renderiza sem sidebar (rota fora do app)
  document.querySelector('#app').innerHTML = `
    <div class="fdh-fundo">${conteudo}</div>`;

  // Relogio decorativo
  const tick = () => {
    const el = document.querySelector('#fdh-relogio');
    if (!el) return;
    el.textContent = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long', day: '2-digit', month: 'long',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date());
  };
  tick();
  const t = setInterval(tick, 1000);
  // Para o relogio ao trocar de tela
  window.addEventListener('popstate', () => clearInterval(t), { once: true });

  // Auto-recheck a cada 30s; se voltou pra dentro, recarrega
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
