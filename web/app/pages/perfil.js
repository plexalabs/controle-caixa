// perfil.js — Tela /perfil (CP5.4).
// Lê dados do usuário (auth.users + user_metadata + usuario_papel),
// permite editar nome/sobrenome via drawer e trocar senha via modal
// com re-autenticação prévia.

import { supabase, pegarSessao } from '../supabase.js';
import { renderHeader, ligarHeader } from '../../components/header.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { pegarPapeis, limparCachePapeis } from '../papeis.js';

export async function renderPerfil() {
  const sessao = await pegarSessao();
  if (!sessao) return;
  const u    = sessao.user;
  const meta = u.user_metadata || {};
  const papeis = await pegarPapeis();

  const nome     = meta.nome || '';
  const sobrenome = meta.sobrenome || '';
  const email    = u.email || '';
  const cadastro = u.created_at;

  document.querySelector('#app').innerHTML = `
    ${await renderHeader('config')}
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Você</p>
          <h1 class="tela-cabec-titulo">Seu perfil.</h1>
          <p class="tela-cabec-sub">
            Dados pessoais, segurança e permissões. O que depende do admin
            (mudar email, atribuir papéis) você pede para a equipe.
          </p>
        </div>
      </header>

      <section class="perfil-grid reveal reveal-3">
        <article class="perfil-card" style="animation-delay:0ms">
          <p class="perfil-card-eyebrow">Nome</p>
          <p id="perf-nome" class="perfil-card-valor">${esc(formatarNomeCompleto(nome, sobrenome))}</p>
          <p class="perfil-card-meta">Como você aparece no sistema. Aparece também na saudação do painel.</p>
          <div class="perfil-card-acoes">
            <button id="btn-editar-nome" class="vd-card-btn">Editar nome</button>
          </div>
        </article>

        <article class="perfil-card" style="animation-delay:60ms">
          <p class="perfil-card-eyebrow">Email</p>
          <p class="perfil-card-valor is-mono">${esc(email)}</p>
          <p class="perfil-card-meta">
            Para alterar o email, é preciso recriar a conta. Fale com o admin.
          </p>
        </article>

        <article class="perfil-card" style="animation-delay:120ms">
          <p class="perfil-card-eyebrow">Senha</p>
          <p class="perfil-card-valor is-mono" aria-label="Senha oculta">••••••••</p>
          <p class="perfil-card-meta">
            Trocas pessoais. Pede senha atual e a nova — sessões ativas seguem válidas.
          </p>
          <div class="perfil-card-acoes">
            <button id="btn-trocar-senha" class="vd-card-btn">Alterar senha</button>
          </div>
        </article>

        <article class="perfil-card" style="animation-delay:180ms">
          <p class="perfil-card-eyebrow">Papéis</p>
          <p class="perfil-card-valor is-mono">${esc(formatarPapeis(papeis))}</p>
          <p class="perfil-card-meta">
            Definidos pelo admin. Operador lança e categoriza; admin também desativa
            vendedoras e gerencia configurações do sistema.
          </p>
        </article>

        <article class="perfil-card" style="animation-delay:240ms">
          <p class="perfil-card-eyebrow">Conta criada em</p>
          <p class="perfil-card-valor is-mono">${esc(formatarDataLonga(cadastro))}</p>
          <p class="perfil-card-meta">Marca o início do seu acesso ao Caixa Boti.</p>
        </article>
      </section>
    </main>
  `;

  ligarHeader();

  document.querySelector('#btn-editar-nome').addEventListener('click', () =>
    abrirDrawerEditarNome({ nome, sobrenome })
  );
  document.querySelector('#btn-trocar-senha').addEventListener('click', () =>
    abrirModalTrocarSenha(email)
  );
}

// ─── Editar nome ─────────────────────────────────────────────────────
function abrirDrawerEditarNome({ nome, sobrenome }) {
  abrirModal({
    lateral: true,
    eyebrow: 'Perfil',
    titulo:  'Editar nome.',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--c-tinta-3);margin-bottom:1.4rem;line-height:1.55">
        Como você prefere aparecer. Use o nome curto que o time chama no dia a dia.
      </p>
      <form id="form-nome" novalidate>
        <div class="field">
          <label class="field-label" for="pf-nome">Nome *</label>
          <input id="pf-nome" name="nome" required minlength="2" maxlength="60"
                 class="field-input" autocomplete="given-name"
                 value="${esc(nome)}" />
          <span class="field-underline"></span>
        </div>
        <div class="field">
          <label class="field-label" for="pf-sobrenome">Sobrenome</label>
          <input id="pf-sobrenome" name="sobrenome" maxlength="80"
                 class="field-input" autocomplete="family-name"
                 placeholder="opcional"
                 value="${esc(sobrenome)}" />
          <span class="field-underline"></span>
        </div>
      </form>
    `,
    rodape: `
      <div id="erro-nome" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-cancel-nome" class="btn-link">Cancelar</button>
        <button type="submit" form="form-nome" id="btn-salvar-nome" class="btn-primary">Salvar</button>
      </div>`,
  });

  setTimeout(() => document.querySelector('#pf-nome')?.focus(), 360);
  document.querySelector('#btn-cancel-nome').addEventListener('click', () => fecharModal(false));

  document.querySelector('#form-nome').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nv = document.querySelector('#pf-nome').value.trim();
    const sv = document.querySelector('#pf-sobrenome').value.trim();
    const erroEl = document.querySelector('#erro-nome');
    const btn = document.querySelector('#btn-salvar-nome');
    erroEl.classList.add('hidden');

    if (nv.length < 2) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Nome precisa ter ao menos 2 caracteres.';
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase.auth.updateUser({
      data: { nome: nv, sobrenome: sv || null },
    });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Não foi possível salvar: ' + error.message;
      return;
    }

    fecharModal(true);
    mostrarToast('Nome atualizado.', 'ok', 2200);
    renderPerfil();
  });
}

// ─── Trocar senha ─────────────────────────────────────────────────────
function abrirModalTrocarSenha(email) {
  abrirModal({
    titulo: 'Alterar senha',
    eyebrow: 'Segurança',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--c-tinta-3);margin-bottom:1.4rem;line-height:1.55">
        Confirme a senha atual e escolha uma nova. Mínimo 8 caracteres,
        com letra e número. Sessões abertas em outras abas continuam válidas.
      </p>
      <form id="form-senha" novalidate>
        <div class="field">
          <label class="field-label" for="ps-atual">Senha atual *</label>
          <input id="ps-atual" type="password" required class="field-input"
                 autocomplete="current-password" />
          <span class="field-underline"></span>
        </div>
        <div class="field">
          <label class="field-label" for="ps-nova">Nova senha *</label>
          <input id="ps-nova" type="password" required minlength="8"
                 class="field-input" autocomplete="new-password" />
          <span class="field-underline"></span>
          <div id="ps-forca" class="senha-forca" data-nivel="0" aria-hidden="true">
            <span class="senha-forca-barra"></span>
            <span class="senha-forca-barra"></span>
            <span class="senha-forca-barra"></span>
          </div>
          <p id="ps-rotulo" class="senha-forca-rotulo" data-nivel="0" aria-live="polite">
            Mínimo 8 caracteres, ao menos 1 letra e 1 número
          </p>
        </div>
        <div class="field">
          <label class="field-label" for="ps-conf">Confirme a nova senha *</label>
          <input id="ps-conf" type="password" required class="field-input"
                 autocomplete="new-password" />
          <span class="field-underline"></span>
          <p id="ps-match" class="match hidden"></p>
        </div>
      </form>
    `,
    rodape: `
      <div id="erro-senha" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="btn-cancel-senha" class="btn-link">Cancelar</button>
        <button type="submit" form="form-senha" id="btn-salvar-senha" class="btn-primary" disabled>
          Alterar senha
        </button>
      </div>`,
  });

  setTimeout(() => document.querySelector('#ps-atual')?.focus(), 360);

  const f = (id) => document.querySelector(`#${id}`);
  document.querySelector('#btn-cancel-senha').addEventListener('click', () => fecharModal(false));

  // Força + match
  const forcaEl  = f('ps-forca');
  const rotuloEl = f('ps-rotulo');
  const matchEl  = f('ps-match');
  const btn      = f('btn-salvar-senha');

  function recalc() {
    const atual = f('ps-atual').value;
    const nova  = f('ps-nova').value;
    const conf  = f('ps-conf').value;

    const { nivel, rotulo } = calcularForca(nova);
    forcaEl.dataset.nivel  = String(nivel);
    rotuloEl.dataset.nivel = String(nivel);
    rotuloEl.textContent   = rotulo;

    const senhaOk = nova.length >= 8 && /[a-zA-Z]/.test(nova) && /\d/.test(nova);

    if (!conf) {
      matchEl.classList.add('hidden');
    } else if (nova === conf) {
      matchEl.className = 'match match--ok';
      matchEl.innerHTML = '<span aria-hidden="true">✓</span> Senhas conferem';
    } else {
      matchEl.className = 'match match--erro';
      matchEl.innerHTML = '<span aria-hidden="true">✗</span> As senhas não coincidem';
    }

    btn.disabled = !(atual.length >= 1 && senhaOk && nova === conf);
  }
  ['ps-atual', 'ps-nova', 'ps-conf'].forEach(id => f(id).addEventListener('input', recalc));

  // Submit
  document.querySelector('#form-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erroEl = f('erro-senha');
    erroEl.classList.add('hidden');

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    // 1. Re-autenticação com senha atual.
    const { error: erroLogin } = await supabase.auth.signInWithPassword({
      email,
      password: f('ps-atual').value,
    });
    if (erroLogin) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Senha atual incorreta.';
      f('ps-atual').focus();
      return;
    }

    // 2. Atualiza senha.
    const { error: erroUpd } = await supabase.auth.updateUser({
      password: f('ps-nova').value,
    });
    btn.removeAttribute('aria-busy');

    if (erroUpd) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Não foi possível alterar a senha: ' + erroUpd.message;
      return;
    }

    fecharModal(true);
    mostrarToast('Senha alterada com sucesso.', 'ok', 2600);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────
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

function formatarNomeCompleto(nome, sobrenome) {
  const partes = [nome, sobrenome].filter(Boolean);
  return partes.length ? partes.join(' ') : '—';
}

function formatarPapeis(papeis) {
  if (!papeis || papeis.length === 0) return 'sem papéis atribuídos';
  const labels = { admin: 'Admin', operador: 'Operador' };
  return papeis.map(p => labels[p] || p).sort().join(' + ');
}

function formatarDataLonga(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(ts));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
