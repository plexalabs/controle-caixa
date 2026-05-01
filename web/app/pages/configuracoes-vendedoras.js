// configuracoes-vendedoras.js — CRUD de vendedoras (CP5.1).
// Lista ativas em cards (papel + filete âmbar), bloco colapsável de
// inativas, drawer de criar/editar, modal de confirmação de desativação.
//
// RLS:
//   SELECT — todos authenticated
//   INSERT — admin OU operador
//   UPDATE — admin OU operador (via fn_tem_papel)
//   DELETE — bloqueado (false). Soft-delete via ativa=false.

import { supabase } from '../supabase.js';
import { renderHeader, ligarHeader } from '../../components/header.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { pegarPapeis } from '../papeis.js';

let papeisCache = null;

export async function renderVendedoras() {
  papeisCache = await pegarPapeis();

  document.querySelector('#app').innerHTML = `
    ${await renderHeader('config')}
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Operação · Equipe</p>
          <h1 class="tela-cabec-titulo">Vendedoras</h1>
          <p class="tela-cabec-sub">
            Quem aparece nos lançamentos pagos em dinheiro. Operadores
            podem cadastrar e atualizar; admin pode desativar — sem deletar,
            o histórico fica preservado.
          </p>
        </div>
        <button id="vd-btn-novo" class="btn-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1 V13 M1 7 H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          Nova vendedora
        </button>
      </header>

      <section id="vd-bloco-ativas" class="reveal reveal-3"></section>
      <div id="vd-bloco-inativas" class="reveal reveal-4"></div>
    </main>
  `;

  ligarHeader();
  document.querySelector('#vd-btn-novo').addEventListener('click', () => abrirDrawerVendedora(null));
  await carregarLista();
}

// ─── Lista ──────────────────────────────────────────────────────────
async function carregarLista() {
  const blocoAtivas   = document.querySelector('#vd-bloco-ativas');
  const blocoInativas = document.querySelector('#vd-bloco-inativas');
  if (!blocoAtivas || !blocoInativas) return;

  blocoAtivas.innerHTML = `
    <div class="vd-grid">
      ${[1,2,3,4].map(() => `<div class="skel" style="height:9rem"></div>`).join('')}
    </div>`;
  blocoInativas.innerHTML = '';

  const { data, error } = await supabase
    .from('vendedora')
    .select('id, nome, apelido, email, telefone, observacoes, ativa, criada_em')
    .order('ativa', { ascending: false })
    .order('nome',  { ascending: true });

  if (error) {
    blocoAtivas.innerHTML = `<p class="alert">Não foi possível carregar a equipe. ${esc(error.message)}</p>`;
    return;
  }

  const todas = data || [];
  const ativas   = todas.filter(v => v.ativa);
  const inativas = todas.filter(v => !v.ativa);

  if (ativas.length === 0 && inativas.length === 0) {
    blocoAtivas.innerHTML = `
      <div class="vazio">
        <div class="vazio-num">∅</div>
        <p class="vazio-titulo">Nenhuma vendedora cadastrada ainda.</p>
        <p class="vazio-desc">
          Adicione a primeira pelo botão <strong>+ Nova vendedora</strong>
          no canto superior direito. Ela ficará disponível imediatamente
          nos novos lançamentos em dinheiro.
        </p>
      </div>`;
    return;
  }

  if (ativas.length === 0) {
    blocoAtivas.innerHTML = `
      <div class="vazio" style="padding:2rem 1.5rem">
        <p class="vazio-titulo" style="font-size:1.1rem">
          Sem vendedoras ativas — só inativas abaixo.
        </p>
        <p class="vazio-desc">
          Reative alguma do bloco de inativas, ou cadastre uma nova.
        </p>
      </div>`;
  } else {
    blocoAtivas.innerHTML = `
      <div class="vd-grid">
        ${ativas.map((v, i) => cardVendedora(v, i)).join('')}
      </div>`;
  }

  if (inativas.length > 0) {
    blocoInativas.innerHTML = `
      <button class="vd-inativas-toggle" type="button" aria-expanded="false" aria-controls="vd-inativas-grid">
        <span>Inativas (${inativas.length})</span>
        <span class="vd-toggle-caret" aria-hidden="true">
          <svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 1.5 L6 6.5 L11 1.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
      <div id="vd-inativas-grid" class="vd-inativas vd-grid" hidden>
        ${inativas.map((v, i) => cardVendedora(v, i)).join('')}
      </div>`;
  }

  // Liga ações dos cards (delegação simples).
  const todoBloco = document.querySelector('#main');
  todoBloco.querySelectorAll('[data-vd-acao]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.vdId;
      const acao = btn.dataset.vdAcao;
      const v = todas.find(x => x.id === id);
      if (!v) return;
      if (acao === 'editar')    abrirDrawerVendedora(v);
      if (acao === 'desativar') confirmarDesativar(v);
      if (acao === 'reativar')  reativar(v);
    });
  });

  const tog = document.querySelector('.vd-inativas-toggle');
  if (tog) {
    tog.addEventListener('click', () => {
      const exp = tog.getAttribute('aria-expanded') === 'true';
      tog.setAttribute('aria-expanded', String(!exp));
      const grid = document.querySelector('#vd-inativas-grid');
      if (grid) grid.hidden = exp;
    });
  }
}

function cardVendedora(v, i) {
  const ehAdmin = papeisCache.includes('admin');
  const acoes = [];
  if (v.ativa) {
    acoes.push(`<button class="vd-card-btn" data-vd-acao="editar" data-vd-id="${esc(v.id)}">Editar</button>`);
    if (ehAdmin) {
      acoes.push(`<button class="vd-card-btn" data-vd-acao="desativar" data-vd-id="${esc(v.id)}">Desativar</button>`);
    }
  } else if (ehAdmin) {
    acoes.push(`<button class="vd-card-btn" data-vd-acao="reativar" data-vd-id="${esc(v.id)}">Reativar</button>`);
    acoes.push(`<button class="vd-card-btn" data-vd-acao="editar" data-vd-id="${esc(v.id)}">Editar</button>`);
  }

  const contato = [v.email, v.telefone].filter(Boolean).join(' · ') || '—';
  const dataCad = formatarDataCurta(v.criada_em);

  return `
    <article class="vd-card" data-ativa="${v.ativa}" style="animation-delay:${i * 50}ms">
      <div class="vd-card-cabec">
        <h3 class="vd-card-nome">${esc(v.nome)}</h3>
        <span class="vd-card-badge" data-tom="${v.ativa ? 'ativa' : 'inativa'}">
          ${v.ativa ? 'Ativa' : 'Inativa'}
        </span>
      </div>
      ${v.apelido ? `<p class="vd-card-meta" style="font-style:italic">"${esc(v.apelido)}"</p>` : ''}
      <p class="vd-card-meta">${esc(contato)}</p>
      ${v.observacoes ? `<p class="vd-card-meta" style="opacity:0.85">${esc(v.observacoes.slice(0, 120))}${v.observacoes.length > 120 ? '…' : ''}</p>` : ''}
      <p class="vd-card-data">cadastrada em ${dataCad}</p>
      ${acoes.length ? `<div class="vd-card-acoes">${acoes.join('')}</div>` : ''}
    </article>`;
}

// ─── Drawer criar/editar ────────────────────────────────────────────
function abrirDrawerVendedora(v) {
  const isEdit = !!v;
  const corpo = `
    <form id="vd-form" novalidate>
      <div class="field">
        <label class="field-label" for="vd-nome">Nome *</label>
        <input id="vd-nome" name="nome" required minlength="2" maxlength="80"
               class="field-input" autocomplete="name"
               value="${esc(v?.nome || '')}" />
        <span class="field-underline"></span>
      </div>

      <div class="field">
        <label class="field-label" for="vd-apelido">Apelido (interno)</label>
        <input id="vd-apelido" name="apelido" maxlength="40"
               class="field-input" autocomplete="off"
               placeholder="opcional, como o time chama"
               value="${esc(v?.apelido || '')}" />
        <span class="field-underline"></span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="vd-email">Email</label>
          <input id="vd-email" name="email" type="email" maxlength="160"
                 class="field-input" autocomplete="email"
                 value="${esc(v?.email || '')}" />
          <span class="field-underline"></span>
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="vd-telefone">Telefone</label>
          <input id="vd-telefone" name="telefone" maxlength="20"
                 class="field-input" autocomplete="tel"
                 placeholder="(11) 99999-9999"
                 value="${esc(v?.telefone || '')}" />
          <span class="field-underline"></span>
        </div>
      </div>

      <div class="field mt-5">
        <label class="field-label" for="vd-obs">Observações</label>
        <textarea id="vd-obs" name="observacoes" maxlength="600" rows="4"
                  class="field-input" style="resize:vertical;min-height:5rem"
                  placeholder="opcional — turno, divisão de comissão, etc.">${esc(v?.observacoes || '')}</textarea>
        <span class="field-underline"></span>
      </div>
    </form>
  `;

  abrirModal({
    lateral: true,
    eyebrow: isEdit ? `Editando · ${v.nome}` : 'Nova vendedora',
    titulo:  isEdit ? 'Atualizar dados.' : 'Adicionar à equipe.',
    conteudo: corpo,
    rodape: `
      <div id="vd-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="vd-cancelar" class="btn-link">Cancelar</button>
        <button type="submit" form="vd-form" id="vd-salvar" class="btn-primary">
          ${isEdit ? 'Salvar' : 'Adicionar'}
        </button>
      </div>`,
  });

  const f = (id) => document.querySelector(`#${id}`);
  setTimeout(() => f('vd-nome')?.focus(), 360);

  // Máscara de telefone simples — formato (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX.
  f('vd-telefone').addEventListener('input', (e) => {
    e.target.value = mascaraTelefone(e.target.value);
  });

  f('vd-cancelar').addEventListener('click', () => fecharModal(false));

  f('vd-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = f('vd-erro');
    const btn    = f('vd-salvar');
    erroEl.classList.add('hidden');

    const nome = f('vd-nome').value.trim();
    if (nome.length < 2) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'O nome precisa ter ao menos 2 caracteres.';
      return;
    }
    const email = f('vd-email').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      erroEl.classList.remove('hidden');
      erroEl.textContent = 'Email com formato inválido.';
      return;
    }

    const payload = {
      nome,
      apelido:     f('vd-apelido').value.trim() || null,
      email:       email || null,
      telefone:    f('vd-telefone').value.trim() || null,
      observacoes: f('vd-obs').value.trim() || null,
    };

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;

    let resp;
    if (isEdit) {
      resp = await supabase.from('vendedora').update(payload).eq('id', v.id);
    } else {
      resp = await supabase.from('vendedora').insert(payload);
    }

    btn.removeAttribute('aria-busy');

    if (resp.error) {
      btn.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = traduzirErroVendedora(resp.error);
      return;
    }

    fecharModal(true);
    mostrarToast(isEdit ? 'Vendedora atualizada.' : 'Vendedora cadastrada.', 'ok', 2400);
    await carregarLista();
  });
}

// ─── Confirmação desativar ──────────────────────────────────────────
function confirmarDesativar(v) {
  abrirModal({
    titulo: 'Desativar vendedora?',
    conteudo: `
      <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55">
        <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta);font-size:1.05rem">${esc(v.nome)}</strong>
        ficará indisponível em novos lançamentos. O histórico permanece
        preservado e ela pode ser <em>reativada</em> a qualquer momento.
      </p>
      <p class="text-body" style="margin-top:0.75rem;font-size:0.85rem;color:var(--c-tinta-3)">
        Não há exclusão definitiva — apenas baixa lógica.
      </p>`,
    rodape: `
      <div class="painel-rodape-acoes">
        <button type="button" id="vd-conf-cancelar" class="btn-link">Não, manter ativa</button>
        <button type="button" id="vd-conf-desativar" class="btn-primary"
                style="background:var(--c-alerta);box-shadow:0 1px 0 0 rgba(154,42,31,0.4) inset, 0 6px 14px -8px rgba(154,42,31,0.45)">
          Sim, desativar
        </button>
      </div>`,
  });

  document.querySelector('#vd-conf-cancelar').addEventListener('click', () => fecharModal(false));
  document.querySelector('#vd-conf-desativar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    const { error } = await supabase.from('vendedora').update({ ativa: false }).eq('id', v.id);
    btn.removeAttribute('aria-busy');
    if (error) {
      btn.disabled = false;
      mostrarToast('Não foi possível desativar: ' + error.message, 'erro', 5000);
      return;
    }
    fecharModal(true);
    mostrarToast(`${v.nome} desativada.`, 'ok', 2400);
    await carregarLista();
  });
}

async function reativar(v) {
  const { error } = await supabase.from('vendedora').update({ ativa: true }).eq('id', v.id);
  if (error) {
    mostrarToast('Não foi possível reativar: ' + error.message, 'erro', 5000);
    return;
  }
  mostrarToast(`${v.nome} reativada.`, 'ok', 2400);
  await carregarLista();
}

// ─── Helpers ─────────────────────────────────────────────────────────
function mascaraTelefone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function traduzirErroVendedora(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('duplicate') || m.includes('unique')) {
    return 'Já existe uma vendedora com esse nome.';
  }
  if (m.includes('rls') || m.includes('row-level security') || m.includes('policy')) {
    return 'Você não tem permissão para essa operação.';
  }
  return err.message || 'Erro ao salvar.';
}

function formatarDataCurta(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d).replace('.', '');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
