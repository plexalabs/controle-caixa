// configuracoes-permissoes.js — CRUD de perfis e permissoes (CP-RBAC Sessao 4).
//
// Tela exclusiva do super_admin (gated por perfil.visualizar). Permite:
//   - Listar todos os perfis com contagem de permissoes e usuarios
//   - Editar permissoes de um perfil (drawer + modal de confirmacao se
//     houver usuarios afetados)
//   - Criar perfil novo (drawer com checklist agrupado por modulo)
//   - Deletar perfil custom (modal de confirmacao por digitacao do nome)
//   - Ver detalhes inline (permissoes agrupadas + lista de usuarios)
//
// Identidade editorial: paleta papel/musgo, Fraunces nos titulos, Manrope
// no corpo, badge "sistema" em mono pra perfis pre-definidos.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import {
  carregarPermissoes,
  temPermissaoSync,
  invalidarCachePermissoes,
  listarTodasPermissoes,
} from '../papeis.js';

// Rotulos amigaveis dos modulos (mapeia codigo do banco -> texto da UI).
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

// Estado da tela
let perfis = [];                       // [{ id, codigo, nome, descricao, e_sistema, total_permissoes, total_usuarios, ... }]
let catalogo = [];                     // [{ codigo, modulo, descricao, destrutiva }]
let perfilDetalheAberto = null;        // id do perfil sendo expandido inline (null = nenhum)
let perfilPermsCache = new Map();      // perfilId -> Set<codigo> (lazy load das perms do perfil)

export async function renderPermissoes() {
  // Gating principal
  await carregarPermissoes();
  if (!temPermissaoSync('perfil.visualizar')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'config',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
          <div class="alert mt-6">Esta seção é restrita a super-administradores.</div>
        </main>`,
    });
    ligarShell();
    return;
  }

  const podeEditar  = temPermissaoSync('perfil.editar_permissoes');
  const podeCriar   = temPermissaoSync('perfil.criar');
  const podeDeletar = temPermissaoSync('perfil.deletar');

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
          <h1 class="tela-cabec-titulo">Perfis e suas permissões.</h1>
          <p class="tela-cabec-sub">
            Os 5 perfis pré-definidos vêm com permissões pensadas. Edite ou
            crie novos conforme a equipe cresce — cada permissão liga ou
            desliga um botão real do sistema.
          </p>
        </div>
        ${podeCriar ? `
          <button id="prm-btn-novo" class="btn-primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1 V13 M1 7 H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            Novo perfil
          </button>
        ` : ''}
      </header>

      <section id="prm-lista" class="reveal reveal-3"></section>
    </main>
  `,
  });

  ligarShell();

  if (podeCriar) {
    document.querySelector('#prm-btn-novo').addEventListener('click', () => abrirDrawerCriar());
  }

  // Carrega catalogo (1x) e perfis em paralelo.
  await Promise.all([
    carregarCatalogo(),
    carregarPerfis(podeEditar, podeDeletar),
  ]);
}

async function carregarCatalogo() {
  catalogo = await listarTodasPermissoes();
}

async function carregarPerfis(podeEditar, podeDeletar) {
  const lista = document.querySelector('#prm-lista');
  if (!lista) return;
  lista.innerHTML = `
    <div>
      ${[1,2,3,4,5].map(() => `<div class="skel" style="height:6rem;margin-bottom:0.6rem"></div>`).join('')}
    </div>`;

  const { data, error } = await supabase.rpc('listar_perfis_com_detalhes');
  if (error) {
    lista.innerHTML = `<div class="alert">Não foi possível carregar perfis. ${esc(error.message)}</div>`;
    return;
  }

  perfis = data || [];
  perfilPermsCache.clear();

  if (perfis.length === 0) {
    lista.innerHTML = `<div class="vazio"><p class="vazio-titulo">Nenhum perfil cadastrado.</p></div>`;
    return;
  }

  lista.innerHTML = perfis.map((p, i) => cardPerfil(p, i, podeEditar, podeDeletar)).join('');

  // Wire up botoes
  lista.querySelectorAll('[data-prm-acao]').forEach(btn => {
    const acao = btn.dataset.prmAcao;
    const id   = btn.dataset.prmId;
    const perfil = perfis.find(p => p.id === id);
    if (!perfil) return;

    if (acao === 'editar')   btn.addEventListener('click', () => abrirDrawerEditar(perfil));
    if (acao === 'detalhes') btn.addEventListener('click', () => alternarDetalhes(perfil, podeEditar, podeDeletar));
    if (acao === 'deletar')  btn.addEventListener('click', () => abrirModalDeletar(perfil));
  });
}

// ─── Card de perfil ──────────────────────────────────────────────────────

function cardPerfil(p, i, podeEditar, podeDeletar) {
  const badge = p.e_sistema
    ? `<span class="prm-badge-sistema" title="Perfil pré-definido, não pode ser deletado">sistema</span>`
    : `<span class="prm-badge-custom">custom</span>`;

  const podeDel = podeDeletar && !p.e_sistema && Number(p.total_usuarios) === 0;
  const tooltipDel = !podeDel
    ? p.e_sistema
      ? 'Perfis de sistema não podem ser deletados'
      : Number(p.total_usuarios) > 0
        ? `Reatribua os ${p.total_usuarios} usuários antes de deletar`
        : 'Sem permissão para deletar'
    : '';

  const expandido = perfilDetalheAberto === p.id;

  return `
    <article class="prm-card ${expandido ? 'is-aberto' : ''}" data-perfil-id="${esc(p.id)}" style="animation-delay:${i * 50}ms">
      <header class="prm-card-cabec">
        <div class="prm-card-id">
          <h3 class="prm-card-nome">${esc(p.nome)}</h3>
          ${badge}
        </div>
        <p class="prm-card-meta">
          <span class="prm-meta-num">${p.total_permissoes}</span>
          ${Number(p.total_permissoes) === 1 ? 'permissão' : 'permissões'}
          <span class="prm-meta-sep">·</span>
          <span class="prm-meta-num">${p.total_usuarios}</span>
          ${Number(p.total_usuarios) === 1 ? 'usuário' : 'usuários'}
        </p>
      </header>

      ${p.descricao ? `<p class="prm-card-desc">${esc(p.descricao)}</p>` : ''}

      <div class="prm-card-acoes">
        ${podeEditar ? `
          <button class="vd-card-btn" data-prm-acao="editar" data-prm-id="${esc(p.id)}">
            ${p.e_sistema ? 'Editar permissões' : 'Editar'}
          </button>
        ` : ''}
        <button class="vd-card-btn" data-prm-acao="detalhes" data-prm-id="${esc(p.id)}">
          ${expandido ? 'Recolher' : 'Ver detalhes'}
        </button>
        ${!p.e_sistema ? `
          <button class="vd-card-btn ${podeDel ? '' : 'vd-card-btn--desabilitado'}"
                  data-prm-acao="deletar" data-prm-id="${esc(p.id)}"
                  ${podeDel ? '' : 'disabled aria-disabled="true"'}
                  ${tooltipDel ? `title="${esc(tooltipDel)}"` : ''}>
            Deletar
          </button>
        ` : ''}
      </div>

      ${expandido ? `<div class="prm-detalhes" id="prm-det-${esc(p.id)}"><div class="skel" style="height:8rem"></div></div>` : ''}
    </article>`;
}

// ─── Toggle "Ver detalhes" inline ────────────────────────────────────────

async function alternarDetalhes(perfil, podeEditar, podeDeletar) {
  perfilDetalheAberto = perfilDetalheAberto === perfil.id ? null : perfil.id;
  const lista = document.querySelector('#prm-lista');
  // Re-render so o estado expandido reflete
  lista.innerHTML = perfis.map((p, i) => cardPerfil(p, i, podeEditar, podeDeletar)).join('');
  lista.querySelectorAll('[data-prm-acao]').forEach(btn => {
    const acao = btn.dataset.prmAcao;
    const id   = btn.dataset.prmId;
    const p    = perfis.find(x => x.id === id);
    if (!p) return;
    if (acao === 'editar')   btn.addEventListener('click', () => abrirDrawerEditar(p));
    if (acao === 'detalhes') btn.addEventListener('click', () => alternarDetalhes(p, podeEditar, podeDeletar));
    if (acao === 'deletar')  btn.addEventListener('click', () => abrirModalDeletar(p));
  });

  if (perfilDetalheAberto !== perfil.id) return;

  // Carrega permissoes + usuarios do perfil (paralelo)
  const [perms, usuarios] = await Promise.all([
    carregarPermsDoPerfil(perfil.id),
    carregarUsuariosDoPerfil(perfil.id),
  ]);

  const detEl = document.querySelector(`#prm-det-${cssEscape(perfil.id)}`);
  if (!detEl) return;
  detEl.innerHTML = renderDetalhes(perfil, perms, usuarios);
}

function renderDetalhes(perfil, perms, usuarios) {
  const permsSet = new Set(perms);
  const porModulo = agruparCatalogoPorModulo();

  const blocos = Object.entries(MODULOS).map(([cod, rotulo]) => {
    const itens = (porModulo.get(cod) || []).filter(p => permsSet.has(p.codigo));
    if (itens.length === 0) return '';
    return `
      <div class="prm-modulo-detalhe">
        <h4 class="prm-modulo-titulo">${esc(rotulo)}</h4>
        <ul class="prm-perms-leitura">
          ${itens.map(p => `
            <li>
              <code class="prm-codigo">${esc(p.codigo)}</code>
              <span class="prm-desc-curta">${esc(p.descricao)}</span>
              ${p.destrutiva ? `<span class="prm-badge-destrutiva">destrutiva</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>`;
  }).filter(Boolean).join('');

  const usuariosHtml = usuarios.length === 0
    ? `<p class="prm-detalhe-vazio">Nenhum usuário com este perfil.</p>`
    : `<ul class="prm-usuarios-lista">
         ${usuarios.slice(0, 10).map(u => `
           <li>
             <span class="prm-usuario-email">${esc(u.email)}</span>
             ${Number(u.total_extras) > 0
               ? `<span class="prm-usuario-extras">+${u.total_extras} extra${u.total_extras > 1 ? 's' : ''}</span>`
               : ''}
           </li>
         `).join('')}
         ${usuarios.length > 10 ? `<li class="prm-usuarios-mais">e mais ${usuarios.length - 10}…</li>` : ''}
       </ul>`;

  return `
    <div class="prm-detalhe-bloco">
      <h4 class="prm-detalhe-subtitulo">Permissões deste perfil (${perms.length})</h4>
      ${blocos || '<p class="prm-detalhe-vazio">Nenhuma permissão atribuída.</p>'}
    </div>
    <div class="prm-detalhe-bloco">
      <h4 class="prm-detalhe-subtitulo">Usuários com este perfil (${usuarios.length})</h4>
      ${usuariosHtml}
    </div>
    <p class="prm-detalhe-rodape">
      Criado em ${formatarTimestamp(perfil.criado_em)}
      · Atualizado em ${formatarTimestamp(perfil.atualizado_em)}
    </p>`;
}

// ─── Drawer de criar/editar ──────────────────────────────────────────────

function abrirDrawerCriar() {
  abrirDrawerForm({ modo: 'criar' });
}

async function abrirDrawerEditar(perfil) {
  // Carrega permissoes atuais antes de abrir
  const permsAtuais = await carregarPermsDoPerfil(perfil.id);
  abrirDrawerForm({ modo: 'editar', perfil, permsAtuais });
}

function abrirDrawerForm({ modo, perfil = null, permsAtuais = [] }) {
  const eEdicao = modo === 'editar';
  const titulo  = eEdicao ? `Editar “${perfil.nome}”` : 'Novo perfil';
  const eyebrow = eEdicao
    ? (perfil.e_sistema ? 'Perfil de sistema · só permissões editáveis' : 'Perfil custom')
    : 'RBAC';

  const permsSet = new Set(permsAtuais);
  const porModulo = agruparCatalogoPorModulo();

  const camposIdent = eEdicao
    ? `
      <div class="prm-form-readonly">
        <p class="prm-readonly-rotulo">Código</p>
        <p class="prm-readonly-valor"><code>${esc(perfil.codigo)}</code></p>
      </div>`
    : `
      <div class="field">
        <label class="field-label" for="prm-codigo">Código *</label>
        <input id="prm-codigo" name="codigo" type="text" required
               minlength="2" maxlength="40" autocomplete="off"
               pattern="^[a-z_]+$"
               placeholder="ex: admin_pleno"
               class="field-input" style="font-family:'Roboto Mono',monospace">
        <span class="field-underline"></span>
        <p class="field-hint">snake_case minúsculo. Imutável após criar.</p>
      </div>`;

  const corpo = `
    <form id="prm-form" novalidate>
      ${camposIdent}

      ${eEdicao ? '' : `
        <div class="field">
          <label class="field-label" for="prm-nome">Nome *</label>
          <input id="prm-nome" name="nome" type="text" required
                 minlength="2" maxlength="80" autocomplete="off"
                 placeholder="ex: Admin Pleno"
                 value="${eEdicao ? esc(perfil.nome) : ''}"
                 class="field-input">
          <span class="field-underline"></span>
        </div>

        <div class="field">
          <label class="field-label" for="prm-descricao">Descrição</label>
          <textarea id="prm-descricao" name="descricao" maxlength="200"
                    placeholder="Pra que serve este perfil"
                    class="field-input" style="min-height:4.5rem;resize:vertical">${eEdicao ? esc(perfil.descricao || '') : ''}</textarea>
          <span class="field-underline"></span>
        </div>
      `}

      <div class="prm-perms-secao">
        <p class="h-eyebrow" style="margin-bottom:0.4rem">Permissões</p>
        <p class="prm-perms-aviso">
          Marque as ações que este perfil pode executar. Itens
          <span class="prm-badge-destrutiva-inline">destrutivos</span> afetam dados existentes.
        </p>

        ${Object.entries(MODULOS).map(([cod, rotulo]) => {
          const itens = porModulo.get(cod) || [];
          if (itens.length === 0) return '';
          const totalMod = itens.length;
          const marcadosMod = itens.filter(p => permsSet.has(p.codigo)).length;
          return `
            <details class="prm-modulo-fold" ${marcadosMod > 0 ? 'open' : ''}>
              <summary class="prm-modulo-summary">
                <span class="prm-modulo-rotulo">${esc(rotulo)}</span>
                <span class="prm-modulo-cont"
                      data-modulo-cont="${esc(cod)}">${marcadosMod}/${totalMod}</span>
              </summary>
              <ul class="prm-perms-checklist">
                ${itens.map(p => `
                  <li>
                    <label class="prm-perm-item">
                      <input type="checkbox" name="permissoes" value="${esc(p.codigo)}"
                             ${permsSet.has(p.codigo) ? 'checked' : ''}
                             data-modulo="${esc(cod)}">
                      <div class="prm-perm-conteudo">
                        <code class="prm-codigo">${esc(p.codigo)}</code>
                        <span class="prm-desc-curta">${esc(p.descricao)}</span>
                      </div>
                      ${p.destrutiva ? `<span class="prm-badge-destrutiva">destrutiva</span>` : ''}
                    </label>
                  </li>
                `).join('')}
              </ul>
            </details>`;
        }).filter(Boolean).join('')}
      </div>
    </form>
  `;

  abrirModal({
    lateral: true,
    eyebrow,
    titulo,
    conteudo: corpo,
    rodape: `
      <div id="prm-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="prm-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="prm-form" id="prm-salvar" class="btn-primary">${eEdicao ? 'Salvar' : 'Criar perfil'}</button>
      </div>`,
  });

  document.querySelector('#prm-cancelar').addEventListener('click', () => fecharModal(true));

  // Atualiza contador de "marcados/total" por modulo on change
  document.querySelectorAll('input[name="permissoes"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const mod = inp.dataset.modulo;
      const itens = (porModulo.get(mod) || []);
      const marcados = itens.filter(p =>
        document.querySelector(`input[name="permissoes"][value="${cssEscape(p.codigo)}"]`)?.checked
      ).length;
      const cont = document.querySelector(`[data-modulo-cont="${cssEscape(mod)}"]`);
      if (cont) cont.textContent = `${marcados}/${itens.length}`;
    });
  });

  document.querySelector('#prm-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = document.querySelector('#prm-erro');
    const btn    = document.querySelector('#prm-salvar');
    erroEl.classList.add('hidden');

    // Coleta permissoes marcadas
    const permsSelect = Array.from(document.querySelectorAll('input[name="permissoes"]:checked'))
      .map(i => i.value);

    if (eEdicao) {
      await salvarEdicao(perfil, permsSelect, btn, erroEl);
    } else {
      await salvarCriacao(btn, erroEl, permsSelect);
    }
  });
}

async function salvarCriacao(btn, erroEl, permsSelect) {
  const codigo    = document.querySelector('#prm-codigo').value.trim().toLowerCase();
  const nome      = document.querySelector('#prm-nome').value.trim();
  const descricao = document.querySelector('#prm-descricao').value.trim();

  if (!codigo || !/^[a-z_]+$/.test(codigo)) {
    erroEl.textContent = 'Código deve ser snake_case minúsculo (ex: admin_pleno).';
    erroEl.classList.remove('hidden');
    return;
  }
  if (!nome) {
    erroEl.textContent = 'Nome obrigatório.';
    erroEl.classList.remove('hidden');
    return;
  }

  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  const { error } = await supabase.rpc('criar_perfil', {
    p_codigo:     codigo,
    p_nome:       nome,
    p_descricao:  descricao || null,
    p_permissoes: permsSelect,
  });

  btn.removeAttribute('aria-busy');

  if (error) {
    btn.disabled = false;
    erroEl.textContent = traduzirErro(error);
    erroEl.classList.remove('hidden');
    return;
  }

  fecharModal(true);
  invalidarCachePermissoes();
  mostrarToast(`Perfil “${nome}” criado.`, 'ok', 2800);
  await renderPermissoes();
}

async function salvarEdicao(perfil, permsSelect, btn, erroEl) {
  // Se houver usuarios atribuidos, mostra modal de confirmacao listando-os.
  if (Number(perfil.total_usuarios) > 0) {
    const usuarios = await carregarUsuariosDoPerfil(perfil.id);
    abrirModalConfirmarEdicao(perfil, usuarios, async () => {
      await aplicarEdicao(perfil, permsSelect, btn, erroEl);
    });
    return;
  }

  await aplicarEdicao(perfil, permsSelect, btn, erroEl);
}

async function aplicarEdicao(perfil, permsSelect, btn, erroEl) {
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  const { error } = await supabase.rpc('atualizar_permissoes_perfil', {
    p_perfil_id:  perfil.id,
    p_permissoes: permsSelect,
  });

  btn.removeAttribute('aria-busy');

  if (error) {
    btn.disabled = false;
    erroEl.textContent = traduzirErro(error);
    erroEl.classList.remove('hidden');
    return;
  }

  // Limpa cache local + global
  perfilPermsCache.delete(perfil.id);
  invalidarCachePermissoes();

  fecharModal(true);
  mostrarToast(`Permissões de “${perfil.nome}” atualizadas.`, 'ok', 2800);
  await renderPermissoes();
}

// ─── Modal: confirmar edicao com usuarios afetados ───────────────────────

function abrirModalConfirmarEdicao(perfil, usuarios, onConfirmar) {
  const lista = usuarios.slice(0, 8).map(u => `<li>${esc(u.email)}</li>`).join('');
  const resto = usuarios.length > 8 ? `<li class="prm-usuarios-mais">e mais ${usuarios.length - 8}…</li>` : '';

  abrirModal({
    titulo: 'Confirmar mudança',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55">
        As novas permissões de
        <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta);font-size:1.05rem">${esc(perfil.nome)}</strong>
        vão valer imediatamente para
        <strong>${usuarios.length} usuário${usuarios.length > 1 ? 's' : ''}</strong>:
      </p>
      <ul class="prm-usuarios-lista" style="margin-top:0.85rem">
        ${lista}${resto}
      </ul>
      <p class="text-body" style="margin-top:1rem;font-size:0.86rem;color:var(--c-tinta-3);line-height:1.5">
        Permissões extras pontuais (override) não são afetadas.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="prm-conf-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="prm-conf-aplicar" class="btn-primary">Aplicar mudanças</button>
      </div>`,
  });

  document.querySelector('#prm-conf-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#prm-conf-aplicar').addEventListener('click', async () => {
    fecharModal(true);
    await onConfirmar();
  });
}

// ─── Modal: deletar perfil (confirmar por digitacao) ─────────────────────

function abrirModalDeletar(perfil) {
  abrirModal({
    titulo: 'Deletar perfil?',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55">
        <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta);font-size:1.05rem">${esc(perfil.nome)}</strong>
        sai do sistema. As permissões deste perfil são desfeitas
        (registros em <code>perfil_permissao</code> apagados via CASCADE).
      </p>
      <p class="text-body" style="margin-top:0.6rem;font-size:0.86rem;color:var(--c-tinta-3);line-height:1.5">
        Para confirmar, digite o nome exato do perfil abaixo:
      </p>
      <div class="field" style="margin-top:0.85rem">
        <input id="prm-del-confirm" type="text" autocomplete="off"
               class="field-input" placeholder="${esc(perfil.nome)}">
        <span class="field-underline"></span>
      </div>`,
    rodape: `
      <div id="prm-del-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="prm-del-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="prm-del-confirmar" class="btn-primary"
                disabled
                style="background:var(--c-alerta);box-shadow:0 1px 0 0 rgba(154,42,31,0.4) inset, 0 6px 14px -8px rgba(154,42,31,0.45)">
          Deletar perfil
        </button>
      </div>`,
  });

  const inp = document.querySelector('#prm-del-confirm');
  const btn = document.querySelector('#prm-del-confirmar');

  inp.addEventListener('input', () => {
    btn.disabled = inp.value !== perfil.nome;
  });
  setTimeout(() => inp.focus(), 200);

  document.querySelector('#prm-del-cancelar').addEventListener('click', () => fecharModal(false));

  btn.addEventListener('click', async () => {
    if (inp.value !== perfil.nome) return;

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    const { error } = await supabase.rpc('deletar_perfil', { p_perfil_id: perfil.id });

    btn.removeAttribute('aria-busy');

    if (error) {
      btn.disabled = false;
      const erroEl = document.querySelector('#prm-del-erro');
      erroEl.textContent = traduzirErro(error);
      erroEl.classList.remove('hidden');
      return;
    }

    fecharModal(true);
    invalidarCachePermissoes();
    mostrarToast(`Perfil “${perfil.nome}” deletado.`, 'ok', 2800);
    await renderPermissoes();
  });
}

// ─── Helpers de dados ────────────────────────────────────────────────────

async function carregarPermsDoPerfil(perfilId) {
  if (perfilPermsCache.has(perfilId)) return perfilPermsCache.get(perfilId);
  const { data, error } = await supabase
    .from('perfil_permissao')
    .select('permissao_codigo')
    .eq('perfil_id', perfilId);
  if (error) {
    console.warn('[permissoes] erro perms perfil:', error.message);
    return [];
  }
  const arr = (data || []).map(r => r.permissao_codigo);
  perfilPermsCache.set(perfilId, arr);
  return arr;
}

async function carregarUsuariosDoPerfil(perfilId) {
  const { data, error } = await supabase.rpc('listar_usuarios_afetados_por_perfil', {
    p_perfil_id: perfilId,
  });
  if (error) {
    console.warn('[permissoes] erro usuarios perfil:', error.message);
    return [];
  }
  return data || [];
}

function agruparCatalogoPorModulo() {
  const m = new Map();
  for (const p of catalogo) {
    if (!m.has(p.modulo)) m.set(p.modulo, []);
    m.get(p.modulo).push(p);
  }
  return m;
}

// ─── Helpers de UI ───────────────────────────────────────────────────────

function traduzirErro(error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('duplicate key') || msg.includes('unique')) {
    return 'Já existe um perfil com esse código. Escolha outro.';
  }
  if (msg.includes('codigo deve ser snake_case')) {
    return 'Código deve ser snake_case minúsculo (ex: admin_pleno).';
  }
  if (msg.includes('perfil tem')) return error.message;
  if (msg.includes('perfis de sistema')) return 'Perfis de sistema não podem ser deletados.';
  if (msg.includes('perfil nao encontrado')) return 'Perfil não encontrado. Recarregue a página.';
  if (msg.includes('permissao negada')) return 'Você não tem permissão para esta ação.';
  return error.message || 'Erro inesperado.';
}

function formatarTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch { return ts; }
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
