// login.js — Tela /login (rebrand 2026-05-02).
// Shell minimal centralizado (estilo Microsoft sign-in) com identidade
// editorial preservada: paleta papel/musgo/âmbar, Fraunces no título,
// filete âmbar à esquerda do card. Lógica de auth INTACTA — só HTML mudou.

import { entrarComSenha } from '../auth.js';
import { navegar }        from '../router.js';
import { validarEmail }   from '../utils.js';

export function renderLogin() {
  const params      = new URLSearchParams(location.search);
  // Preserva ?next= (CP-PRE-DEPLOY-1) e tolera o legado ?proximo=.
  // Aceita só caminhos relativos começando em "/" — bloqueia open redirect.
  const nextRaw = params.get('next') || params.get('proximo') || '';
  const proximo = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard';
  const emailInicio = params.get('email')   || '';

  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <main class="auth-card" aria-labelledby="auth-titulo">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <h2 id="auth-titulo" class="auth-titulo">Entrar</h2>
        <p class="auth-subtitulo">Use seu email e senha para acessar o caderno de auditoria.</p>

        <form id="form-login" novalidate>
          <div class="field">
            <label class="field-label" for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email"
                   required value="${emailInicio.replace(/"/g, '&quot;')}"
                   placeholder="voce@plexalabs.com"
                   class="field-input" aria-describedby="erro-form" />
            <span class="field-underline" aria-hidden="true"></span>
          </div>

          <div class="field">
            <label class="field-label" for="senha">Senha</label>
            <input id="senha" name="senha" type="password" autocomplete="current-password"
                   required minlength="8" class="field-input" />
            <span class="field-underline" aria-hidden="true"></span>
          </div>

          <div class="auth-aux">
            <a href="/recuperar" data-link>Esqueci a senha</a>
          </div>

          <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

          <button id="btn-entrar" type="submit" class="btn-primary">
            Entrar
          </button>
        </form>

        <p class="auth-rodape">
          Não tem conta? <a href="/cadastro" data-link>Criar conta</a>
        </p>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>
  `;

  // ─── Comportamento ──────────────────────────────────────────────────
  const form  = document.querySelector('#form-login');
  const btn   = document.querySelector('#btn-entrar');
  const erro  = document.querySelector('#erro-form');

  // Foca no email se vazio, na senha se já preenchido.
  setTimeout(() => {
    if (emailInicio) document.querySelector('#senha')?.focus();
    else             document.querySelector('#email')?.focus();
  }, 480);

  function mostrarErro(html) {
    erro.classList.remove('hidden');
    erro.innerHTML = html;
  }
  function limparErro() {
    erro.classList.add('hidden');
    erro.textContent = '';
  }

  form.addEventListener('input', limparErro, { once: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErro();

    const email = form.email.value.trim();
    const senha = form.senha.value;

    const erroEmail = validarEmail(email);
    if (erroEmail) return mostrarErro(erroEmail);
    if (!senha)    return mostrarErro('Informe sua senha.');

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const r = await entrarComSenha(email, senha);

    btn.removeAttribute('aria-busy');
    btn.disabled = false;

    if (!r.ok) {
      // Caso especial: email não confirmado → oferece atalho para a tela de OTP.
      if (r.mensagem === 'EMAIL_NAO_CONFIRMADO') {
        return mostrarErro(`
          Confirme seu email antes de entrar.
          <a href="/confirmar?email=${encodeURIComponent(email)}" data-link>Inserir código</a>
        `);
      }
      return mostrarErro(r.mensagem);
    }

    // Sessão criada — vai para a rota seguinte (default /dashboard).
    navegar(proximo);
  });
}

