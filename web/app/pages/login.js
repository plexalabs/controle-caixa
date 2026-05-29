// login.js — Tela /login (refator visual v2 "Clean Profissional").
// Card único centralizado, tokens --ui-*, Manrope. Lógica de auth
// INTACTA — só o HTML e o visual mudaram. Campo de senha com botão
// mostrar/ocultar.

import { entrarComSenha } from '../auth.js';
import { navegar }        from '../router.js';
import { validarEmail }   from '../utils.js';
import { iniciarTopografia } from '../topo-bg.js';

const ICON_OLHO = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.6-4.6 7-4.6S15 8 15 8s-2.6 4.6-7 4.6S1 8 1 8Z"/><circle cx="8" cy="8" r="2.1"/></svg>`;
const ICON_OLHO_OFF = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.6-4.6 7-4.6S15 8 15 8s-2.6 4.6-7 4.6S1 8 1 8Z"/><circle cx="8" cy="8" r="2.1"/><path d="M2.4 2.4l11.2 11.2"/></svg>`;

export function renderLogin() {
  const params  = new URLSearchParams(location.search);
  // Preserva ?next= (e tolera o legado ?proximo=). Só caminhos relativos
  // começando em "/" — bloqueia open redirect.
  const nextRaw = params.get('next') || params.get('proximo') || '';
  const proximo = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard';
  const emailInicio = params.get('email') || '';

  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <canvas id="auth-topo-canvas" class="auth-topo-canvas" aria-hidden="true"></canvas>
      <main class="auth-card" aria-labelledby="auth-titulo">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <span class="auth-marca-wordmark">Ledo</span>
        </header>

        <div class="auth-cabec">
          <p class="auth-eyebrow">Acesso</p>
          <h1 id="auth-titulo" class="auth-titulo">Entrar</h1>
          <p class="auth-subtitulo">Use seu email e senha para acessar o caderno de auditoria.</p>
        </div>

        <form id="form-login" novalidate>
          <div class="field">
            <label class="field-label" for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email"
                   required value="${emailInicio.replace(/"/g, '&quot;')}"
                   placeholder="voce@plexalabs.com"
                   class="field-input" aria-describedby="erro-form" />
          </div>

          <div class="field">
            <label class="field-label" for="senha">Senha</label>
            <div class="auth-senha">
              <input id="senha" name="senha" type="password" autocomplete="current-password"
                     required minlength="8" class="field-input" />
              <button type="button" class="auth-senha-olho" data-alvo="senha"
                      aria-label="Mostrar senha">${ICON_OLHO}</button>
            </div>
          </div>

          <div class="auth-aux">
            <a href="/recuperar" data-link>Esqueci a senha</a>
          </div>

          <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

          <button id="btn-entrar" type="submit" class="btn-primary">Entrar</button>
        </form>

        <p class="auth-rodape">
          Não tem conta? <a href="/cadastro" data-link>Criar conta</a>
        </p>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Ledo</footer>
    </div>
  `;

  ligarOlhoSenha();
  // Fundo topografico animado — mesmo padrao do /fora-do-horario.
  const topo = iniciarTopografia(document.querySelector('#auth-topo-canvas'), {
    escala: 0.004, vel: 0.00036, niveis: 14,
  });
  window.addEventListener('popstate', () => topo.stop(), { once: true });

  // ─── Comportamento ──────────────────────────────────────────────────
  const form = document.querySelector('#form-login');
  const btn  = document.querySelector('#btn-entrar');
  const erro = document.querySelector('#erro-form');

  // Foca no email se vazio, na senha se já preenchido.
  setTimeout(() => {
    if (emailInicio) document.querySelector('#senha')?.focus();
    else             document.querySelector('#email')?.focus();
  }, 420);

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
      // Email não confirmado → oferece atalho para a tela de OTP.
      if (r.mensagem === 'EMAIL_NAO_CONFIRMADO') {
        return mostrarErro(`
          Confirme seu email antes de entrar.
          <a href="/confirmar?email=${encodeURIComponent(email)}" data-link>Inserir código</a>
        `);
      }
      return mostrarErro(r.mensagem);
    }

    navegar(proximo);
  });
}

// Liga os botões de mostrar/ocultar senha (todos os .auth-senha-olho).
export function ligarOlhoSenha() {
  document.querySelectorAll('.auth-senha-olho').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.querySelector('#' + btn.dataset.alvo);
      if (!inp) return;
      const mostrar = inp.type === 'password';
      inp.type = mostrar ? 'text' : 'password';
      btn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      btn.innerHTML = mostrar ? ICON_OLHO_OFF : ICON_OLHO;
    });
  });
}
