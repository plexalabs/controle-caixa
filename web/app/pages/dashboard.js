// dashboard.js — placeholder da Fase 2 / CP3.
// Aqui só confirma que o login funcionou. CP3 substitui inteiro.

import { sair } from '../auth.js';
import { navegar } from '../router.js';
import { pegarSessao } from '../supabase.js';

export async function renderDashboard() {
  const sessao = await pegarSessao();
  const email  = sessao?.user?.email ?? '—';

  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen p-8 lg:p-16">
      <header class="flex items-center justify-between max-w-5xl mx-auto reveal reveal-1">
        <div>
          <p class="h-eyebrow">Caixa Boti</p>
          <h1 class="h-display text-3xl mt-1">Painel</h1>
        </div>
        <button id="btn-sair" class="btn-link">Sair</button>
      </header>

      <section class="max-w-5xl mx-auto mt-16">
        <div class="alert alert--info reveal reveal-2">
          <strong>Login funcionando.</strong>
          Sessão ativa para <code>${email}</code>.
          O painel completo (caixa do dia, pendências, dashboard) será entregue no
          Checkpoint 3 da Fase 2.
        </div>

        <div class="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 reveal reveal-3">
          ${cardPlaceholder('Caixa do dia',  'CP3')}
          ${cardPlaceholder('Pendências',    'CP4')}
          ${cardPlaceholder('Configurações', 'CP4')}
        </div>
      </section>
    </main>
  `;

  document.querySelector('#btn-sair').addEventListener('click', async () => {
    await sair();
    navegar('/login');
  });
}

function cardPlaceholder(titulo, etapa) {
  return `
    <div class="border border-papel-3 p-6" style="border-color:var(--c-papel-3)">
      <p class="h-eyebrow" style="color:var(--c-ambar)">${etapa}</p>
      <h3 class="h-display text-xl mt-1" style="font-style:normal;font-weight:500">
        ${titulo}
      </h3>
      <p class="text-body text-sm mt-2">Em construção.</p>
    </div>`;
}
