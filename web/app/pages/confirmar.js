// confirmar.js — Tela /confirmar (CP2.2, Fase 2).
// 6 inputs de 1 dígito com auto-foco, paste de código completo, auto-submit.
// Reenviar com cooldown de 60s.

import { verificarCodigo, reenviarCodigo } from '../auth.js';
import { navegar }        from '../router.js';
import { mostrarToast }   from '../notifications.js';

const COOLDOWN_INICIAL_S = 60;

export function renderConfirmar() {
  const params = new URLSearchParams(location.search);
  const email  = (params.get('email') || '').trim();

  // Sem email no query → manda para login (caso de aterrissagem direta).
  if (!email) {
    navegar('/login');
    return;
  }

  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen grid grid-cols-1 lg:grid-cols-12">
      <!-- Editorial -->
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
          <p class="edit-number reveal reveal-2 select-none">03.</p>
          <h1 class="h-display text-6xl xl:text-7xl mt-2 reveal reveal-3" style="max-width: 640px;">
            Identifique<br>
            <em style="font-style:italic;color:var(--c-musgo)">o seu acesso</em>.
          </h1>
          <p class="text-body text-base mt-6 max-w-md reveal reveal-4">
            Enviamos um código de 6 dígitos para <strong>${esc(email)}</strong>.
            Cole no campo ao lado para confirmar a conta.
          </p>
          <p class="text-body text-sm mt-3 max-w-md reveal reveal-5"
             style="color:var(--c-tinta-3);font-style:italic">
            Não recebeu? Verifique também a caixa de spam &mdash; ou peça
            um novo código abaixo do formulário.
          </p>
        </div>

        <div class="absolute bottom-10 left-10 right-10 flex items-end justify-between reveal reveal-6">
          <p class="h-meta text-xs">Plexalabs &middot; Sistemas internos</p>
          <p class="h-meta text-xs italic">v 1.0 &middot; ${new Date().getFullYear()}</p>
        </div>
      </aside>

      <!-- Form -->
      <section class="lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-papel">
        <div class="w-full max-w-sm">
          <div class="lg:hidden flex items-center gap-3 mb-8 reveal reveal-1">
            ${logoSvg()}
            <span class="h-eyebrow" style="color:var(--c-tinta-3)">Caixa Boti</span>
          </div>

          <p class="h-eyebrow reveal reveal-2">Verificação</p>
          <h2 class="h-display text-4xl mt-1 mb-2 reveal reveal-3">Digite o código.</h2>
          <p class="text-body text-sm reveal reveal-4">
            Enviamos para <strong>${esc(email)}</strong>.<br class="hidden sm:inline">
            Pode colar (Ctrl+V) o código completo no primeiro campo.
          </p>

          <form id="form-otp" novalidate class="reveal reveal-5">
            <div class="otp-grid" role="group" aria-label="Código de 6 dígitos">
              ${[0,1,2,3,4,5].map(i =>
                `<input data-i="${i}" inputmode="numeric" pattern="\\d" maxlength="1"
                        autocomplete="one-time-code" required
                        aria-label="Dígito ${i+1} de 6"
                        class="otp-input" />`
              ).join('')}
            </div>

            <div id="msg" role="alert" aria-live="polite" class="hidden alert"></div>

            <div class="text-center mt-6 reveal reveal-6">
              <button id="btn-reenviar" type="button" class="btn-link cooldown" disabled>
                Reenviar em <span id="cooldown-segundos">${COOLDOWN_INICIAL_S}</span>s
              </button>
            </div>
          </form>

          <p class="text-sm text-center mt-8 pt-6 border-t reveal reveal-6"
             style="border-color:var(--c-papel-3);color:var(--c-tinta-3)">
            Mudou de ideia? <a href="/login" data-link class="btn-link">Voltar ao login</a>
          </p>
        </div>
      </section>
    </main>
  `;

  // ─── Estado e referências ───────────────────────────────────────────
  const inputs    = Array.from(document.querySelectorAll('.otp-input'));
  const msg       = document.querySelector('#msg');
  const btnRe     = document.querySelector('#btn-reenviar');
  const segundosEl = document.querySelector('#cooldown-segundos');
  let verificando = false;

  // Foca no primeiro input após animação inicial.
  setTimeout(() => inputs[0].focus(), 480);

  // ─── Helpers ────────────────────────────────────────────────────────
  function tokenAtual() {
    return inputs.map(i => i.value).join('');
  }
  function limparInputs(focar = true) {
    inputs.forEach(i => {
      i.value = '';
      i.classList.remove('otp-input--preenchido', 'otp-input--erro');
    });
    if (focar) inputs[0].focus();
  }
  function marcarErro() {
    inputs.forEach(i => i.classList.add('otp-input--erro'));
    setTimeout(() => limparInputs(true), 80);
  }
  function mostrarMsg(texto, tipo = 'erro') {
    msg.classList.remove('hidden', 'alert--info');
    if (tipo === 'info') msg.classList.add('alert--info');
    msg.textContent = texto;
  }
  function limparMsg() {
    msg.classList.add('hidden');
    msg.textContent = '';
  }

  // ─── Comportamento dos inputs ───────────────────────────────────────
  inputs.forEach((input, i) => {
    // Aceita apenas dígitos.
    input.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertText' && !/^\d$/.test(e.data ?? '')) {
        e.preventDefault();
      }
    });

    // Avança foco ao digitar.
    input.addEventListener('input', () => {
      if (input.value) {
        input.classList.add('otp-input--preenchido');
        input.classList.remove('otp-input--erro');
        limparMsg();
        if (i < inputs.length - 1) inputs[i + 1].focus();
        // Se completou os 6, dispara verificação.
        if (tokenAtual().length === 6) verificar();
      } else {
        input.classList.remove('otp-input--preenchido');
      }
    });

    // Backspace volta para o input anterior se vazio.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        inputs[i - 1].focus();
        inputs[i - 1].value = '';
        inputs[i - 1].classList.remove('otp-input--preenchido');
      }
      if (e.key === 'ArrowLeft'  && i > 0)                  inputs[i - 1].focus();
      if (e.key === 'ArrowRight' && i < inputs.length - 1)  inputs[i + 1].focus();
    });

    // Paste de código completo distribui entre os inputs.
    input.addEventListener('paste', (e) => {
      const txt = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
      if (txt.length >= 6) {
        e.preventDefault();
        const seis = txt.slice(0, 6).split('');
        inputs.forEach((x, j) => {
          x.value = seis[j];
          x.classList.add('otp-input--preenchido');
          x.classList.remove('otp-input--erro');
        });
        limparMsg();
        inputs[5].focus();
        verificar();
      } else if (txt.length > 0 && txt.length < 6) {
        // Paste parcial — distribui a partir do input atual.
        e.preventDefault();
        let j = i;
        for (const ch of txt) {
          if (j >= inputs.length) break;
          inputs[j].value = ch;
          inputs[j].classList.add('otp-input--preenchido');
          j++;
        }
        const proximoVazio = inputs.findIndex(x => !x.value);
        inputs[proximoVazio === -1 ? 5 : proximoVazio].focus();
      }
    });
  });

  // ─── Verificação do OTP ─────────────────────────────────────────────
  async function verificar() {
    if (verificando) return;
    const token = tokenAtual();
    if (token.length !== 6) return;

    verificando = true;
    inputs.forEach(i => i.disabled = true);

    const r = await verificarCodigo(email, token, 'signup');

    inputs.forEach(i => i.disabled = false);
    verificando = false;

    if (!r.ok) {
      // Mensagens já vêm traduzidas pelo auth.js.
      mostrarMsg(r.mensagem || 'Código incorreto. Verifique o email recebido.');
      marcarErro();
      return;
    }

    mostrarToast('Conta confirmada.', 'ok', 2200);
    navegar('/dashboard');
  }

  // ─── Cooldown de reenvio ────────────────────────────────────────────
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

    const r = await reenviarCodigo(email, 'signup');

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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
