// login.js — Tela de login (CP1, Fase 2).
// Layout split editorial: lado esquerdo identidade visual, lado direito formulário.
// Tipografia Fraunces + Manrope. Sem cards arredondados, sem gradientes.

import { entrarComSenha } from '../auth.js';
import { navegar }        from '../router.js';
import { validarEmail }   from '../utils.js';
import { renderLogo }     from '../../components/logo.js';

export function renderLogin() {
  const params      = new URLSearchParams(location.search);
  const proximo     = params.get('proximo') || '/dashboard';
  const emailInicio = params.get('email')   || '';

  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen grid grid-cols-1 lg:grid-cols-12">
      <!-- Lado esquerdo: identidade editorial. Visível só ≥lg para não competir no mobile. -->
      <aside class="hidden lg:flex lg:col-span-7 relative bg-papel2 guilhoche overflow-hidden">
        <!-- Marca e numeração editorial -->
        <div class="absolute top-10 left-10 right-10 flex items-start justify-between">
          <div class="flex items-center gap-3 reveal reveal-1">
            ${renderLogo({ size: 36, cor: 'var(--c-musgo)', titulo: 'Caixa Boti' })}
            <span class="h-eyebrow text-tinta-3" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>
          <div class="text-right reveal reveal-1">
            <p class="h-eyebrow">Caderno</p>
            <p class="h-meta text-sm tracking-wider mt-1">Auditoria diária</p>
          </div>
        </div>

        <!-- Bloco central: numeração + título -->
        <div class="absolute inset-0 flex flex-col justify-center px-16">
          <p class="edit-number reveal reveal-2 select-none">01.</p>
          <h1 class="h-display text-6xl xl:text-7xl mt-2 reveal reveal-3" style="max-width: 640px;">
            Comece o dia<br>
            com a <em style="font-style:italic;color:var(--c-musgo)">página em branco</em>.
          </h1>
          <p class="text-body text-base mt-6 max-w-md reveal reveal-4">
            Cada manhã é uma chance de fechar o que ficou aberto e
            registrar com calma o que entra hoje. Sem pressa, sem ruído.
          </p>
        </div>

        <!-- Rodapé esquerdo -->
        <div class="absolute bottom-10 left-10 right-10 flex items-end justify-between reveal reveal-5">
          <p class="h-meta text-xs">Plexalabs &middot; Sistemas internos</p>
          <p class="h-meta text-xs italic">v 1.0 &middot; ${new Date().getFullYear()}</p>
        </div>
      </aside>

      <!-- Lado direito: formulário -->
      <section class="lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-papel">
        <div class="w-full max-w-sm">
          <!-- Mobile: marca compacta no topo -->
          <div class="lg:hidden flex items-center gap-3 mb-10 reveal reveal-1">
            ${renderLogo({ size: 36, cor: 'var(--c-musgo)', titulo: 'Caixa Boti' })}
            <span class="h-eyebrow" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>

          <p class="h-eyebrow reveal reveal-2">Acesso restrito</p>
          <h2 class="h-display text-4xl mt-1 mb-2 reveal reveal-3">Bem-vindo de volta.</h2>
          <p class="text-body text-sm mb-10 reveal reveal-4">
            Entre com o email cadastrado e a senha definida no primeiro acesso.
          </p>

          <form id="form-login" novalidate class="reveal reveal-5">
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

            <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

            <button id="btn-entrar" type="submit" class="btn-primary w-full mt-2">
              Entrar
            </button>
          </form>

          <div class="mt-8 pt-6 border-t border-papel-3 flex items-center justify-between reveal reveal-6">
            <a href="/cadastro" data-link class="btn-link">Criar conta</a>
            <a href="/recuperar" data-link class="btn-link">Esqueci a senha</a>
          </div>
        </div>
      </section>
    </main>
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

