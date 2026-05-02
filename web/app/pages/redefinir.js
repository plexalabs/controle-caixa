// redefinir.js — Tela /redefinir (CP2.4, Fase 2).
// Aterrissagem do link de recuperação enviado por email. Quando o usuário
// clica no link, o Supabase coloca tokens no fragment (#access_token=...
// &refresh_token=...&type=recovery) e o supabase-js cria sessão automaticamente
// graças a `detectSessionInUrl: true` do app/supabase.js.

import { atualizarSenha, sair } from '../auth.js';
import { navegar }              from '../router.js';
import { mostrarToast }         from '../notifications.js';
import { pegarSessao }          from '../supabase.js';
import { validarSenha }         from '../utils.js';

export async function renderRedefinir() {
  // Confere se há sessão recovery — sem ela, manda para /recuperar.
  const sessao = await pegarSessao();
  const recovery = sessao && (location.hash.includes('type=recovery') || sessao.user?.recovery_sent_at);

  // Limpa o fragment para não vazar token em refresh.
  if (location.hash) history.replaceState({}, '', location.pathname);

  if (!sessao) {
    document.querySelector('#app').innerHTML = `
      <div id="main" class="auth-shell">
        <header class="auth-marca">
          <span class="auth-marca-simbolo" aria-hidden="true"></span>
          <h1 class="auth-marca-wordmark">Caixa Boti</h1>
        </header>
        <main class="auth-card">
          <h2 class="auth-titulo" style="color:var(--c-alerta)">Link inválido</h2>
          <p class="auth-subtitulo">
            Sessão não encontrada. Use o link enviado por email — ele só funciona uma vez
            e expira em 1 hora. Se já usou ou expirou, peça um novo.
          </p>
          <a href="/recuperar" data-link class="btn-primary" style="text-align:center;text-decoration:none">
            Pedir novo link
          </a>
        </main>
        <footer class="auth-footer">© ${new Date().getFullYear()} Plexa Lab&apos;s · Caixa Boti</footer>
      </div>`;
    return;
  }

  document.querySelector('#app').innerHTML = `
    <div id="main" class="auth-shell">
      <header class="auth-marca">
        <span class="auth-marca-simbolo" aria-hidden="true"></span>
        <h1 class="auth-marca-wordmark">Caixa Boti</h1>
      </header>

      <main class="auth-card" aria-labelledby="auth-titulo">
        <h2 id="auth-titulo" class="auth-titulo">Redefinir senha</h2>
        <p class="auth-subtitulo">
          Defina uma nova senha para sua conta. Mínimo 8 caracteres, com letra e número.
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

  // ─── Mesma lógica do cadastro: força + match em tempo real ──────────
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

    // Boa prática pós-recuperação: encerra sessão para forçar login com a senha nova.
    await sair();
    mostrarToast('Senha redefinida. Entre com a nova senha.', 'ok', 3500);
    navegar('/login');
  });

  setTimeout(() => form.senha.focus(), 480);
}

