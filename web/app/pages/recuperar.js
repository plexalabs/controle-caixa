// recuperar.js — Tela /recuperar (CP2.3, Fase 2).
// Envia link de recuperação via Supabase + Resend. Mensagem genérica
// anti-enumeration: nunca revela se o email existe ou não.

import { pedirRecuperacao } from '../auth.js';
import { navegar }          from '../router.js';
import { validarEmail }     from '../utils.js';

export function renderRecuperar() {
  const params = new URLSearchParams(location.search);
  const emailInicio = params.get('email') || '';
  // Quando algum link antigo (com ?code=) chega expirado, main.js redireciona
  // pra cá com ?expirado=1. Mostra um aviso editorial em vez de só repetir
  // o formulário sem contexto.
  const expirado = params.get('expirado') === '1';

  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <main class="auth-card" aria-labelledby="auth-titulo">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <h2 id="auth-titulo" class="auth-titulo">Recuperar senha</h2>
        <p class="auth-subtitulo">
          Enviaremos um código de 8 dígitos para o email cadastrado.
        </p>

        ${expirado ? `
          <div class="alert alert--info" style="margin-bottom:18px">
            O código anterior expirou ou já foi usado. Peça um novo abaixo.
          </div>
        ` : ''}

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
              Enviar código
            </button>
          </form>
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

    // Sucesso OU erro silencioso (rate limit, email inexistente, etc.) →
    // navega para /redefinir?email=X com a mesma UX de OTP do cadastro.
    // Anti-enumeration preservada: a tela de OTP existe pra qualquer
    // email; quem digitou errado simplesmente nunca recebe código.
    navegar('/redefinir?email=' + encodeURIComponent(email));
  });
}


function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
