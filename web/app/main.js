// main.js — ponto de entrada da aplicação Web.
// Despacha a rota inicial e ouve mudanças de sessão do Supabase
// para reagir a logouts vindos de outra aba ou expiração de token.

// CSS — Vite resolve a ordem: Tailwind (base/components/utilities) primeiro,
// depois nossos tokens (variáveis), depois components (classes editoriais)
// que sobrepoem ou complementam o Tailwind.
import '../styles/tailwind.css';
import '../styles/tokens.css';
import '../styles/components.css';

import { despachar }         from './router.js';
import { supabase }          from './supabase.js';
import { mostrarToast }      from './notifications.js';

async function iniciar() {
  // Mensagem amigável caso o navegador não suporte ESM (improvável, mas registrada).
  if (!('noModule' in HTMLScriptElement.prototype)) {
    document.querySelector('#app').textContent =
      'Seu navegador não suporta este aplicativo. Use Chrome, Firefox ou Edge atualizado.';
    return;
  }

  // Despacha rota inicial conforme location atual.
  await despachar();

  // Ouve mudanças de auth — útil para deslogar em todas as abas, refresh token, etc.
  supabase.auth.onAuthStateChange((evento, _sessao) => {
    if (evento === 'SIGNED_OUT')      mostrarToast('Sessão encerrada.', 'info', 2200);
    if (evento === 'TOKEN_REFRESHED') console.debug('[auth] token renovado');
  });
}

iniciar().catch((e) => {
  console.error('[main] falha ao iniciar:', e);
  document.querySelector('#app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-8 text-center">
      <div>
        <p class="h-eyebrow" style="color:var(--c-alerta)">Erro de inicialização</p>
        <h1 class="h-display text-4xl mt-2 mb-4">Não foi possível carregar.</h1>
        <p class="text-body text-sm">${(e && e.message) || 'Erro desconhecido.'}</p>
        <button onclick="location.reload()" class="btn-link mt-6">Recarregar</button>
      </div>
    </div>`;
});
