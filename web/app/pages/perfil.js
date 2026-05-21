// perfil.js — Tela /perfil refator v2: um perfil estilo GitHub × Instagram.
// Capa, foto de perfil (upload pro bucket `avatares`), bio, faixa de
// stats e seções de conta/acesso. Foto e bio vivem no user_metadata
// (avatar_url, bio); nome/sobrenome também. Senha via re-autenticação.

import { supabase, pegarSessao } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { pegarPapeis } from '../papeis.js';

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_LAPIS  = `<svg ${SVG}><path d="M11.6 2.4a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3 8.1-8.1Z"/><path d="M10.5 3.5l2 2"/></svg>`;
const ICON_CAMERA = `<svg ${SVG}><path d="M2 5.5h2.3l1-1.6h5.4l1 1.6H14v8H2Z"/><circle cx="8" cy="9" r="2.6"/></svg>`;
const ICON_CAL    = `<svg ${SVG}><rect x="2.2" y="3" width="11.6" height="10.8" rx="1.6"/><path d="M2.2 6.3h11.6M5.4 1.6v2.6M10.6 1.6v2.6"/></svg>`;
const ICON_VOLTAR = `<svg ${SVG}><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>`;
const ICON_ESTRELA= `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l2 4.5 5 .5-3.7 3.4 1 4.9L8 12.4l-4.3 2.4 1-4.9L1 6.5l5-.5 2-4.5z"/></svg>`;

export async function renderPerfil() {
  const sessao = await pegarSessao();
  if (!sessao) return;
  const u    = sessao.user;
  const meta = u.user_metadata || {};
  const papeis = await pegarPapeis();

  const nome      = (meta.nome || '').trim();
  const sobrenome = (meta.sobrenome || '').trim();
  const avatarUrl = meta.avatar_url || '';
  const email     = u.email || '';
  const handle    = email.split('@')[0] || 'operador';
  const nomeExib  = [nome, sobrenome].filter(Boolean).join(' ') || handle;
  const inicial   = (nome[0] || handle[0] || '?').toUpperCase();
  const cadastro  = u.created_at;
  const ultimoAcesso = u.last_sign_in_at;

  const ehSuper   = papeis.includes('super_admin');
  const papeisVis = papeis.filter(p => p !== 'super_admin');

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: '',
    conteudo: `
    <main id="main" class="pf">
      <a href="/dashboard" data-link class="pf-voltar">${ICON_VOLTAR} Voltar ao painel</a>

      <article class="pf-card">
        <div class="pf-capa" aria-hidden="true"></div>
        <div class="pf-corpo">
          <div class="pf-topo">
            <button type="button" id="pf-avatar" class="pf-avatar"
                    aria-label="Alterar foto de perfil">
              ${avatarUrl
                ? `<img src="${esc(avatarUrl)}" alt="Foto de ${esc(nomeExib)}" />`
                : esc(inicial)}
              <span class="pf-avatar-cam" aria-hidden="true">
                <span class="pf-avatar-spin"></span>
                ${ICON_CAMERA}
                <span>foto</span>
              </span>
            </button>
            <div class="pf-topo-acoes">
              ${avatarUrl
                ? `<button type="button" id="pf-remover-foto" class="pf-editar"
                     style="border-color:transparent;color:var(--ui-ink-3)">Remover foto</button>`
                : ''}
              <button type="button" id="pf-editar" class="pf-editar">${ICON_LAPIS} Editar perfil</button>
            </div>
          </div>

          <h1 class="pf-nome">${esc(nomeExib)}</h1>
          <div class="pf-linha-id">
            <span class="pf-handle">@${esc(handle)}</span>
            ${ehSuper ? `<span class="pf-papel pf-papel--super">${ICON_ESTRELA} super</span>` : ''}
            ${papeisVis.map(p => `<span class="pf-papel">${esc(rotuloPapel(p))}</span>`).join('')}
          </div>
          <p class="pf-desde">${ICON_CAL} Membro desde ${esc(mesAno(cadastro))}</p>

          <div class="pf-stats">
            <div class="pf-stat">
              <span class="pf-stat-num" id="pf-stat-lanc">…</span>
              <span class="pf-stat-lab">lançamentos</span>
            </div>
            <div class="pf-stat">
              <span class="pf-stat-num" id="pf-stat-anot">…</span>
              <span class="pf-stat-lab">anotações</span>
            </div>
            <div class="pf-stat">
              <span class="pf-stat-num" id="pf-stat-dias">${diasDeConta(cadastro)}</span>
              <span class="pf-stat-lab">dias no caixa boti</span>
            </div>
          </div>
        </div>
      </article>

      <section class="pf-secoes">
        <div class="pf-sec">
          <p class="pf-sec-titulo">Conta</p>
          <div class="pf-linha">
            <div class="pf-linha-meta">
              <p class="pf-linha-rotulo">E-mail</p>
              <p class="pf-linha-valor pf-linha-valor--mono">${esc(email)}</p>
            </div>
          </div>
          <div class="pf-linha">
            <div class="pf-linha-meta">
              <p class="pf-linha-rotulo">Senha</p>
              <p class="pf-linha-valor pf-linha-valor--mono">••••••••</p>
            </div>
            <button type="button" id="pf-senha" class="pf-linha-acao">Alterar</button>
          </div>
        </div>

        <div class="pf-sec">
          <p class="pf-sec-titulo">Acesso</p>
          <div class="pf-linha">
            <div class="pf-linha-meta">
              <p class="pf-linha-rotulo">Papéis</p>
              <p class="pf-linha-valor">${esc(formatarPapeis(papeis))}</p>
            </div>
          </div>
          <div class="pf-linha">
            <div class="pf-linha-meta">
              <p class="pf-linha-rotulo">Conta criada em</p>
              <p class="pf-linha-valor">${esc(dataLonga(cadastro))}</p>
            </div>
          </div>
          ${ultimoAcesso ? `
          <div class="pf-linha">
            <div class="pf-linha-meta">
              <p class="pf-linha-rotulo">Último acesso</p>
              <p class="pf-linha-valor">${esc(dataLonga(ultimoAcesso))}</p>
            </div>
          </div>` : ''}
        </div>
      </section>

      <input type="file" id="pf-file" accept="image/jpeg,image/png,image/webp" hidden />
    </main>
  `,
  });

  ligarShell();
  ligarPerfil(sessao, { nome, sobrenome, email });
  carregarStats(u.id);
}

function ligarPerfil(sessao, dados) {
  document.querySelector('#pf-avatar')?.addEventListener('click', () => {
    document.querySelector('#pf-file')?.click();
  });
  document.querySelector('#pf-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) enviarFoto(file, sessao);
  });
  document.querySelector('#pf-remover-foto')?.addEventListener('click', () => removerFoto(sessao));
  document.querySelector('#pf-editar')?.addEventListener('click', () => abrirEditarPerfil(dados));
  document.querySelector('#pf-senha')?.addEventListener('click', () => abrirModalSenha(dados.email));
}

// ─── Stats ───────────────────────────────────────────────────────────
async function carregarStats(uid) {
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.textContent = String(v); };
  try {
    const { count } = await supabase.from('lancamento')
      .select('id', { count: 'exact', head: true }).eq('criado_por', uid);
    set('#pf-stat-lanc', (count ?? 0).toLocaleString('pt-BR'));
  } catch (_) { set('#pf-stat-lanc', '—'); }
  try {
    const { count } = await supabase.from('lancamento_observacao')
      .select('id', { count: 'exact', head: true }).eq('autor_id', uid);
    set('#pf-stat-anot', (count ?? 0).toLocaleString('pt-BR'));
  } catch (_) { set('#pf-stat-anot', '—'); }
}

// ─── Foto de perfil ──────────────────────────────────────────────────
async function enviarFoto(file, sessao) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    mostrarToast('Use uma imagem JPG, PNG ou WebP.', 'erro', 3800);
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    mostrarToast('A imagem precisa ter no máximo 2 MB.', 'erro', 3800);
    return;
  }

  const av = document.querySelector('#pf-avatar');
  av?.classList.add('is-enviando');

  const uid  = sessao.user.id;
  const path = `${uid}/avatar`;

  const { error: upErr } = await supabase.storage.from('avatares')
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
  if (upErr) {
    av?.classList.remove('is-enviando');
    mostrarToast('Não consegui enviar a foto: ' + upErr.message, 'erro', 4800);
    return;
  }

  const { data: { publicUrl } } = supabase.storage.from('avatares').getPublicUrl(path);
  // ?t= força o navegador a buscar a versão nova (mesma URL, novo conteúdo).
  const url = `${publicUrl}?t=${Date.now()}`;

  const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_url: url } });
  if (metaErr) {
    av?.classList.remove('is-enviando');
    mostrarToast('Foto enviada, mas falhou ao salvar: ' + metaErr.message, 'erro', 4800);
    return;
  }

  mostrarToast('Foto de perfil atualizada.', 'ok', 2400);
  renderPerfil();
}

async function removerFoto(sessao) {
  if (!confirm('Remover sua foto de perfil?')) return;
  const uid = sessao.user.id;
  await supabase.storage.from('avatares').remove([`${uid}/avatar`]).catch(() => {});
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
  if (error) {
    mostrarToast('Não consegui remover a foto: ' + error.message, 'erro', 4000);
    return;
  }
  mostrarToast('Foto removida.', 'ok', 2200);
  renderPerfil();
}

// ─── Editar perfil (nome, sobrenome, bio) ────────────────────────────
function abrirEditarPerfil({ nome, sobrenome }) {
  abrirModal({
    lateral: true,
    eyebrow: 'Perfil',
    titulo:  'Editar perfil.',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-3);margin-bottom:1.3rem;line-height:1.55">
        Como você aparece no Caixa Boti — o nome vai na saudação do painel
        e aqui no seu perfil.
      </p>
      <form id="form-perfil" novalidate>
        <div class="field">
          <label class="field-label" for="pf-in-nome">Nome *</label>
          <input id="pf-in-nome" name="nome" required minlength="2" maxlength="60"
                 class="field-input" autocomplete="given-name" value="${esc(nome)}" />
          <span class="field-underline"></span>
        </div>
        <div class="field">
          <label class="field-label" for="pf-in-sobrenome">Sobrenome</label>
          <input id="pf-in-sobrenome" name="sobrenome" maxlength="80"
                 class="field-input" autocomplete="family-name"
                 placeholder="opcional" value="${esc(sobrenome)}" />
          <span class="field-underline"></span>
        </div>
      </form>
    `,
    rodape: `
      <div id="pf-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="pf-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="form-perfil" id="pf-salvar" class="btn-primary">Salvar</button>
      </div>`,
  });

  setTimeout(() => document.querySelector('#pf-in-nome')?.focus(), 360);
  document.querySelector('#pf-cancelar').addEventListener('click', () => fecharModal(false));

  document.querySelector('#form-perfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nv = document.querySelector('#pf-in-nome').value.trim();
    const sv = document.querySelector('#pf-in-sobrenome').value.trim();
    const erroEl = document.querySelector('#pf-erro');
    const btn = document.querySelector('#pf-salvar');
    erroEl.classList.add('hidden');

    if (nv.length < 2) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'O nome precisa ter ao menos 2 caracteres.';
      return;
    }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    // bio: null limpa qualquer resíduo do recurso de biografia (removido).
    const { error } = await supabase.auth.updateUser({
      data: { nome: nv, sobrenome: sv || null, bio: null },
    });

    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Não foi possível salvar: ' + error.message;
      return;
    }

    fecharModal(true);
    mostrarToast('Perfil atualizado.', 'ok', 2200);
    renderPerfil();
  });
}

// ─── Trocar senha ─────────────────────────────────────────────────────
function abrirModalSenha(email) {
  abrirModal({
    titulo: 'Alterar senha.',
    eyebrow: 'Segurança',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-3);margin-bottom:1.3rem;line-height:1.55">
        Confirme a senha atual e escolha uma nova — mínimo 8 caracteres,
        com letra e número. Sessões abertas em outras abas seguem válidas.
      </p>
      <form id="form-senha" novalidate>
        <div class="field">
          <label class="field-label" for="ps-atual">Senha atual *</label>
          <input id="ps-atual" type="password" required class="field-input" autocomplete="current-password" />
          <span class="field-underline"></span>
        </div>
        <div class="field">
          <label class="field-label" for="ps-nova">Nova senha *</label>
          <input id="ps-nova" type="password" required minlength="8" class="field-input" autocomplete="new-password" />
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
          <input id="ps-conf" type="password" required class="field-input" autocomplete="new-password" />
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
  f('btn-cancel-senha').addEventListener('click', () => fecharModal(false));

  const forcaEl = f('ps-forca'), rotuloEl = f('ps-rotulo'), matchEl = f('ps-match'), btn = f('btn-salvar-senha');

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

  document.querySelector('#form-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erroEl = f('erro-senha');
    erroEl.classList.add('hidden');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error: erroLogin } = await supabase.auth.signInWithPassword({
      email, password: f('ps-atual').value,
    });
    if (erroLogin) {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Senha atual incorreta.';
      f('ps-atual').focus();
      return;
    }

    const { error: erroUpd } = await supabase.auth.updateUser({ password: f('ps-nova').value });
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
  const temLetra = /[a-zA-Z]/.test(senha);
  const temNumero = /\d/.test(senha);
  const temSimbolo = /[^a-zA-Z0-9]/.test(senha);
  const longa = senha.length >= 12;
  if (senha.length < 8) return { nivel: 1, rotulo: 'Fraca — menos de 8 caracteres' };
  if (!temLetra || !temNumero) return { nivel: 1, rotulo: 'Fraca — precisa letra e número' };
  if (longa && temSimbolo) return { nivel: 3, rotulo: 'Forte' };
  if (longa || temSimbolo) return { nivel: 2, rotulo: 'Média' };
  return { nivel: 2, rotulo: 'Média' };
}

function rotuloPapel(p) {
  const map = { admin: 'Admin', operador: 'Operador', supervisor: 'Supervisor',
                auditor: 'Auditor', gerente: 'Gerente', contador: 'Contador' };
  return map[p] || p;
}
function formatarPapeis(papeis) {
  if (!papeis || papeis.length === 0) return 'sem papéis atribuídos';
  return papeis.map(rotuloPapel).sort().join(' · ');
}
function mesAno(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(ts));
}
function dataLonga(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(ts));
}
function diasDeConta(ts) {
  if (!ts) return '—';
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)).toLocaleString('pt-BR');
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
