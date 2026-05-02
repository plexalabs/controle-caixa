// confirmar.js — Tela /confirmar (CP2.2, Fase 2).
// Inputs com auto-foco, paste de código completo, auto-submit.
// Reenviar com cooldown de 60s.
//
// O comprimento do código é controlado em Supabase Auth → Providers → Email
// → Email OTP Length. Hoje está configurado em 8. Se o admin mudar para
// 6 no Dashboard, basta atualizar OTP_LENGTH abaixo.

import { verificarCodigo, reenviarCodigo } from '../auth.js';
import { navegar }        from '../router.js';
import { mostrarToast }   from '../notifications.js';

const COOLDOWN_INICIAL_S = 60;
const OTP_LENGTH = 8;

export function renderConfirmar() {
  const params = new URLSearchParams(location.search);
  const email  = (params.get('email') || '').trim();

  // Sem email no query → manda para login (caso de aterrissagem direta).
  if (!email) {
    navegar('/login');
    return;
  }

  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <header class="auth-marca">
        <span class="auth-marca-simbolo" aria-hidden="true"></span>
        <h1 class="auth-marca-wordmark">Caixa Boti</h1>
      </header>

      <main class="auth-card auth-card--lg" aria-labelledby="auth-titulo">
        <h2 id="auth-titulo" class="auth-titulo">Confirme seu email</h2>
        <p class="auth-subtitulo">
          Enviamos um código para <strong>${esc(email)}</strong>.
          Cole abaixo para confirmar sua conta.
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
          Quer trocar o email? <a href="/login" data-link>Voltar</a>
        </p>
      </main>

      <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
    </div>
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
        // Se completou todos os dígitos, dispara verificação.
        if (tokenAtual().length === OTP_LENGTH) verificar();
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
      if (txt.length >= OTP_LENGTH) {
        e.preventDefault();
        const completo = txt.slice(0, OTP_LENGTH).split('');
        inputs.forEach((x, j) => {
          x.value = completo[j];
          x.classList.add('otp-input--preenchido');
          x.classList.remove('otp-input--erro');
        });
        limparMsg();
        inputs[OTP_LENGTH - 1].focus();
        verificar();
      } else if (txt.length > 0 && txt.length < OTP_LENGTH) {
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
        inputs[proximoVazio === -1 ? OTP_LENGTH - 1 : proximoVazio].focus();
      }
    });
  });

  // ─── Verificação do OTP ─────────────────────────────────────────────
  async function verificar() {
    if (verificando) return;
    const token = tokenAtual();
    if (token.length !== OTP_LENGTH) return;

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


function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
