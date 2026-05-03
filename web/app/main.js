// main.js — ponto de entrada da aplicação Web.
// Despacha a rota inicial e ouve mudanças de sessão do Supabase
// para reagir a logouts vindos de outra aba ou expiração de token.

// CSS — Vite resolve a ordem: Tailwind (base/components/utilities) primeiro,
// depois nossos tokens (variáveis), depois components (classes editoriais)
// que sobrepoem ou complementam o Tailwind.
import '../styles/tailwind.css';
import '../styles/tokens.css';
import '../styles/components.css';
import '../styles/auth.css';

import * as Sentry              from '@sentry/browser';
import { despachar }            from './router.js';
import { supabase, pegarSessao } from './supabase.js';
import { mostrarToast }         from './notifications.js';
import { prepararAuthStorage }  from './auth-storage.js';
import { pegarPapeis }          from './papeis.js';

// Sentry: só ativo em PROD com DSN definido. Dev fica silencioso pra
// não poluir o dashboard com ruído de desenvolvimento. Operador deve
// configurar VITE_SENTRY_DSN no .env.production antes do deploy
// (ver docs/INFRA.md).
if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: 'production',
    tracesSampleRate: 0.1,  // 10% das transações
    integrations: [],
    // Sistema interno (operadores autenticados) — IP e user-agent ajudam
    // o debug. Configuração recomendada pelo painel do Sentry pra apps
    // próprios da empresa.
    sendDefaultPii: true,
    // Higiene mesmo com PII ativo: nunca enviar tokens de auth em URLs.
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = event.request.url
          .replace(/[?&](token|access_token|refresh_token|code)=[^&]+/g, '$1=REDACTED');
      }
      return event;
    },
  });
}

const ROTAS_ABERTAS = ['/login', '/cadastro', '/recuperar', '/redefinir', '/confirmar'];

async function iniciar() {
  // Mensagem amigável caso o navegador não suporte ESM (improvável, mas registrada).
  if (!('noModule' in HTMLScriptElement.prototype)) {
    document.querySelector('#app').textContent =
      'Seu navegador não suporta este aplicativo. Use Chrome, Firefox ou Edge atualizado.';
    return;
  }

  // 1. Pré-carrega o storage da sessão (IndexedDB → cache em memória).
  //    Sem isso, getSession() abaixo retorna null mesmo com sessão válida
  //    persistida e o operador é jogado pra /login a cada F5.
  await prepararAuthStorage();

  // 1b. Defesa contra link de recovery antigo: o flow PKCE manda o usuário
  //     pra Site URL com ?error=access_denied&error_code=otp_expired quando
  //     o code já foi consumido (Resend tracking, Gmail SafeLinks, etc.).
  //     A partir do F3-FIX-REDEFINIR-SENHA usamos OTP-code, mas links
  //     antigos no inbox do operador ainda chegam aqui. Limpa a URL e
  //     manda pra /recuperar com aviso editorial.
  {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('error') && qs.get('error_code') === 'otp_expired') {
      window.history.replaceState({}, '', '/recuperar?expirado=1');
    }
  }

  // 2. Aguarda Supabase reidratar a sessão (lê do adapter já populado).
  const sessao = await pegarSessao();

  // 3. Se logado: pré-carrega papéis (evita 403 momentâneo em telas admin).
  //    Se não-logado e a rota é fechada, prepara o ?next= preservando a
  //    intenção original do operador (volta pra cá após login).
  if (sessao) {
    await pegarPapeis().catch(() => { /* cache opcional, não bloqueia */ });
  } else {
    const rotaAtual = window.location.pathname + window.location.search;
    const ehAberta = ROTAS_ABERTAS.some(p => window.location.pathname === p);
    if (!ehAberta && rotaAtual !== '/') {
      window.history.replaceState({}, '', `/login?next=${encodeURIComponent(rotaAtual)}`);
    }
  }

  // 4. Despacha rota com sessão já resolvida.
  await despachar();

  // Ouve mudanças de auth — útil para deslogar em todas as abas, refresh token, etc.
  supabase.auth.onAuthStateChange((evento, _sessao) => {
    if (evento === 'SIGNED_OUT')      mostrarToast('Sessão encerrada.', 'info', 2200);
    if (evento === 'TOKEN_REFRESHED') console.debug('[auth] token renovado');
  });
}

iniciar().catch(async (e) => {
  // Boot falhou — Sentry pode não estar inicializado ainda; usar import
  // dinâmico evita ciclo de import e garante que o catch sempre roda.
  try {
    const { log } = await import('./log.js');
    log.erro('falha ao iniciar app', e);
  } catch { console.error('[main] falha ao iniciar:', e); }
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
