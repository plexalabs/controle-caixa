// cadastro.js — Tela /cadastro (CP2.1, Fase 2).
// Form: nome, sobrenome, email, senha (com indicador de força), confirmar senha (com match).
// Submit dispara supabase.auth.signUp e redireciona para /confirmar?email=<email>.

import { cadastrar }       from '../auth.js';
import { navegar }         from '../router.js';
import { validarEmail, validarSenha, debounce } from '../utils.js';

export function renderCadastro() {
  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen grid grid-cols-1 lg:grid-cols-12">
      <!-- Lado editorial: numeração 02. e tom de "primeiro caderno" -->
      <aside class="hidden lg:flex lg:col-span-7 relative bg-papel2 guilhoche overflow-hidden">
        <div class="absolute top-10 left-10 right-10 flex items-start justify-between">
          <div class="flex items-center gap-3 reveal reveal-1">
            ${logoSvg()}
            <span class="h-eyebrow" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>
          <div class="text-right reveal reveal-1">
            <p class="h-eyebrow">Caderno</p>
            <p class="h-meta text-sm tracking-wider mt-1">Auditoria diária</p>
          </div>
        </div>

        <div class="absolute inset-0 flex flex-col justify-center px-16">
          <p class="edit-number reveal reveal-2 select-none">02.</p>
          <h1 class="h-display text-6xl xl:text-7xl mt-2 reveal reveal-3" style="max-width: 640px;">
            Abra o seu<br>
            <em style="font-style:italic;color:var(--c-musgo)">primeiro caderno</em>.
          </h1>
          <p class="text-body text-base mt-6 max-w-md reveal reveal-4">
            Cada lançamento auditado fica em uma página datada. Antes do
            primeiro registro, defina o nome que vai assinar a auditoria
            e a senha de acesso.
          </p>

          <ul class="lista-edit max-w-md reveal reveal-5">
            <li>Conta única por pessoa, não compartilhada.</li>
            <li>Confirmação do email por código que chega na sua caixa.</li>
            <li>Senha conhecida só por você &mdash; nem nós temos acesso.</li>
          </ul>
        </div>

        <div class="absolute bottom-10 left-10 right-10 flex items-end justify-between reveal reveal-6">
          <p class="h-meta text-xs">Plexalabs &middot; Sistemas internos</p>
          <p class="h-meta text-xs italic">v 1.0 &middot; ${new Date().getFullYear()}</p>
        </div>
      </aside>

      <!-- Lado direito: formulário -->
      <section class="lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-papel">
        <div class="w-full max-w-sm">
          <div class="lg:hidden flex items-center gap-3 mb-8 reveal reveal-1">
            ${logoSvg()}
            <span class="h-eyebrow" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>

          <p class="h-eyebrow reveal reveal-2">Primeiro acesso</p>
          <h2 class="h-display text-4xl mt-1 mb-2 reveal reveal-3">Criar conta.</h2>
          <p class="text-body text-sm mb-8 reveal reveal-4">
            Você vai receber um código por email para confirmar a conta.
          </p>

          <form id="form-cadastro" novalidate class="reveal reveal-5">
            <div class="grid grid-cols-2 gap-4">
              <div class="field" style="margin-bottom:0">
                <label class="field-label" for="nome">Nome</label>
                <input id="nome" name="nome" type="text" autocomplete="given-name"
                       required minlength="2" class="field-input" />
                <span class="field-underline" aria-hidden="true"></span>
              </div>
              <div class="field" style="margin-bottom:0">
                <label class="field-label" for="sobrenome">Sobrenome</label>
                <input id="sobrenome" name="sobrenome" type="text" autocomplete="family-name"
                       required minlength="2" class="field-input" />
                <span class="field-underline" aria-hidden="true"></span>
              </div>
            </div>

            <div class="field mt-5">
              <label class="field-label" for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email"
                     required class="field-input" placeholder="voce@plexalabs.com" />
              <span class="field-underline" aria-hidden="true"></span>
              <p id="email-erro" class="match match--erro hidden" role="alert"></p>
            </div>

            <div class="field">
              <label class="field-label" for="senha">Senha</label>
              <input id="senha" name="senha" type="password" autocomplete="new-password"
                     required minlength="8" class="field-input" />
              <span class="field-underline" aria-hidden="true"></span>
              <div id="senha-forca" class="senha-forca" data-nivel="0" aria-hidden="true">
                <span class="senha-forca-barra"></span>
                <span class="senha-forca-barra"></span>
                <span class="senha-forca-barra"></span>
              </div>
              <p id="senha-rotulo" class="senha-forca-rotulo" data-nivel="0" aria-live="polite">
                Mínimo 8 caracteres, ao menos 1 letra e 1 número
              </p>
            </div>

            <div class="field">
              <label class="field-label" for="senha2">Confirmar senha</label>
              <input id="senha2" name="senha2" type="password" autocomplete="new-password"
                     required class="field-input" />
              <span class="field-underline" aria-hidden="true"></span>
              <p id="senha-match" class="match hidden" aria-live="polite"></p>
            </div>

            <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

            <button id="btn-criar" type="submit" class="btn-primary w-full mt-2" disabled>
              Criar conta
            </button>
          </form>

          <p class="text-sm text-center mt-8 pt-6 border-t border-papel-3 reveal reveal-6"
             style="border-color:var(--c-papel-3);color:var(--c-tinta-3)">
            Já tem conta? <a href="/login" data-link class="btn-link">Entrar</a>
          </p>
        </div>
      </section>
    </main>
  `;

  // ─── Estado de validação ────────────────────────────────────────────
  const form    = document.querySelector('#form-cadastro');
  const inputs  = {
    nome:      form.nome,
    sobrenome: form.sobrenome,
    email:     form.email,
    senha:     form.senha,
    senha2:    form.senha2,
  };
  const btn     = document.querySelector('#btn-criar');
  const erro    = document.querySelector('#erro-form');

  const valido = {
    nome: false, sobrenome: false, email: false, senha: false, senha2: false,
  };

  // Foco inicial no nome após animação.
  setTimeout(() => inputs.nome.focus(), 480);

  // ─── Helpers ─────────────────────────────────────────────────────────
  function atualizarSubmit() {
    btn.disabled = !Object.values(valido).every(Boolean);
  }
  function mostrarErroForm(html) {
    erro.classList.remove('hidden');
    erro.innerHTML = html;
  }
  function limparErroForm() {
    erro.classList.add('hidden');
    erro.textContent = '';
  }

  // ─── Validação nome / sobrenome ─────────────────────────────────────
  ['nome', 'sobrenome'].forEach((campo) => {
    inputs[campo].addEventListener('input', () => {
      valido[campo] = inputs[campo].value.trim().length >= 2;
      atualizarSubmit();
    });
  });

  // ─── Validação email com debounce 300ms ─────────────────────────────
  const emailErro = document.querySelector('#email-erro');
  const validarCampoEmail = debounce(() => {
    const v = inputs.email.value.trim();
    if (!v) {
      valido.email = false;
      emailErro.classList.add('hidden');
      atualizarSubmit();
      return;
    }
    const e = validarEmail(v);
    if (e) {
      valido.email = false;
      emailErro.textContent = e;
      emailErro.classList.remove('hidden');
    } else {
      valido.email = true;
      emailErro.classList.add('hidden');
    }
    atualizarSubmit();
  }, 300);
  inputs.email.addEventListener('input', validarCampoEmail);

  // ─── Validação senha + indicador de força ───────────────────────────
  const forcaEl  = document.querySelector('#senha-forca');
  const rotuloEl = document.querySelector('#senha-rotulo');

  function calcularForca(senha) {
    if (!senha) return { nivel: 0, rotulo: 'Mínimo 8 caracteres, ao menos 1 letra e 1 número' };
    const temLetra   = /[a-zA-Z]/.test(senha);
    const temNumero  = /\d/.test(senha);
    const temSimbolo = /[^a-zA-Z0-9]/.test(senha);
    const longa      = senha.length >= 12;

    if (senha.length < 8) return { nivel: 1, rotulo: 'Fraca — menos de 8 caracteres' };
    if (!temLetra || !temNumero) return { nivel: 1, rotulo: 'Fraca — precisa letra e número' };
    if (longa && temSimbolo) return { nivel: 3, rotulo: 'Forte' };
    if (longa || temSimbolo) return { nivel: 2, rotulo: 'Média' };
    return { nivel: 2, rotulo: 'Média' };
  }

  inputs.senha.addEventListener('input', () => {
    const v = inputs.senha.value;
    const { nivel, rotulo } = calcularForca(v);
    forcaEl.dataset.nivel  = String(nivel);
    rotuloEl.dataset.nivel = String(nivel);
    rotuloEl.textContent   = rotulo;

    valido.senha = !validarSenha(v);
    revalidarMatch();
    atualizarSubmit();
  });

  // ─── Match de senha em tempo real ───────────────────────────────────
  const matchEl = document.querySelector('#senha-match');
  function revalidarMatch() {
    const a = inputs.senha.value;
    const b = inputs.senha2.value;
    if (!b) {
      matchEl.classList.add('hidden');
      valido.senha2 = false;
      return;
    }
    if (a === b) {
      matchEl.className = 'match match--ok';
      matchEl.innerHTML = '<span aria-hidden="true">✓</span> Senhas conferem';
      matchEl.classList.remove('hidden');
      valido.senha2 = valido.senha;
    } else {
      matchEl.className = 'match match--erro';
      matchEl.innerHTML = '<span aria-hidden="true">✗</span> As senhas não coincidem';
      matchEl.classList.remove('hidden');
      valido.senha2 = false;
    }
  }
  inputs.senha2.addEventListener('input', () => { revalidarMatch(); atualizarSubmit(); });

  // ─── Submit ─────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErroForm();

    if (btn.disabled) return;

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const r = await cadastrar(
      inputs.email.value.trim(),
      inputs.senha.value,
      {
        nome:      inputs.nome.value.trim(),
        sobrenome: inputs.sobrenome.value.trim(),
      }
    );

    btn.removeAttribute('aria-busy');
    atualizarSubmit();

    if (!r.ok) {
      // Caso especial: já cadastrado → oferece atalhos.
      if (/já existe uma conta/i.test(r.mensagem)) {
        mostrarErroForm(`
          Este email já tem cadastro.
          <a href="/login?email=${encodeURIComponent(inputs.email.value.trim())}" data-link>Entrar</a>
          ou <a href="/recuperar?email=${encodeURIComponent(inputs.email.value.trim())}" data-link>recuperar a senha</a>.
        `);
      } else {
        mostrarErroForm(r.mensagem);
      }
      // Por segurança, limpa só os campos de senha. Mantém nome/email.
      inputs.senha.value  = '';
      inputs.senha2.value = '';
      forcaEl.dataset.nivel  = '0';
      rotuloEl.dataset.nivel = '0';
      rotuloEl.textContent   = 'Mínimo 8 caracteres, ao menos 1 letra e 1 número';
      matchEl.classList.add('hidden');
      valido.senha = false;
      valido.senha2 = false;
      atualizarSubmit();
      return;
    }

    // Sucesso → vai para tela de confirmação OTP.
    navegar('/confirmar?email=' + encodeURIComponent(inputs.email.value.trim()));
  });
}

function logoSvg() {
  return `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.5"
              style="color:var(--c-musgo)" />
      <path d="M8 22 L24 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            style="color:var(--c-musgo)" />
      <circle cx="11" cy="13" r="1.5" fill="currentColor" style="color:var(--c-ambar)" />
      <circle cx="21" cy="19" r="1.5" fill="currentColor" style="color:var(--c-ambar)" />
    </svg>`;
}
