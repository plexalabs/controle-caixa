// recuperar.js — Tela /recuperar (CP2.3, Fase 2).
// Envia link de recuperação via Supabase + Resend. Mensagem genérica
// anti-enumeration: nunca revela se o email existe ou não.

import { pedirRecuperacao } from '../auth.js';
import { validarEmail }     from '../utils.js';

export function renderRecuperar() {
  const emailInicio = new URLSearchParams(location.search).get('email') || '';

  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <header class="auth-marca">
        <span class="auth-marca-simbolo" aria-hidden="true"></span>
        <h1 class="auth-marca-wordmark">Caixa Boti</h1>
      </header>

      <main class="auth-card" aria-labelledby="auth-titulo">
        <h2 id="auth-titulo" class="auth-titulo">Recuperar senha</h2>
        <p class="auth-subtitulo">
          Enviaremos um link válido por 1 hora para o email cadastrado.
        </p>

        <div id="form-bloco">
          <form id="form-recuperar" novalidate>
            <div class="field">
              <label class="field-label" for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email"
                     required class="field-input" value="${esc(emailInicio)}"
                     placeholder="voce@plexalabs.com" />
              <span class="field-underline" aria-hidden="true"></span>
            </div>

            <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

            <button id="btn-enviar" type="submit" class="btn-primary">
              Enviar link
            </button>
          </form>
        </div>

        <!-- Tela de confirmação genérica (mostrada após submit) -->
        <div id="bloco-enviado" class="hidden auth-bloco-enviado">
          <div class="alert alert--info">
            <p class="font-medium mb-2" style="color:var(--c-musgo-3)">Pedido recebido.</p>
            <p>Se este email tiver cadastro, você receberá um link de recuperação em alguns minutos. Verifique também a caixa de spam.</p>
          </div>
          <a href="/login" data-link class="btn-link">Voltar ao login</a>
        </div>

        <p id="rodape-form" class="auth-rodape">
          Lembrou? <a href="/login" data-link>Voltar ao login</a>
        </p>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>
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
