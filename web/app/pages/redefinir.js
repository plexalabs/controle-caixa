// redefinir.js — Tela /redefinir (CP2.4 + F3-FIX, Fase 2/3).
//
// Fluxo NOVO via OTP (não mais via link):
//   1. Operador chega aqui vindo de /recuperar com ?email=X
//   2. Digita o código de 8 dígitos do email (verifyOtp type='recovery')
//   3. supabase-js cria sessão recovery
//   4. Form de nova senha aparece, submit chama updateUser({ password })
//   5. signOut + navega('/login') com toast
//
// Por que mudou (F3-FIX-REDEFINIR-SENHA, 2026-05-03):
//   O cliente Supabase usa flowType:'pkce'. resetPasswordForEmail com PKCE
//   manda link com ?code=XXX que é one-time-use. Resend (e Gmail SafeLinks
//   e antivirus de email) faz HEAD/GET nessa URL pra preview ou tracking,
//   consumindo o token antes do operador clicar. Resultado: link sempre
//   chega como "expired/invalid" no clique real. Trocando por OTP-code
//   (mesmo padrão do /confirmar de signup), o token só é consumido quando
//   o operador digitar — scanners de email não fazem isso.
//
// Compatibilidade legacy: se vier hash com tokens (link antigo), supabase-js
// processa via detectSessionInUrl. Se já tem sessão ao entrar, pulamos
// direto pro form de senha.

import { verificarCodigo, atualizarSenha, sair, reenviarCodigo } from '../auth.js';
import { navegar }      from '../router.js';
import { mostrarToast } from '../notifications.js';
import { pegarSessao }  from '../supabase.js';
import { validarSenha } from '../utils.js';

const COOLDOWN_INICIAL_S = 60;
const OTP_LENGTH = 8;

export async function renderRedefinir() {
  const params = new URLSearchParams(location.search);
  const email  = (params.get('email') || '').trim();

  // Compatibilidade com o fluxo antigo via hash (#access_token=...).
  // detectSessionInUrl do supabase-js já processou; aqui só checamos
  // se já há sessão e, se sim, vamos direto ao form de senha.
  if (location.hash) history.replaceState({}, '', location.pathname + location.search);
  const sessaoExistente = await pegarSessao();

  if (sessaoExistente) {
    renderFormSenha();
    return;
  }

  // Fluxo principal (OTP): precisa de email no query.
  if (!email) {
    renderSemEmail();
    return;
  }

  renderFormOtp(email);
}

// ─── Tela 1: digitar código OTP de recuperação ───────────────────────────

function renderFormOtp(email) {
  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <main class="auth-card auth-card--lg" aria-labelledby="auth-titulo">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <h2 id="auth-titulo" class="auth-titulo">Redefinir senha</h2>
        <p class="auth-subtitulo">
          Enviamos um código para <strong>${esc(email)}</strong>.
          Cole abaixo para continuar.
        </p>

        <form id="form-otp" novalidate>
          <div class="otp-grid" role="group" aria-label="Código de ${OTP_LENGTH} dígitos">
            ${Array.from({ length: OTP_LENGTH }, (_, i) =>
              `<input data-i="${i}" inputmode="numeric" pattern="\\d" maxlength="1"
                      autocomplete="one-time-code" required
                      aria-label="Dígito ${i+1} de ${OTP_LENGTH}"
                      class="otp-input" />`
            ).join('')}
          </div>

          <div id="msg" role="alert" aria-live="polite" class="hidden alert"></div>

          <div class="text-center mt-2">
            <button id="btn-reenviar" type="button" class="btn-link cooldown" disabled>
              Reenviar em <span id="cooldown-segundos">${COOLDOWN_INICIAL_S}</span>s
            </button>
          </div>
        </form>

        <p class="auth-rodape">
          Email errado? <a href="/recuperar" data-link>Voltar</a>
        </p>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>
  `;

  const inputs     = Array.from(document.querySelectorAll('.otp-input'));
  const msg        = document.querySelector('#msg');
  const btnRe      = document.querySelector('#btn-reenviar');
  let verificando  = false;

  setTimeout(() => inputs[0].focus(), 480);

  function tokenAtual()   { return inputs.map(i => i.value).join(''); }
  function limparInputs() { inputs.forEach(i => { i.value=''; i.classList.remove('otp-input--preenchido','otp-input--erro'); }); inputs[0].focus(); }
  function marcarErro()   { inputs.forEach(i => i.classList.add('otp-input--erro')); setTimeout(limparInputs, 80); }
  function mostrarMsg(t)  { msg.classList.remove('hidden','alert--info'); msg.textContent = t; }
  function limparMsg()    { msg.classList.add('hidden'); msg.textContent=''; }

  inputs.forEach((input, i) => {
    input.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertText' && !/^\d$/.test(e.data ?? '')) e.preventDefault();
    });
    input.addEventListener('input', () => {
      if (input.value) {
        input.classList.add('otp-input--preenchido');
        input.classList.remove('otp-input--erro');
        limparMsg();
        if (i < inputs.length - 1) inputs[i + 1].focus();
        if (tokenAtual().length === OTP_LENGTH) verificar();
      } else {
        input.classList.remove('otp-input--preenchido');
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        inputs[i - 1].focus();
        inputs[i - 1].value = '';
        inputs[i - 1].classList.remove('otp-input--preenchido');
      }
      if (e.key === 'ArrowLeft'  && i > 0)                  inputs[i - 1].focus();
      if (e.key === 'ArrowRight' && i < inputs.length - 1)  inputs[i + 1].focus();
    });
    input.addEventListener('paste', (e) => {
      const txt = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
      if (txt.length >= OTP_LENGTH) {
        e.preventDefault();
        const completo = txt.slice(0, OTP_LENGTH).split('');
        inputs.forEach((x, j) => { x.value = completo[j]; x.classList.add('otp-input--preenchido'); x.classList.remove('otp-input--erro'); });
        limparMsg();
        inputs[OTP_LENGTH - 1].focus();
        verificar();
      } else if (txt.length > 0) {
        e.preventDefault();
        let j = i;
        for (const ch of txt) { if (j >= inputs.length) break; inputs[j].value = ch; inputs[j].classList.add('otp-input--preenchido'); j++; }
        const proximoVazio = inputs.findIndex(x => !x.value);
        inputs[proximoVazio === -1 ? OTP_LENGTH - 1 : proximoVazio].focus();
      }
    });
  });

  async function verificar() {
    if (verificando) return;
    const token = tokenAtual();
    if (token.length !== OTP_LENGTH) return;

    verificando = true;
    inputs.forEach(i => i.disabled = true);

    const r = await verificarCodigo(email, token, 'recovery');

    inputs.forEach(i => i.disabled = false);
    verificando = false;

    if (!r.ok) {
      mostrarMsg(r.mensagem || 'Código incorreto. Verifique o email recebido.');
      marcarErro();
      return;
    }

    // OTP validado → sessão recovery está ativa. Avança pro form de senha.
    renderFormSenha();
  }

  // Cooldown de reenvio
  let segundosRestantes = COOLDOWN_INICIAL_S;
  let timer;
  function iniciarCooldown() {
    btnRe.disabled = true;
    btnRe.innerHTML = `Reenviar em <span id="cooldown-segundos">${segundosRestantes}</span>s`;
    timer = setInterval(() => {
      segundosRestantes--;
      const span = document.querySelector('#cooldown-segundos');
      if (span) span.textContent = String(segundosRestantes);
      if (segundosRestantes <= 0) {
        clearInterval(timer);
        btnRe.disabled = false;
        btnRe.textContent = 'Reenviar código';
      }
    }, 1000);
  }
  iniciarCooldown();

  btnRe.addEventListener('click', async () => {
    if (btnRe.disabled) return;
    btnRe.disabled = true;
    btnRe.textContent = 'Enviando…';

    const r = await reenviarCodigo(email, 'recovery');

    if (!r.ok) {
      mostrarToast(r.mensagem, 'erro', 4500);
      btnRe.disabled = false;
      btnRe.textContent = 'Reenviar código';
      return;
    }

    mostrarToast(`Código reenviado para ${email}.`, 'ok', 3500);
    segundosRestantes = COOLDOWN_INICIAL_S;
    iniciarCooldown();
  });
}

// ─── Tela 2: definir nova senha ──────────────────────────────────────────

function renderFormSenha() {
  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <main class="auth-card" aria-labelledby="auth-titulo">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <h2 id="auth-titulo" class="auth-titulo">Defina a nova senha</h2>
        <p class="auth-subtitulo">
          Mínimo 8 caracteres, com letra e número.
        </p>

        <form id="form-redefinir" novalidate>
          <div class="field">
            <label class="field-label" for="senha">Nova senha</label>
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
            <label class="field-label" for="senha2">Confirmar nova senha</label>
            <input id="senha2" name="senha2" type="password" autocomplete="new-password"
                   required class="field-input" />
            <span class="field-underline" aria-hidden="true"></span>
            <p id="senha-match" class="match hidden" aria-live="polite"></p>
          </div>

          <div id="erro-form" role="alert" aria-live="polite" class="hidden alert"></div>

          <button id="btn-redefinir" type="submit" class="btn-primary" disabled>
            Redefinir senha
          </button>
        </form>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>
  `;

  const form     = document.querySelector('#form-redefinir');
  const btn      = document.querySelector('#btn-redefinir');
  const erro     = document.querySelector('#erro-form');
  const forcaEl  = document.querySelector('#senha-forca');
  const rotuloEl = document.querySelector('#senha-rotulo');
  const matchEl  = document.querySelector('#senha-match');

  const valido = { senha: false, senha2: false };

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

  function atualizarBtn() { btn.disabled = !(valido.senha && valido.senha2); }

  form.senha.addEventListener('input', () => {
    const v = form.senha.value;
    const { nivel, rotulo } = calcularForca(v);
    forcaEl.dataset.nivel  = String(nivel);
    rotuloEl.dataset.nivel = String(nivel);
    rotuloEl.textContent   = rotulo;
    valido.senha = !validarSenha(v);
    revalidarMatch();
    atualizarBtn();
  });

  function revalidarMatch() {
    const a = form.senha.value, b = form.senha2.value;
    if (!b) { matchEl.classList.add('hidden'); valido.senha2 = false; return; }
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
  form.senha2.addEventListener('input', () => { revalidarMatch(); atualizarBtn(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.classList.add('hidden');
    if (btn.disabled) return;

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const r = await atualizarSenha(form.senha.value);

    btn.removeAttribute('aria-busy');
    btn.disabled = false;

    if (!r.ok) {
      erro.textContent = r.mensagem;
      erro.classList.remove('hidden');
      return;
    }

    // Boa prática pós-recuperação: encerra sessão para forçar login com a nova senha.
    await sair();
    mostrarToast('Senha redefinida. Entre com a nova senha.', 'ok', 3500);
    navegar('/login');
  });

  setTimeout(() => form.senha.focus(), 480);
}

// ─── Tela de erro: chegou em /redefinir sem email nem sessão ─────────────

function renderSemEmail() {
  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <main class="auth-card">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <h2 class="auth-titulo">Faltou o email</h2>
        <p class="auth-subtitulo">
          Pra redefinir a senha, comece pela tela de recuperação — vamos te mandar um código novo.
        </p>
        <a href="/recuperar" data-link class="btn-primary" style="text-align:center;text-decoration:none">
          Pedir código
        </a>
        <p class="auth-rodape">
          <a href="/login" data-link>Voltar ao login</a>
        </p>
      </main>
      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
