// cadastro.js — Tela /cadastro (rebrand 2026-05-02).
// Shell minimal centralizado com card mais largo (auth-card--lg) pra
// acomodar nome+sobrenome lado a lado. Lógica de validação intacta.

import { cadastrar }       from '../auth.js';
import { navegar }         from '../router.js';
import { validarEmail, validarSenha, debounce } from '../utils.js';

export function renderCadastro() {
  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <main class="auth-card auth-card--lg" aria-labelledby="auth-titulo">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <h2 id="auth-titulo" class="auth-titulo">Criar conta</h2>
        <p class="auth-subtitulo">
          Cadastre-se para começar a auditar. Você receberá um código por email para confirmar.
        </p>

        <form id="form-cadastro" novalidate>
          <div class="auth-grid-2">
            <div class="field">
              <label class="field-label" for="nome">Nome</label>
              <input id="nome" name="nome" type="text" autocomplete="given-name"
                     required minlength="2" class="field-input" />
              <span class="field-underline" aria-hidden="true"></span>
            </div>
            <div class="field">
              <label class="field-label" for="sobrenome">Sobrenome</label>
              <input id="sobrenome" name="sobrenome" type="text" autocomplete="family-name"
                     required minlength="2" class="field-input" />
              <span class="field-underline" aria-hidden="true"></span>
            </div>
          </div>

          <div class="field">
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

          <button id="btn-criar" type="submit" class="btn-primary" disabled>
            Criar conta
          </button>
        </form>

        <p class="auth-rodape">
          Já tem conta? <a href="/login" data-link>Entrar</a>
        </p>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>
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

