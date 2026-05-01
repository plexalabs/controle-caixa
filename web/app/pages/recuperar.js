// recuperar.js — Tela /recuperar (CP2.3, Fase 2).
// Envia link de recuperação via Supabase + Resend. Mensagem genérica
// anti-enumeration: nunca revela se o email existe ou não.

import { pedirRecuperacao } from '../auth.js';
import { validarEmail }     from '../utils.js';
import { renderLogo }       from '../../components/logo.js';

export function renderRecuperar() {
  const emailInicio = new URLSearchParams(location.search).get('email') || '';

  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen grid grid-cols-1 lg:grid-cols-12">
      <aside class="hidden lg:flex lg:col-span-7 relative bg-papel2 guilhoche overflow-hidden">
        <div class="absolute top-10 left-10 right-10 flex items-start justify-between">
          <div class="flex items-center gap-3 reveal reveal-1">
            ${renderLogo({ size: 36, cor: 'var(--c-musgo)', titulo: 'Caixa Boti' })}
            <span class="h-eyebrow" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>
          <div class="text-right reveal reveal-1">
            <p class="h-eyebrow">Caderno</p>
            <p class="h-meta text-sm tracking-wider mt-1">Auditoria diária</p>
          </div>
        </div>

        <div class="absolute inset-0 flex flex-col justify-center px-16">
          <p class="edit-number reveal reveal-2 select-none">04.</p>
          <h1 class="h-display text-6xl xl:text-7xl mt-2 reveal reveal-3" style="max-width: 640px;">
            Reescrever<br>
            <em style="font-style:italic;color:var(--c-musgo)">a sua chave</em>.
          </h1>
          <p class="text-body text-base mt-6 max-w-md reveal reveal-4">
            Senha esquecida acontece. Informe o email cadastrado e enviaremos
            um link válido por 1 hora para você definir uma nova.
          </p>
        </div>

        <div class="absolute bottom-10 left-10 right-10 flex items-end justify-between reveal reveal-5">
          <p class="h-meta text-xs">Plexalabs &middot; Sistemas internos</p>
          <p class="h-meta text-xs italic">v 1.0 &middot; ${new Date().getFullYear()}</p>
        </div>
      </aside>

      <section class="lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-papel">
        <div class="w-full max-w-sm">
          <div class="lg:hidden flex items-center gap-3 mb-8 reveal reveal-1">
            ${renderLogo({ size: 36, cor: 'var(--c-musgo)', titulo: 'Caixa Boti' })}
            <span class="h-eyebrow" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>

          <p class="h-eyebrow reveal reveal-2">Recuperação</p>
          <h2 class="h-display text-4xl mt-1 mb-2 reveal reveal-3">Esqueci a senha.</h2>
          <p class="text-body text-sm mb-8 reveal reveal-4">
            Você receberá um link por email para redefinir.
          </p>

          <div id="form-bloco" class="reveal reveal-5">
            <form id="form-recuperar" novalidate>
              <div class="field">
                <label class="field-label" for="email">Email</label>
                <input id="email" name="email" type="email" autocomplete="email"
                       required class="field-input" value="${esc(emailInicio)}"
                       placeholder="voce@plexalabs.com" />
                <span class="field-underline" aria-hidden="true"></span>
              </div>

              <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

              <button id="btn-enviar" type="submit" class="btn-primary w-full mt-2">
                Enviar link de recuperação
              </button>
            </form>
          </div>

          <!-- Tela de confirmação genérica (mostrada após submit) -->
          <div id="bloco-enviado" class="hidden reveal">
            <div class="alert alert--info">
              <p class="font-medium mb-2" style="color:var(--c-musgo-3)">Pedido recebido.</p>
              <p>Se este email tiver cadastro, você receberá um link de recuperação em alguns minutos. Verifique também a caixa de spam.</p>
            </div>
            <div class="text-center mt-6">
              <a href="/login" data-link class="btn-link">Voltar ao login</a>
            </div>
          </div>

          <p id="rodape-form" class="text-sm text-center mt-8 pt-6 border-t reveal reveal-6"
             style="border-color:var(--c-papel-3);color:var(--c-tinta-3)">
            Lembrou? <a href="/login" data-link class="btn-link">Voltar ao login</a>
          </p>
        </div>
      </section>
    </main>
  `;

  // ─── Comportamento ──────────────────────────────────────────────────
  const form    = document.querySelector('#form-recuperar');
  const btn     = document.querySelector('#btn-enviar');
  const erro    = document.querySelector('#erro-form');
  const blocoEnviado = document.querySelector('#bloco-enviado');
  const formBloco    = document.querySelector('#form-bloco');
  const rodape       = document.querySelector('#rodape-form');

  setTimeout(() => {
    if (!emailInicio) form.email.focus();
  }, 480);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.classList.add('hidden');

    const email = form.email.value.trim().toLowerCase();
    const erroEmail = validarEmail(email);
    if (erroEmail) {
      erro.textContent = erroEmail;
      erro.classList.remove('hidden');
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    // Independente do resultado, mostra a mesma mensagem genérica
    // (anti-enumeration). Apenas erros de rede/configuração disparam alert.
    const r = await pedirRecuperacao(email);

    btn.removeAttribute('aria-busy');
    btn.disabled = false;

    if (!r.ok && /sem conexão|network/i.test(r.mensagem)) {
      // Erro de rede vale mostrar — usuário precisa saber para tentar de novo.
      erro.textContent = r.mensagem;
      erro.classList.remove('hidden');
      return;
    }

    // Sucesso OU erro silencioso (rate limit, email inexistente, etc.)
    // → mensagem idêntica para impedir enumeration.
    formBloco.classList.add('hidden');
    rodape.classList.add('hidden');
    blocoEnviado.classList.remove('hidden');
  });
}


function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
