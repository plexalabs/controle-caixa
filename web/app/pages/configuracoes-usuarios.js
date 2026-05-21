// configuracoes-usuarios.js — /configuracoes/usuarios e /permissoes.
//
// Mescla as duas telas de RBAC numa página só, com DUAS ABAS:
//   • Usuários    — cada pessoa: perfil principal + permissões extras +
//                   toggle de super-admin.
//   • Permissões  — os perfis (RBAC): editar/criar/deletar, checklist de
//                   permissões por módulo, detalhes inline.
//
// Acesso: usuario.visualizar (aba Usuários) · perfil.visualizar (aba
// Permissões). Quem só tem uma vê só aquela aba.

import { supabase, pegarSessao }   from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast }            from '../notifications.js';
import {
  carregarPermissoes, temPermissaoSync, invalidarCachePermissoes,
  limparCachePapeis, listarTodasPermissoes,
} from '../papeis.js';

const MODULOS = {
  caixa: 'Caixa', lancamento: 'Lançamento', vendedora: 'Vendedora',
  usuario: 'Usuário', perfil: 'Perfil', config: 'Configurações',
  relatorio: 'Relatório', notificacao: 'Notificação', arquivamento: 'Arquivamento',
};

const SVG = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const ICON_VOLTAR = `<svg ${SVG}><path d="M9.5 3.5 5 8l4.5 4.5"/></svg>`;
const ICON_MAIS   = `<svg viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
const ICON_USERS  = `<svg ${SVG}><circle cx="6" cy="5.4" r="2.4"/><path d="M1.6 13.4c0-2.5 2-4.1 4.4-4.1s4.4 1.6 4.4 4.1"/><path d="M10.5 3.4a2.3 2.3 0 0 1 0 4.3M11.6 9.5c1.9.4 2.9 1.9 2.9 3.9"/></svg>`;
const ICON_CHAVE  = `<svg ${SVG}><rect x="3" y="7" width="10" height="6.8" rx="1.4"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7"/><circle cx="8" cy="10.3" r="0.9"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Estado
let abaAtual = 'usuarios';
let usuarios = [];
let perfis = [];
let catalogo = [];
let perfilPermsCache = new Map();
let meuUid = null;
let podeVerUsuarios = false;
let podeVerPerfis = false;
let podeCriarPerfil = false;
let podeEditarPerfil = false;
let podeDeletarPerfil = false;

export async function renderUsuarios() {
  await carregarPermissoes();
  podeVerUsuarios = temPermissaoSync('usuario.visualizar');
  podeVerPerfis   = temPermissaoSync('perfil.visualizar');

  // A tela é decidida pelo caminho — /configuracoes/usuarios ou
  // /configuracoes/permissoes. Cada uma é uma tela própria, acessada
  // só pela sidebar de configurações (sem aba no topo).
  abaAtual = location.pathname.endsWith('/permissoes') ? 'permissoes' : 'usuarios';
  const ehPerfis = abaAtual === 'permissoes';
  const podeVer  = ehPerfis ? podeVerPerfis : podeVerUsuarios;

  if (!podeVer) {
    document.querySelector('#app').innerHTML = await renderShell({
      conteudo: `
        <main class="usp">
          <div class="usp-restrito">
            <p class="usp-restrito-title">Acesso restrito</p>
            <p class="usp-restrito-msg">Esta seção é restrita a administradores.</p>
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  podeCriarPerfil   = temPermissaoSync('perfil.criar');
  podeEditarPerfil  = temPermissaoSync('perfil.editar_permissoes');
  podeDeletarPerfil = temPermissaoSync('perfil.deletar');

  const sessao = await pegarSessao();
  meuUid = sessao?.user?.id;

  const titulo = ehPerfis ? 'Perfis e permissões' : 'Usuários';
  const sub = ehPerfis
    ? 'Os perfis de acesso e o que cada um pode ou não fazer no sistema.'
    : 'Quem entra no sistema, com qual perfil e quais permissões extras.';

  document.querySelector('#app').innerHTML = await renderShell({
    conteudo: `
    <main id="main" class="usp">
      <a href="/configuracoes" data-link class="usp-voltar">${ICON_VOLTAR} Configurações</a>

      <header class="usp-header">
        <div class="usp-header-texto">
          <p class="usp-eyebrow">Acessos · RBAC</p>
          <h1 class="usp-title">${titulo}</h1>
          <p class="usp-sub">${sub}</p>
        </div>
        ${(ehPerfis && podeCriarPerfil)
          ? `<button type="button" id="usp-novo" class="usp-novo">${ICON_MAIS} Novo perfil</button>`
          : ''}
      </header>

      <section id="usp-conteudo" aria-live="polite"></section>
    </main>`,
  });

  ligarShell();
  document.querySelector('#usp-novo')?.addEventListener('click', (e) => abrirDrawerPerfil({ modo: 'criar', origemEv: e }));

  // Catálogo + perfis sempre (perfis alimentam o dropdown da edição de
  // usuário); usuários só na tela de Usuários.
  await Promise.all([
    carregarCatalogo(),
    carregarPerfis(),
    ehPerfis ? Promise.resolve() : carregarUsuarios(),
  ]);
  renderAba();
}

function renderAba() {
  if (abaAtual === 'usuarios') renderListaUsuarios();
  else renderListaPerfis();
}

// ════════════════════════════════════════════════════════════════════
// DADOS
// ════════════════════════════════════════════════════════════════════
async function carregarCatalogo() {
  catalogo = await listarTodasPermissoes();
}

async function carregarPerfis() {
  const { data, error } = await supabase.rpc('listar_perfis_com_detalhes');
  if (error) { perfis = []; return; }
  perfis = (data || []).map(p => ({ ...p, total_permissoes: Number(p.total_permissoes), total_usuarios: Number(p.total_usuarios) }));
  perfilPermsCache.clear();
}

async function carregarUsuarios() {
  const { data, error } = await supabase.rpc('listar_usuarios_com_perfis_e_extras');
  usuarios = error ? [] : (data || []);
}

// ════════════════════════════════════════════════════════════════════
// ABA USUÁRIOS
// ════════════════════════════════════════════════════════════════════
function renderListaUsuarios() {
  const slot = document.querySelector('#usp-conteudo');
  if (!slot) return;
  if (usuarios.length === 0) {
    slot.innerHTML = vazioHtml(ICON_USERS, 'Nenhum usuário cadastrado.',
      'Os usuários entram pelo cadastro de acesso ao sistema.');
    return;
  }
  slot.innerHTML = `<ul class="usp-lista" role="list">${usuarios.map(cardUsuario).join('')}</ul>`;
  slot.querySelectorAll('.usp-user-cabec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const u = usuarios.find(x => x.usuario_id === btn.dataset.usId);
      if (u) abrirDrawerUsuario(u, e);
    });
  });
}

function cardUsuario(u, i) {
  const ehEu = u.usuario_id === meuUid;
  const inicial = (u.email || '?').charAt(0).toUpperCase();
  const perfilTxt = u.perfil_nome
    ? `<strong>${esc(u.perfil_nome)}</strong>`
    : '<span class="usp-sem">sem perfil</span>';
  const n = Number(u.total_extras) || 0;
  const extrasTxt = n === 0 ? 'sem extras' : `${n} extra${n > 1 ? 's' : ''}`;
  return `
    <li class="usp-user usp-fade" data-super="${!!u.e_super_admin}"
        style="animation-delay:${Math.min(i * 40, 320)}ms">
      <button type="button" class="usp-user-cabec" data-us-id="${esc(u.usuario_id)}"
              aria-label="Abrir acesso de ${esc(u.email)}">
        <span class="usp-user-avatar" aria-hidden="true">${esc(inicial)}</span>
        <span class="usp-user-corpo">
          <span class="usp-user-topo">
            <span class="usp-user-email">${esc(u.email)}</span>
            ${u.e_super_admin ? '<span class="usp-badge usp-badge--super">super</span>' : ''}
            ${ehEu ? '<span class="usp-badge usp-badge--eu">você</span>' : ''}
          </span>
          <span class="usp-user-meta">
            ${perfilTxt} <span class="usp-perfil-sep">·</span> ${extrasTxt}
            <span class="usp-perfil-sep">·</span> desde ${esc(formatarData(u.criado_em))}
          </span>
        </span>
        <span class="usp-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
      </button>
    </li>`;
}

async function abrirDrawerUsuario(u, origemEv) {
  const podeAtribuir = temPermissaoSync('usuario.atribuir_perfil');
  const podeExtra    = temPermissaoSync('usuario.conceder_extra');
  const ehEu         = u.usuario_id === meuUid;
  const inicial      = (u.email || '?').charAt(0).toUpperCase();

  const optionsPerfis = perfis.map(p =>
    `<option value="${esc(p.id)}" ${u.perfil_id === p.id ? 'selected' : ''}>${esc(p.nome)} (${p.total_permissoes} perm.)</option>`
  ).join('');

  abrirModal({
    amplo: true,
    origemEvento: origemEv || null,
    eyebrow: ehEu ? 'Editando você' : 'Usuário · RBAC',
    titulo: 'Editar acesso.',
    conteudo: `
      <div class="usp-modal">
        <div class="usp-modal-split">
          <aside class="usp-modal-aside">
            <div class="usp-modal-preview">
              <div class="usp-modal-av" data-super="${!!u.e_super_admin}">${esc(inicial)}</div>
              <p class="usp-modal-prev-nome">${esc(u.email)}</p>
              <p class="usp-modal-prev-sub">Cadastrado em ${esc(formatarData(u.criado_em))}</p>
              <div class="usp-modal-prev-badges">
                ${u.e_super_admin ? '<span class="usp-badge usp-badge--super">super</span>' : ''}
                ${ehEu ? '<span class="usp-badge usp-badge--eu">você</span>' : ''}
              </div>
            </div>
            <div class="usp-modal-nota">
              <p class="usp-modal-nota-titulo">Perfil e extras</p>
              <p class="usp-modal-nota-txt">
                O perfil dá o conjunto base de permissões. As extras são
                liberações pontuais por cima — cada uma com motivo,
                registrado na auditoria.
              </p>
            </div>
          </aside>

          <div class="usp-modal-corpo">
            <div class="usp-sec">
              <p class="usp-sec-titulo">Super-administrador</p>
              <div class="mel-retirada-toggle-bloco">
                <label class="mel-toggle">
                  <input type="checkbox" id="us-toggle-super" ${u.e_super_admin ? 'checked' : ''}>
                  <span class="mel-toggle-pill"><span class="mel-toggle-dot"></span></span>
                  <span>
                    <span class="mel-toggle-title">${u.e_super_admin ? 'É super-admin' : 'Não é super-admin'}</span>
                    <span class="mel-toggle-sub">Bypass total — pode tudo, sem checagem de permissão.${ehEu ? ' Você não pode revogar o seu próprio.' : ''}</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="usp-sec">
              <p class="usp-sec-titulo">Perfil principal</p>
              <div class="field" style="margin-bottom:0">
                <label class="field-label" for="us-perfil-select">Perfil</label>
                <select id="us-perfil-select" class="field-input" ${podeAtribuir ? '' : 'disabled'}>
                  <option value="">— escolha um perfil —</option>
                  ${optionsPerfis}
                </select>
                <span class="field-underline"></span>
                <p class="usp-hint">${u.e_super_admin
                  ? 'Super-admins têm bypass total — o perfil é apenas informativo.'
                  : 'O perfil define as permissões base. Ajustes pontuais via extras abaixo.'}</p>
              </div>
            </div>

            <div class="usp-sec">
              <p class="usp-sec-titulo" style="display:flex;align-items:center;justify-content:space-between">
                Permissões extras
                ${podeExtra ? `<button type="button" id="us-add-extra" class="usp-btn">+ Adicionar</button>` : ''}
              </p>
              <div id="us-extras-lista"><div class="usp-skel-item" style="height:3rem"></div></div>
            </div>
          </div>
        </div>
      </div>
    `,
    rodape: `
      <div id="us-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="us-fechar" class="btn-link">Fechar</button>
      </div>`,
  });

  document.querySelector('#us-fechar').addEventListener('click', () => fecharModal(true));

  const toggle = document.querySelector('#us-toggle-super');
  toggle.addEventListener('change', (ev) => {
    if (ev.target.checked === u.e_super_admin) return;
    if (ev.target.checked) {
      ev.target.checked = false;
      modalPromoverSuper(u, async () => { ev.target.checked = true; await aplicarSuper(u, true); });
    } else {
      ev.target.checked = true;
      modalRevogarSuper(u, async () => { ev.target.checked = false; await aplicarSuper(u, false); });
    }
  });

  const select = document.querySelector('#us-perfil-select');
  if (podeAtribuir) {
    select.addEventListener('change', async () => {
      const novoId = select.value;
      if (!novoId || novoId === u.perfil_id) return;
      const erroEl = document.querySelector('#us-erro');
      erroEl.classList.add('hidden');
      const { error } = await supabase.rpc('atribuir_perfil_usuario', {
        p_usuario_id: u.usuario_id, p_perfil_id: novoId,
      });
      if (error) {
        erroEl.textContent = traduzirErro(error);
        erroEl.classList.remove('hidden');
        select.value = u.perfil_id || '';
        return;
      }
      const np = perfis.find(p => p.id === novoId);
      u.perfil_id = novoId;
      u.perfil_nome = np?.nome || '';
      mostrarToast('Perfil atualizado.', 'ok', 2400);
      if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
      renderListaUsuarios();
    });
  }

  if (podeExtra) {
    document.querySelector('#us-add-extra').addEventListener('click', () => modalAdicionarExtra(u));
  }
  await renderExtras(u, podeExtra);
}

async function renderExtras(u, podeExtra) {
  const cont = document.querySelector('#us-extras-lista');
  if (!cont) return;
  const { data, error } = await supabase.rpc('listar_extras_de_usuario', { p_usuario_id: u.usuario_id });
  if (error) { cont.innerHTML = `<p class="usp-erro">${esc(error.message)}</p>`; return; }
  const extras = data || [];
  if (extras.length === 0) {
    cont.innerHTML = `<p class="usp-extra-vazio">Sem permissões extras — só as do perfil.</p>`;
    return;
  }
  cont.innerHTML = extras.map(e => `
    <div class="usp-extra">
      <div class="usp-extra-cabec">
        <code class="usp-codigo">${esc(e.permissao_codigo)}</code>
        ${podeExtra ? `<button type="button" class="usp-extra-revogar" data-codigo="${esc(e.permissao_codigo)}">Revogar</button>` : ''}
      </div>
      <p class="usp-extra-desc">${esc(e.descricao || '')}</p>
      ${e.motivo ? `<p class="usp-extra-motivo">“${esc(e.motivo)}”</p>` : ''}
      <p class="usp-extra-rodape">Concedida em ${esc(formatarData(e.concedido_em))}${e.concedido_por_email ? ` · por ${esc(e.concedido_por_email)}` : ''}</p>
    </div>`).join('');

  if (podeExtra) {
    cont.querySelectorAll('.usp-extra-revogar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { error } = await supabase.rpc('revogar_permissao_extra', {
          p_usuario_id: u.usuario_id, p_codigo: btn.dataset.codigo,
        });
        if (error) { mostrarToast(traduzirErro(error), 'erro', 4000); return; }
        u.total_extras = Math.max(0, Number(u.total_extras) - 1);
        if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
        mostrarToast('Permissão revogada.', 'ok', 2400);
        renderListaUsuarios();
        await renderExtras(u, podeExtra);
      });
    });
  }
}

async function modalAdicionarExtra(u) {
  const permsPerfil = u.perfil_id ? new Set(await carregarPermsDoPerfil(u.perfil_id)) : new Set();
  const { data: jaExtras } = await supabase
    .from('usuario_permissao_extra').select('permissao_codigo').eq('usuario_id', u.usuario_id);
  const setExtras = new Set((jaExtras || []).map(e => e.permissao_codigo));
  const candidatos = catalogo.filter(p => !permsPerfil.has(p.codigo) && !setExtras.has(p.codigo));

  if (candidatos.length === 0) {
    mostrarToast('Este usuário já tem todas as permissões disponíveis.', 'info', 3500);
    return;
  }

  const porMod = new Map();
  for (const p of candidatos) {
    if (!porMod.has(p.modulo)) porMod.set(p.modulo, []);
    porMod.get(p.modulo).push(p);
  }
  const optgroups = [...porMod.entries()].map(([mod, itens]) => `
    <optgroup label="${esc(MODULOS[mod] || mod)}">
      ${itens.map(p => `<option value="${esc(p.codigo)}">${esc(p.codigo)} — ${esc(p.descricao)}</option>`).join('')}
    </optgroup>`).join('');

  abrirModal({
    empilhar: true,
    eyebrow: 'Permissão extra',
    titulo: 'Conceder permissão.',
    conteudo: `
      <p class="text-body" style="font-size:0.88rem;color:var(--ui-ink-3);line-height:1.55;margin-bottom:1.1rem">
        Uma permissão pontual ALÉM do perfil de
        <strong style="color:var(--ui-ink);font-weight:700">${esc(u.email)}</strong>.
        O motivo fica registrado na auditoria.
      </p>
      <form id="us-extra-form" novalidate>
        <div class="field">
          <label class="field-label" for="us-extra-codigo">Permissão *</label>
          <select id="us-extra-codigo" class="field-input" required>
            <option value="">— escolha uma permissão —</option>
            ${optgroups}
          </select>
          <span class="field-underline"></span>
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="us-extra-motivo">Motivo *
            <span style="font-weight:400;color:var(--ui-ink-3);font-size:0.82rem">(mínimo 10 caracteres)</span>
          </label>
          <textarea id="us-extra-motivo" class="field-input" required minlength="10" maxlength="500"
                    rows="3" style="resize:vertical"
                    placeholder="ex.: precisa exportar relatórios na ausência do contador"></textarea>
          <span class="field-underline"></span>
        </div>
      </form>`,
    rodape: `
      <div id="us-extra-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="us-extra-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="us-extra-form" id="us-extra-conceder" class="btn-primary">Conceder</button>
      </div>`,
  });

  document.querySelector('#us-extra-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#us-extra-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const codigo = document.querySelector('#us-extra-codigo').value;
    const motivo = document.querySelector('#us-extra-motivo').value.trim();
    const erroEl = document.querySelector('#us-extra-erro');
    const btn = document.querySelector('#us-extra-conceder');
    erroEl.classList.add('hidden');
    if (!codigo) { erroEl.textContent = 'Escolha uma permissão.'; erroEl.classList.remove('hidden'); return; }
    if (motivo.length < 10) { erroEl.textContent = 'O motivo precisa ter ao menos 10 caracteres.'; erroEl.classList.remove('hidden'); return; }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    const { error } = await supabase.rpc('conceder_permissao_extra', {
      p_usuario_id: u.usuario_id, p_codigo: codigo, p_motivo: motivo,
    });
    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      erroEl.textContent = traduzirErro(error);
      erroEl.classList.remove('hidden');
      return;
    }
    u.total_extras = Number(u.total_extras) + 1;
    if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
    fecharModal(true);
    mostrarToast('Permissão extra concedida.', 'ok', 2800);
    renderListaUsuarios();
    await renderExtras(u, true);
  });
}

function modalPromoverSuper(u, onConfirmar) {
  abrirModal({
    empilhar: true,
    eyebrow: 'Super-administrador',
    titulo: 'Promover a super-admin?',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-2);line-height:1.6">
        Super-admin tem <strong style="color:var(--ui-ink)">bypass total</strong>: pode tudo,
        sem checagem de permissão, e pode promover ou revogar outros super-admins.
      </p>
      <p class="text-body" style="margin-top:0.7rem;font-size:0.84rem;color:var(--ui-ink-3);line-height:1.5">
        Para confirmar, digite o e-mail de
        <strong style="color:var(--ui-ink)">${esc(u.email)}</strong>:
      </p>
      <div class="field" style="margin-top:0.85rem;margin-bottom:0">
        <input id="us-super-confirm" type="text" autocomplete="off" class="field-input"
               placeholder="${esc(u.email)}">
        <span class="field-underline"></span>
      </div>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="us-super-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="us-super-confirmar" class="btn-primary" disabled>Promover</button>
      </div>`,
  });
  const inp = document.querySelector('#us-super-confirm');
  const btn = document.querySelector('#us-super-confirmar');
  inp.addEventListener('input', () => { btn.disabled = inp.value !== u.email; });
  setTimeout(() => inp.focus(), 220);
  document.querySelector('#us-super-cancelar').addEventListener('click', () => fecharModal(false));
  btn.addEventListener('click', async () => {
    if (inp.value !== u.email) return;
    fecharModal(true);
    await onConfirmar();
  });
}

function modalRevogarSuper(u, onConfirmar) {
  abrirModal({
    empilhar: true,
    eyebrow: 'Super-administrador',
    titulo: 'Revogar super-admin?',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-2);line-height:1.6">
        <strong style="color:var(--ui-ink);font-weight:700">${esc(u.email)}</strong>
        deixa de ter bypass total — segue com o perfil principal e as extras.
      </p>
      <p class="text-body" style="margin-top:0.7rem;font-size:0.84rem;color:var(--ui-ink-3);line-height:1.5">
        O sistema bloqueia se for o último super-admin ativo, ou se for você mesmo.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="us-rev-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="us-rev-confirmar" class="btn-primary"
                style="background:var(--ui-danger);border-color:var(--ui-danger);box-shadow:none">Revogar</button>
      </div>`,
  });
  document.querySelector('#us-rev-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#us-rev-confirmar').addEventListener('click', async () => {
    fecharModal(true);
    await onConfirmar();
  });
}

async function aplicarSuper(u, promover) {
  const { error } = await supabase.rpc(promover ? 'promover_super_admin' : 'revogar_super_admin',
    { p_usuario_id: u.usuario_id });
  if (error) { mostrarToast(traduzirErro(error), 'erro', 4500); return; }
  u.e_super_admin = promover;
  if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
  mostrarToast(promover ? `${u.email} agora é super-admin.` : `Super-admin revogado de ${u.email}.`, 'ok', 2800);
  renderListaUsuarios();
}

// ════════════════════════════════════════════════════════════════════
// ABA PERMISSÕES (perfis)
// ════════════════════════════════════════════════════════════════════
function renderListaPerfis() {
  const slot = document.querySelector('#usp-conteudo');
  if (!slot) return;
  if (perfis.length === 0) {
    slot.innerHTML = vazioHtml(ICON_CHAVE, 'Nenhum perfil cadastrado.',
      podeCriarPerfil ? 'Crie o primeiro pelo botão “Novo perfil”.' : 'Nenhum perfil disponível.');
    return;
  }
  slot.innerHTML = `<ul class="usp-lista" role="list">${perfis.map(cardPerfil).join('')}</ul>`;
  ligarPerfis(slot);
}

function cardPerfil(p, i) {
  const badge = p.e_sistema
    ? '<span class="usp-badge usp-badge--sistema">sistema</span>'
    : '<span class="usp-badge usp-badge--custom">custom</span>';
  return `
    <li class="usp-perfil usp-fade" style="animation-delay:${Math.min(i * 40, 320)}ms">
      <button type="button" class="usp-perfil-cabec" data-pf-id="${esc(p.id)}"
              aria-label="Abrir perfil ${esc(p.nome)}">
        <span class="usp-perfil-topo">
          <span class="usp-perfil-id">
            <span class="usp-perfil-nome">${esc(p.nome)}</span>
            ${badge}
          </span>
          <span class="usp-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
        </span>
        <span class="usp-perfil-meta">
          <strong>${p.total_permissoes}</strong> ${p.total_permissoes === 1 ? 'permissão' : 'permissões'}
          <span class="usp-perfil-sep">·</span>
          <strong>${p.total_usuarios}</strong> ${p.total_usuarios === 1 ? 'usuário' : 'usuários'}
        </span>
        ${p.descricao ? `<span class="usp-perfil-desc">${esc(p.descricao)}</span>` : ''}
      </button>
    </li>`;
}

function ligarPerfis(slot) {
  slot.querySelectorAll('.usp-perfil-cabec').forEach(btn => {
    const p = perfis.find(x => x.id === btn.dataset.pfId);
    if (p) btn.addEventListener('click', (e) => abrirDrawerEditarPerfil(p, e));
  });
}

async function abrirDrawerEditarPerfil(p, origemEv) {
  const perms = await carregarPermsDoPerfil(p.id);
  abrirDrawerPerfil({ modo: 'editar', perfil: p, permsAtuais: perms, origemEv });
}

function abrirDrawerPerfil({ modo, perfil = null, permsAtuais = [], origemEv = null }) {
  const eEdicao = modo === 'editar';
  const permsSet = new Set(permsAtuais);
  const porMod = agruparCatalogo();

  const camposIdent = eEdicao
    ? `<div class="usp-readonly">
         <p class="usp-readonly-rotulo">Código</p>
         <p class="usp-readonly-valor"><code class="usp-codigo">${esc(perfil.codigo)}</code></p>
       </div>`
    : `<div class="field">
         <label class="field-label" for="pf-codigo">Código *</label>
         <input id="pf-codigo" type="text" required minlength="2" maxlength="40" autocomplete="off"
                pattern="^[a-z_]+$" placeholder="ex.: admin_pleno" class="field-input"
                style="font-family:'Manrope',monospace">
         <span class="field-underline"></span>
         <p class="usp-hint">snake_case minúsculo. Imutável após criar.</p>
       </div>
       <div class="field">
         <label class="field-label" for="pf-nome">Nome *</label>
         <input id="pf-nome" type="text" required minlength="2" maxlength="80" autocomplete="off"
                placeholder="ex.: Admin Pleno" class="field-input">
         <span class="field-underline"></span>
       </div>
       <div class="field">
         <label class="field-label" for="pf-descricao">Descrição</label>
         <textarea id="pf-descricao" maxlength="200" rows="3" class="field-input"
                   style="resize:vertical" placeholder="para que serve este perfil"></textarea>
         <span class="field-underline"></span>
       </div>`;

  const folds = Object.entries(MODULOS).map(([cod, rotulo]) => {
    const itens = porMod.get(cod) || [];
    if (itens.length === 0) return '';
    const marc = itens.filter(p => permsSet.has(p.codigo)).length;
    return `
      <details class="usp-fold" ${marc > 0 ? 'open' : ''}>
        <summary class="usp-fold-sum">
          <span>${esc(rotulo)}</span>
          <span class="usp-fold-cont" data-mod-cont="${esc(cod)}">${marc}/${itens.length}</span>
        </summary>
        <ul class="usp-perms">
          ${itens.map(p => `<li>
            <label class="usp-perm">
              <input type="checkbox" name="permissoes" value="${esc(p.codigo)}" data-mod="${esc(cod)}"
                     ${permsSet.has(p.codigo) ? 'checked' : ''}>
              <span class="usp-perm-corpo">
                <code class="usp-codigo">${esc(p.codigo)}</code>
                <span class="usp-perm-desc">${esc(p.descricao)}</span>
              </span>
              ${p.destrutiva ? '<span class="usp-badge usp-badge--destrutiva">destrutiva</span>' : ''}
            </label>
          </li>`).join('')}
        </ul>
      </details>`;
  }).filter(Boolean).join('');

  const previewNome   = eEdicao ? esc(perfil.nome) : 'Nome do perfil';
  const previewCodigo = eEdicao ? esc(perfil.codigo) : '';

  abrirModal({
    amplo: true,
    origemEvento: origemEv || null,
    eyebrow: eEdicao ? (perfil.e_sistema ? 'Perfil de sistema · só permissões' : 'Perfil custom') : 'Novo perfil',
    titulo: eEdicao ? 'Editar perfil.' : 'Criar perfil.',
    conteudo: `
      <div class="usp-modal">
        <div class="usp-modal-split">
          <aside class="usp-modal-aside">
            <div class="usp-modal-preview">
              <div class="usp-modal-av">${ICON_CHAVE}</div>
              <p class="usp-modal-prev-nome ${eEdicao ? '' : 'is-vazio'}" id="pf-prev-nome">${previewNome}</p>
              <p class="usp-modal-prev-sub" id="pf-prev-codigo">${previewCodigo}</p>
            </div>
            <div class="usp-modal-metrica">
              <span class="usp-modal-metrica-num" id="pf-prev-count">${permsSet.size}</span>
              <span class="usp-modal-metrica-lab">permissões marcadas</span>
            </div>
            <div class="usp-modal-nota">
              <p class="usp-modal-nota-titulo">Como funciona</p>
              <p class="usp-modal-nota-txt">
                Cada permissão liga ou desliga uma ação real do sistema.
                As destrutivas afetam dados que já existem — marque com cuidado.
              </p>
            </div>
          </aside>

          <div class="usp-modal-corpo">
            <form id="pf-form" novalidate>
              <div class="usp-sec">
                <p class="usp-sec-titulo">Identidade</p>
                ${camposIdent}
              </div>
              <div class="usp-sec">
                <p class="usp-sec-titulo">Permissões</p>
                <p class="usp-hint" style="margin:0 0 0.7rem">
                  Marque o que este perfil pode fazer. Itens
                  <span class="usp-badge usp-badge--destrutiva">destrutiva</span> afetam dados existentes.
                </p>
                ${folds}
              </div>
            </form>
          </div>
        </div>
      </div>`,
    rodape: `
      <div id="pf-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <div>
          ${(eEdicao && !perfil.e_sistema && podeDeletarPerfil && Number(perfil.total_usuarios) === 0)
            ? `<button type="button" id="pf-deletar" class="btn-link" style="color:var(--ui-danger)">Deletar perfil</button>`
            : ''}
        </div>
        <div style="display:flex;align-items:center;gap:0.55rem">
          <button type="button" id="pf-cancelar" class="btn-link">Cancelar</button>
          <button type="submit" form="pf-form" id="pf-salvar" class="btn-primary">${eEdicao ? 'Salvar' : 'Criar perfil'}</button>
        </div>
      </div>`,
  });

  document.querySelector('#pf-cancelar').addEventListener('click', () => fecharModal(true));
  document.querySelector('#pf-deletar')?.addEventListener('click', () => modalDeletarPerfil(perfil));

  const prevCount = document.querySelector('#pf-prev-count');
  document.querySelectorAll('input[name="permissoes"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const mod = inp.dataset.mod;
      const itens = porMod.get(mod) || [];
      const marc = itens.filter(p =>
        document.querySelector(`input[name="permissoes"][value="${cssEscape(p.codigo)}"]`)?.checked).length;
      const cont = document.querySelector(`[data-mod-cont="${cssEscape(mod)}"]`);
      if (cont) cont.textContent = `${marc}/${itens.length}`;
      if (prevCount) prevCount.textContent = String(document.querySelectorAll('input[name="permissoes"]:checked').length);
    });
  });

  // Preview ao vivo — nome e código acompanham o que se digita (criação).
  const pfNome = document.querySelector('#pf-nome');
  if (pfNome) {
    pfNome.addEventListener('input', () => {
      const prev = document.querySelector('#pf-prev-nome');
      const v = pfNome.value.trim();
      prev.textContent = v || 'Nome do perfil';
      prev.classList.toggle('is-vazio', !v);
    });
  }
  const pfCodigo = document.querySelector('#pf-codigo');
  if (pfCodigo) {
    pfCodigo.addEventListener('input', () => {
      document.querySelector('#pf-prev-codigo').textContent = pfCodigo.value.trim();
    });
  }

  document.querySelector('#pf-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = document.querySelector('#pf-erro');
    const btn = document.querySelector('#pf-salvar');
    erroEl.classList.add('hidden');
    const permsSel = [...document.querySelectorAll('input[name="permissoes"]:checked')].map(i => i.value);

    if (eEdicao) {
      await salvarEdicaoPerfil(perfil, permsSel, btn, erroEl);
    } else {
      const codigo = document.querySelector('#pf-codigo').value.trim().toLowerCase();
      const nome = document.querySelector('#pf-nome').value.trim();
      const descricao = document.querySelector('#pf-descricao').value.trim();
      if (!/^[a-z_]+$/.test(codigo)) {
        erroEl.textContent = 'Código deve ser snake_case minúsculo (ex.: admin_pleno).';
        erroEl.classList.remove('hidden'); return;
      }
      if (!nome) { erroEl.textContent = 'Nome obrigatório.'; erroEl.classList.remove('hidden'); return; }
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      const { error } = await supabase.rpc('criar_perfil', {
        p_codigo: codigo, p_nome: nome, p_descricao: descricao || null, p_permissoes: permsSel,
      });
      btn.removeAttribute('aria-busy');
      if (error) { btn.disabled = false; erroEl.textContent = traduzirErro(error); erroEl.classList.remove('hidden'); return; }
      fecharModal(true);
      invalidarCachePermissoes();
      mostrarToast(`Perfil “${nome}” criado.`, 'ok', 2800);
      await recarregarPerfis();
    }
  });
}

async function salvarEdicaoPerfil(perfil, permsSel, btn, erroEl) {
  if (Number(perfil.total_usuarios) > 0) {
    const us = await carregarUsuariosDoPerfil(perfil.id);
    modalConfirmarEdicao(perfil, us, () => aplicarEdicaoPerfil(perfil, permsSel, btn, erroEl));
    return;
  }
  await aplicarEdicaoPerfil(perfil, permsSel, btn, erroEl);
}

async function aplicarEdicaoPerfil(perfil, permsSel, btn, erroEl) {
  btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
  const { error } = await supabase.rpc('atualizar_permissoes_perfil', {
    p_perfil_id: perfil.id, p_permissoes: permsSel,
  });
  btn.removeAttribute('aria-busy');
  if (error) { btn.disabled = false; erroEl.textContent = traduzirErro(error); erroEl.classList.remove('hidden'); return; }
  perfilPermsCache.delete(perfil.id);
  invalidarCachePermissoes();
  fecharModal(true);
  mostrarToast(`Permissões de “${perfil.nome}” atualizadas.`, 'ok', 2800);
  await recarregarPerfis();
}

function modalConfirmarEdicao(perfil, us, onConfirmar) {
  const lista = us.slice(0, 8).map(u => `<li>${esc(u.email)}</li>`).join('');
  abrirModal({
    empilhar: true,
    eyebrow: 'Confirmar',
    titulo: 'Aplicar a quem usa o perfil?',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-2);line-height:1.6">
        As novas permissões de
        <strong style="color:var(--ui-ink);font-weight:700">${esc(perfil.nome)}</strong>
        valem na hora para <strong>${us.length} usuário${us.length > 1 ? 's' : ''}</strong>:
      </p>
      <ul class="usp-det-users" style="margin-top:0.8rem">
        ${lista}${us.length > 8 ? `<li>e mais ${us.length - 8}…</li>` : ''}
      </ul>
      <p class="text-body" style="margin-top:0.9rem;font-size:0.82rem;color:var(--ui-ink-3);line-height:1.5">
        Permissões extras pontuais não são afetadas.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="pf-conf-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="pf-conf-aplicar" class="btn-primary">Aplicar mudanças</button>
      </div>`,
  });
  document.querySelector('#pf-conf-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#pf-conf-aplicar').addEventListener('click', async () => {
    fecharModal(true);
    await onConfirmar();
  });
}

function modalDeletarPerfil(perfil) {
  abrirModal({
    empilhar: true,
    eyebrow: 'Perfil',
    titulo: 'Deletar perfil?',
    conteudo: `
      <p class="text-body" style="font-size:0.9rem;color:var(--ui-ink-2);line-height:1.6">
        <strong style="color:var(--ui-ink);font-weight:700">${esc(perfil.nome)}</strong>
        sai do sistema, e as permissões associadas são desfeitas.
      </p>
      <p class="text-body" style="margin-top:0.7rem;font-size:0.84rem;color:var(--ui-ink-3);line-height:1.5">
        Para confirmar, digite o nome exato do perfil:
      </p>
      <div class="field" style="margin-top:0.85rem;margin-bottom:0">
        <input id="pf-del-confirm" type="text" autocomplete="off" class="field-input"
               placeholder="${esc(perfil.nome)}">
        <span class="field-underline"></span>
      </div>`,
    rodape: `
      <div id="pf-del-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="pf-del-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="pf-del-confirmar" class="btn-primary" disabled
                style="background:var(--ui-danger);border-color:var(--ui-danger);box-shadow:none">Deletar perfil</button>
      </div>`,
  });
  const inp = document.querySelector('#pf-del-confirm');
  const btn = document.querySelector('#pf-del-confirmar');
  inp.addEventListener('input', () => { btn.disabled = inp.value !== perfil.nome; });
  setTimeout(() => inp.focus(), 220);
  document.querySelector('#pf-del-cancelar').addEventListener('click', () => fecharModal(false));
  btn.addEventListener('click', async () => {
    if (inp.value !== perfil.nome) return;
    btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    const { error } = await supabase.rpc('deletar_perfil', { p_perfil_id: perfil.id });
    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      const erroEl = document.querySelector('#pf-del-erro');
      erroEl.textContent = traduzirErro(error);
      erroEl.classList.remove('hidden');
      return;
    }
    fecharModal(true);   // fecha o modal de confirmação
    fecharModal(true);   // e o modal de edição do perfil (já deletado)
    invalidarCachePermissoes();
    mostrarToast(`Perfil “${perfil.nome}” deletado.`, 'ok', 2800);
    await recarregarPerfis();
  });
}

async function recarregarPerfis() {
  await carregarPerfis();
  atualizarContadores();
  if (abaAtual === 'permissoes') renderListaPerfis();
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════
function vazioHtml(icone, titulo, msg) {
  return `
    <div class="usp-vazio">
      <div class="usp-vazio-icone" aria-hidden="true">${icone}</div>
      <p class="usp-vazio-title">${esc(titulo)}</p>
      <p class="usp-vazio-msg">${esc(msg)}</p>
    </div>`;
}

async function carregarPermsDoPerfil(perfilId) {
  if (perfilPermsCache.has(perfilId)) return perfilPermsCache.get(perfilId);
  const { data, error } = await supabase
    .from('perfil_permissao').select('permissao_codigo').eq('perfil_id', perfilId);
  if (error) return [];
  const arr = (data || []).map(r => r.permissao_codigo);
  perfilPermsCache.set(perfilId, arr);
  return arr;
}

async function carregarUsuariosDoPerfil(perfilId) {
  const { data, error } = await supabase.rpc('listar_usuarios_afetados_por_perfil', { p_perfil_id: perfilId });
  return error ? [] : (data || []);
}

function agruparCatalogo() {
  const m = new Map();
  for (const p of catalogo) {
    if (!m.has(p.modulo)) m.set(p.modulo, []);
    m.get(p.modulo).push(p);
  }
  return m;
}

function traduzirErro(error) {
  const m = (error.message || '').toLowerCase();
  if (m.includes('permissao negada') || m.includes('apenas super_admin'))
    return 'Você não tem permissão para esta ação.';
  if (m.includes('motivo obrigatorio')) return 'Motivo obrigatório (mínimo 10 caracteres).';
  if (m.includes('pelo menos 1 super_admin'))
    return 'O sistema precisa de ao menos 1 super-admin ativo. Promova outro antes.';
  if (m.includes('proprio super_admin'))
    return 'Você não pode revogar seu próprio super-admin — peça a outro super-admin.';
  if (m.includes('duplicate key') || m.includes('unique'))
    return 'Já existe um perfil com esse código.';
  if (m.includes('codigo deve ser snake_case'))
    return 'Código deve ser snake_case minúsculo (ex.: admin_pleno).';
  if (m.includes('perfis de sistema')) return 'Perfis de sistema não podem ser deletados.';
  if (m.includes('perfil tem')) return error.message;
  if (m.includes('nao encontrad')) return 'Registro não encontrado. Recarregue a página.';
  return error.message || 'Erro inesperado.';
}

function formatarData(ts) {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(ts));
  } catch { return String(ts); }
}
function formatarDataHora(ts) {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts));
  } catch { return String(ts); }
}
function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
