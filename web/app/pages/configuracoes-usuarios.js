// configuracoes-usuarios.js — Quem entra no caderno + suas permissões.
// CP-RBAC Sessão 5 (FINAL): troca o fluxo legacy de "papel" por
// atribuição de PERFIL principal + permissões EXTRAS pontuais.
//
// Acesso: usuario.visualizar (admin/gerente/super_admin).
// Edição: usuario.atribuir_perfil + usuario.conceder_extra (apenas super_admin
//         no desenho atual).
// Toggle super_admin: só super_admin existente promove/revoga (RPC valida).

import { supabase, pegarSessao }     from '../supabase.js';
import { renderShell, ligarShell }   from '../shell.js';
import { abrirModal, fecharModal }   from '../../components/modal.js';
import { mostrarToast }              from '../notifications.js';
import {
  carregarPermissoes,
  temPermissaoSync,
  invalidarCachePermissoes,
  limparCachePapeis,
  listarTodasPermissoes,
} from '../papeis.js';

// Estado da tela
let usuarios = [];           // [{ usuario_id, email, e_super_admin, perfil_id, perfil_nome, perfil_codigo, total_extras, criado_em }]
let perfisDisponiveis = [];  // [{ id, codigo, nome, total_permissoes }]
let catalogo = [];           // [{ codigo, modulo, descricao, destrutiva }]
let perfilPermsCache = new Map(); // perfilId -> [codigos]
let meuUid = null;

const MODULOS = {
  caixa:        'Caixa',
  lancamento:   'Lançamento',
  vendedora:    'Vendedora',
  usuario:      'Usuário',
  perfil:       'Perfil',
  config:       'Configurações',
  relatorio:    'Relatório',
  notificacao:  'Notificação',
  arquivamento: 'Arquivamento',
};

export async function renderUsuarios() {
  await carregarPermissoes();
  if (!temPermissaoSync('usuario.visualizar')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'config',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
          <div class="alert mt-6">Esta seção é restrita a administradores.</div>
        </main>`,
    });
    ligarShell();
    return;
  }

  const sessao = await pegarSessao();
  meuUid = sessao?.user?.id;

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2" data-etiqueta="ADMIN">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Acessos · RBAC</p>
          <h1 class="tela-cabec-titulo">Usuários e suas permissões.</h1>
          <p class="tela-cabec-sub">
            Cada pessoa tem 1 perfil principal e pode receber permissões
            extras pontuais. Super-admins ficam acima de qualquer checagem.
          </p>
        </div>
      </header>

      <section id="us-lista" class="reveal reveal-3"></section>
    </main>
  `,
  });

  ligarShell();

  await Promise.all([
    carregarPerfisDisponiveis(),
    carregarCatalogo(),
    carregarLista(),
  ]);
}

async function carregarPerfisDisponiveis() {
  const { data, error } = await supabase.rpc('listar_perfis_com_detalhes');
  if (error) {
    console.warn('[usuarios] erro perfis:', error.message);
    perfisDisponiveis = [];
    return;
  }
  perfisDisponiveis = (data || []).map(p => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    total_permissoes: Number(p.total_permissoes),
  }));
}

async function carregarCatalogo() {
  catalogo = await listarTodasPermissoes();
}

async function carregarLista() {
  const lista = document.querySelector('#us-lista');
  if (!lista) return;
  lista.innerHTML = `
    <div>
      ${[1,2,3].map(() => `<div class="skel" style="height:6.5rem;margin-bottom:0.6rem"></div>`).join('')}
    </div>`;

  const { data, error } = await supabase.rpc('listar_usuarios_com_perfis_e_extras');
  if (error) {
    lista.innerHTML = `<div class="alert">Não foi possível carregar usuários. ${esc(error.message)}</div>`;
    return;
  }

  usuarios = data || [];

  if (usuarios.length === 0) {
    lista.innerHTML = `<div class="vazio"><p class="vazio-titulo">Nenhum usuário cadastrado.</p></div>`;
    return;
  }

  renderListaCards();
}

function renderListaCards() {
  const lista = document.querySelector('#us-lista');
  if (!lista) return;
  lista.innerHTML = usuarios.map((u, i) => cardUsuario(u, i)).join('');
  lista.querySelectorAll('[data-us-acao="editar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = usuarios.find(x => x.usuario_id === btn.dataset.usId);
      if (u) abrirDrawerEditar(u);
    });
  });
}

function cardUsuario(u, i) {
  const ehEu = u.usuario_id === meuUid;
  const perfilTxt = u.perfil_nome
    ? esc(u.perfil_nome)
    : `<span class="us-sem-perfil">Sem perfil atribuído</span>`;
  const extrasTxt = Number(u.total_extras) === 0
    ? '0 extras'
    : `${u.total_extras} extra${u.total_extras > 1 ? 's' : ''}`;

  return `
    <article class="us-card" style="animation-delay:${i * 50}ms" data-eh-eu="${ehEu}">
      <header class="us-card-cabec">
        <div class="us-card-id">
          <h3 class="us-card-email">${esc(u.email)}</h3>
          ${u.e_super_admin ? `<span class="us-badge-super">super_admin</span>` : ''}
          ${ehEu ? `<span class="us-badge-eu">você</span>` : ''}
        </div>
        <p class="us-card-meta">
          <span class="us-meta-perfil">${perfilTxt}</span>
          <span class="us-meta-sep">·</span>
          ${extrasTxt}
        </p>
        <p class="us-card-data">Cadastrado em ${formatarData(u.criado_em)}</p>
      </header>
      <div class="us-card-acoes">
        <button class="vd-card-btn" data-us-acao="editar" data-us-id="${esc(u.usuario_id)}">Editar</button>
      </div>
    </article>`;
}

// ─── Drawer de edição ────────────────────────────────────────────────────

async function abrirDrawerEditar(u) {
  const podeAtribuir = temPermissaoSync('usuario.atribuir_perfil');
  const podeExtra    = temPermissaoSync('usuario.conceder_extra');
  const ehEu         = u.usuario_id === meuUid;

  const optionsPerfis = perfisDisponiveis.map(p =>
    `<option value="${esc(p.id)}" ${u.perfil_id === p.id ? 'selected' : ''}>
       ${esc(p.nome)} (${p.total_permissoes} perm.)
     </option>`
  ).join('');

  const corpo = `
    <div class="us-secao">
      <p class="h-eyebrow" style="margin-bottom:0.4rem">Identidade</p>
      <div class="prm-form-readonly" style="margin-bottom:0">
        <p class="prm-readonly-rotulo">Email</p>
        <p class="prm-readonly-valor"><code>${esc(u.email)}</code></p>
        <p class="prm-readonly-rotulo" style="margin-top:0.7rem">Cadastrado em</p>
        <p class="prm-readonly-valor">${formatarData(u.criado_em)}</p>
      </div>
    </div>

    <div class="us-secao">
      <p class="h-eyebrow" style="margin-bottom:0.4rem">Super-administrador</p>
      <label class="us-toggle">
        <input type="checkbox" id="us-toggle-super" ${u.e_super_admin ? 'checked' : ''}>
        <span class="us-toggle-marca"></span>
        <span class="us-toggle-rotulo">
          <strong>${u.e_super_admin ? 'É super-admin' : 'Não é super-admin'}</strong>
          <span class="us-toggle-sub">
            Bypass total: pode tudo, sem checagem de permissão.
            ${ehEu ? '<br><em>Você não pode revogar seu próprio super-admin.</em>' : ''}
          </span>
        </span>
      </label>
    </div>

    <div class="us-secao">
      <p class="h-eyebrow" style="margin-bottom:0.4rem">Perfil principal</p>
      <div class="field">
        <label class="field-label" for="us-perfil-select">Perfil</label>
        <select id="us-perfil-select" class="field-input" ${podeAtribuir ? '' : 'disabled'}>
          <option value="">— escolha um perfil —</option>
          ${optionsPerfis}
        </select>
        <span class="field-underline"></span>
        <p class="field-hint" id="us-perfil-hint">
          ${u.e_super_admin
            ? 'Super-admins têm bypass total — o perfil é apenas informativo.'
            : 'O perfil define o conjunto base de permissões. Override pontual via "extras" abaixo.'}
        </p>
      </div>
    </div>

    <div class="us-secao">
      <div class="us-extras-cabec">
        <p class="h-eyebrow" style="margin-bottom:0">Permissões extras pontuais</p>
        ${podeExtra ? `<button type="button" id="us-add-extra" class="vd-card-btn">+ Adicionar</button>` : ''}
      </div>
      <div id="us-extras-lista">
        <div class="skel" style="height:3rem"></div>
      </div>
    </div>
  `;

  abrirModal({
    lateral: true,
    eyebrow: ehEu ? 'Editando você' : 'RBAC',
    titulo: u.email,
    conteudo: corpo,
    rodape: `
      <div id="us-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="us-fechar" class="btn-link">Fechar</button>
      </div>`,
  });

  document.querySelector('#us-fechar').addEventListener('click', () => fecharModal(true));

  // Toggle super_admin
  const toggle = document.querySelector('#us-toggle-super');
  toggle.addEventListener('change', async (ev) => {
    const novoEstado = ev.target.checked;
    if (novoEstado === u.e_super_admin) return;

    if (novoEstado) {
      ev.target.checked = false;
      abrirModalPromoverSuperAdmin(u, async () => {
        ev.target.checked = true;
        await aplicarPromoverSuper(u);
      });
    } else {
      ev.target.checked = true;
      abrirModalRevogarSuperAdmin(u, async () => {
        ev.target.checked = false;
        await aplicarRevogarSuper(u);
      });
    }
  });

  // Perfil dropdown
  const select = document.querySelector('#us-perfil-select');
  if (podeAtribuir) {
    select.addEventListener('change', async () => {
      const novoPerfilId = select.value;
      if (!novoPerfilId) return;
      if (novoPerfilId === u.perfil_id) return;

      const erroEl = document.querySelector('#us-erro');
      erroEl.classList.add('hidden');

      const { error } = await supabase.rpc('atribuir_perfil_usuario', {
        p_usuario_id: u.usuario_id,
        p_perfil_id:  novoPerfilId,
      });

      if (error) {
        erroEl.textContent = traduzirErro(error);
        erroEl.classList.remove('hidden');
        select.value = u.perfil_id || '';
        return;
      }

      const novoPerfil = perfisDisponiveis.find(p => p.id === novoPerfilId);
      u.perfil_id = novoPerfilId;
      u.perfil_nome = novoPerfil?.nome || '';
      u.perfil_codigo = novoPerfil?.codigo || '';
      mostrarToast('Perfil atualizado.', 'ok', 2400);
      if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
    });
  }

  if (podeExtra) {
    document.querySelector('#us-add-extra').addEventListener('click', () => abrirModalAdicionarExtra(u));
  }
  await renderListaExtras(u, podeExtra);
}

async function renderListaExtras(u, podeExtra) {
  const cont = document.querySelector('#us-extras-lista');
  if (!cont) return;

  const { data, error } = await supabase.rpc('listar_extras_de_usuario', { p_usuario_id: u.usuario_id });
  if (error) {
    cont.innerHTML = `<p class="alert">${esc(error.message)}</p>`;
    return;
  }

  const extras = data || [];
  if (extras.length === 0) {
    cont.innerHTML = `<p class="us-extras-vazio">Sem permissões extras.</p>`;
    return;
  }

  cont.innerHTML = extras.map(e => `
    <div class="us-extra-item">
      <div class="us-extra-cabec">
        <code class="prm-codigo">${esc(e.permissao_codigo)}</code>
        ${podeExtra ? `<button class="us-extra-revogar" data-codigo="${esc(e.permissao_codigo)}" type="button">Revogar</button>` : ''}
      </div>
      <p class="us-extra-desc">${esc(e.descricao)}</p>
      ${e.motivo ? `<p class="us-extra-motivo"><strong>Motivo:</strong> ${esc(e.motivo)}</p>` : ''}
      <p class="us-extra-rodape">
        Concedida em ${formatarData(e.concedido_em)}${e.concedido_por_email ? ` por ${esc(e.concedido_por_email)}` : ''}
      </p>
    </div>
  `).join('');

  if (podeExtra) {
    cont.querySelectorAll('.us-extra-revogar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const codigo = btn.dataset.codigo;
        const { error } = await supabase.rpc('revogar_permissao_extra', {
          p_usuario_id: u.usuario_id,
          p_codigo:     codigo,
        });
        if (error) {
          mostrarToast(traduzirErro(error), 'erro', 4000);
          return;
        }
        u.total_extras = Math.max(0, Number(u.total_extras) - 1);
        if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
        mostrarToast('Permissão revogada.', 'ok', 2400);
        await renderListaExtras(u, podeExtra);
      });
    });
  }
}

// ─── Modal: adicionar permissão extra ────────────────────────────────────

async function abrirModalAdicionarExtra(u) {
  let permsDoPerfil = new Set();
  if (u.perfil_id) {
    const perms = await carregarPermsDoPerfil(u.perfil_id);
    permsDoPerfil = new Set(perms);
  }

  const { data: extrasAtuais } = await supabase
    .from('usuario_permissao_extra')
    .select('permissao_codigo')
    .eq('usuario_id', u.usuario_id);
  const setExtras = new Set((extrasAtuais || []).map(e => e.permissao_codigo));

  const candidatos = catalogo.filter(p => !permsDoPerfil.has(p.codigo) && !setExtras.has(p.codigo));

  if (candidatos.length === 0) {
    mostrarToast('Este usuário já tem todas as permissões disponíveis.', 'info', 3500);
    return;
  }

  const porModulo = new Map();
  for (const p of candidatos) {
    if (!porModulo.has(p.modulo)) porModulo.set(p.modulo, []);
    porModulo.get(p.modulo).push(p);
  }

  const optgroups = Array.from(porModulo.entries()).map(([mod, itens]) => `
    <optgroup label="${esc(MODULOS[mod] || mod)}">
      ${itens.map(p => `<option value="${esc(p.codigo)}">${esc(p.codigo)} — ${esc(p.descricao)}</option>`).join('')}
    </optgroup>
  `).join('');

  abrirModal({
    titulo: 'Conceder permissão extra',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55;margin-bottom:1rem">
        Permissão pontual ALÉM do perfil principal de
        <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta)">${esc(u.email)}</strong>.
        O motivo fica registrado no histórico para auditoria.
      </p>

      <div class="field">
        <label class="field-label" for="us-extra-codigo">Permissão</label>
        <select id="us-extra-codigo" class="field-input" required>
          <option value="">— escolha uma permissão —</option>
          ${optgroups}
        </select>
        <span class="field-underline"></span>
      </div>

      <div class="field" style="margin-top:1rem">
        <label class="field-label" for="us-extra-motivo">Motivo *</label>
        <textarea id="us-extra-motivo" class="field-input" required minlength="10" maxlength="500"
                  style="min-height:5rem;resize:vertical"
                  placeholder="ex: Precisa exportar relatórios na ausência do contador (mín 10 caracteres)"></textarea>
        <span class="field-underline"></span>
        <p class="field-hint">Mínimo 10 caracteres. Fica registrado em audit log.</p>
      </div>`,
    rodape: `
      <div id="us-extra-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="us-extra-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="us-extra-conceder" class="btn-primary">Conceder</button>
      </div>`,
  });

  document.querySelector('#us-extra-cancelar').addEventListener('click', () => fecharModal(false));

  document.querySelector('#us-extra-conceder').addEventListener('click', async () => {
    const codigo = document.querySelector('#us-extra-codigo').value;
    const motivo = document.querySelector('#us-extra-motivo').value.trim();
    const erroEl = document.querySelector('#us-extra-erro');
    erroEl.classList.add('hidden');

    if (!codigo) {
      erroEl.textContent = 'Escolha uma permissão.';
      erroEl.classList.remove('hidden');
      return;
    }
    if (motivo.length < 10) {
      erroEl.textContent = 'Motivo precisa ter pelo menos 10 caracteres.';
      erroEl.classList.remove('hidden');
      return;
    }

    const btn = document.querySelector('#us-extra-conceder');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase.rpc('conceder_permissao_extra', {
      p_usuario_id: u.usuario_id,
      p_codigo:     codigo,
      p_motivo:     motivo,
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
    await renderListaExtras(u, true);
  });
}

// ─── Modal: promover super_admin (digitação obrigatória) ─────────────────

function abrirModalPromoverSuperAdmin(u, onConfirmar) {
  abrirModal({
    titulo: 'Promover a super_admin?',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55">
        Super-admin tem <strong>bypass total</strong>: pode tudo, sem
        checagem de permissão. Eles também podem promover ou revogar
        outros super-admins.
      </p>
      <p class="text-body" style="margin-top:0.6rem;font-size:0.86rem;color:var(--c-tinta-3);line-height:1.5">
        Para confirmar, digite o email de
        <strong style="color:var(--c-tinta)">${esc(u.email)}</strong> abaixo (case-sensitive):
      </p>
      <div class="field" style="margin-top:0.85rem">
        <input id="us-super-confirm" type="text" autocomplete="off"
               class="field-input" placeholder="${esc(u.email)}">
        <span class="field-underline"></span>
      </div>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="us-super-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="us-super-confirmar" class="btn-primary" disabled>
          Promover
        </button>
      </div>`,
  });

  const inp = document.querySelector('#us-super-confirm');
  const btn = document.querySelector('#us-super-confirmar');
  inp.addEventListener('input', () => { btn.disabled = inp.value !== u.email; });
  setTimeout(() => inp.focus(), 200);

  document.querySelector('#us-super-cancelar').addEventListener('click', () => fecharModal(false));
  btn.addEventListener('click', async () => {
    if (inp.value !== u.email) return;
    fecharModal(true);
    await onConfirmar();
  });
}

// ─── Modal: revogar super_admin (confirmação simples) ────────────────────

function abrirModalRevogarSuperAdmin(u, onConfirmar) {
  abrirModal({
    titulo: 'Revogar super_admin?',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55">
        <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta);font-size:1.05rem">${esc(u.email)}</strong>
        deixa de ter bypass total. Continua com o perfil principal e
        permissões extras pontuais.
      </p>
      <p class="text-body" style="margin-top:0.6rem;font-size:0.86rem;color:var(--c-tinta-3);line-height:1.5">
        O sistema bloqueia esta ação se for o último super-admin ativo,
        ou se for você mesmo.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="us-rev-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="us-rev-confirmar" class="btn-primary">Revogar</button>
      </div>`,
  });

  document.querySelector('#us-rev-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#us-rev-confirmar').addEventListener('click', async () => {
    fecharModal(true);
    await onConfirmar();
  });
}

async function aplicarPromoverSuper(u) {
  const { error } = await supabase.rpc('promover_super_admin', { p_usuario_id: u.usuario_id });
  if (error) {
    mostrarToast(traduzirErro(error), 'erro', 4500);
    return;
  }
  u.e_super_admin = true;
  if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
  mostrarToast(`${u.email} agora é super_admin.`, 'ok', 2800);
  renderListaCards();
}

async function aplicarRevogarSuper(u) {
  const { error } = await supabase.rpc('revogar_super_admin', { p_usuario_id: u.usuario_id });
  if (error) {
    mostrarToast(traduzirErro(error), 'erro', 4500);
    return;
  }
  u.e_super_admin = false;
  if (u.usuario_id === meuUid) limparCachePapeis(); else invalidarCachePermissoes();
  mostrarToast(`Super_admin revogado de ${u.email}.`, 'ok', 2800);
  renderListaCards();
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function carregarPermsDoPerfil(perfilId) {
  if (perfilPermsCache.has(perfilId)) return perfilPermsCache.get(perfilId);
  const { data, error } = await supabase
    .from('perfil_permissao')
    .select('permissao_codigo')
    .eq('perfil_id', perfilId);
  if (error) return [];
  const arr = (data || []).map(r => r.permissao_codigo);
  perfilPermsCache.set(perfilId, arr);
  return arr;
}

function traduzirErro(error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('permissao negada') || msg.includes('apenas super_admin'))
    return 'Você não tem permissão para esta ação.';
  if (msg.includes('motivo obrigatorio'))
    return 'Motivo obrigatório (mínimo 10 caracteres).';
  if (msg.includes('pelo menos 1 super_admin'))
    return 'O sistema precisa ter pelo menos 1 super_admin ativo. Promova outro antes.';
  if (msg.includes('proprio super_admin'))
    return 'Você não pode revogar seu próprio super_admin (peça para outro super_admin).';
  if (msg.includes('perfil nao encontrado') || msg.includes('usuario nao encontrado'))
    return 'Registro não encontrado. Recarregue a página.';
  if (msg.includes('permissao nao encontrada'))
    return 'Permissão não está no catálogo.';
  return error.message || 'Erro inesperado.';
}

function formatarData(ts) {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(ts));
  } catch { return ts; }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
