// configuracoes-usuarios.js — Quem tem acesso ao caderno (CP7.1).
//
// Lista todos os usuários auth + papéis ativos. Drawer de alteração com
// confirmação dupla por digitação ao promover a admin. Auto-proteção
// visual no card do próprio admin (não pode demover-se sozinho).
//
// Acesso: admin only. Operadores que digitarem a URL veem alerta.

import { supabase, pegarSessao } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModal, fecharModal } from '../../components/modal.js';
import { mostrarToast } from '../notifications.js';
import { carregarPermissoes, temPermissaoSync, invalidarCachePermissoes, limparCachePapeis } from '../papeis.js';

const PALAVRA_PROMOVER = 'promover';

let meuUid = null;

export async function renderUsuarios() {
  // RBAC Sessao 3: troca papeis.includes('admin') por permissao do RBAC.
  // usuario.visualizar eh a permissao mais basica do modulo usuario;
  // admin/gerente tem na seed; super_admin via bypass.
  await carregarPermissoes();
  if (!temPermissaoSync('usuario.visualizar')) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'config',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
          <div class="alert mt-6">
            Esta seção é restrita a administradores. Peça acesso a quem
            cuida do sistema.
          </div>
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
          <p class="h-eyebrow">Acessos · Equipe</p>
          <h1 class="tela-cabec-titulo">Quem tem acesso ao caderno.</h1>
          <p class="tela-cabec-sub">
            Operadores fazem o trabalho do dia. Admins gerenciam o sistema.
            Ninguém pode remover o próprio acesso de admin — peça para
            outro admin se precisar.
          </p>
        </div>
      </header>

      <section id="us-bloco-ativos" class="reveal reveal-3"></section>
      <div id="us-bloco-inativos" class="reveal reveal-4"></div>
    </main>
  `,
  });

  ligarShell();
  await carregarLista();
}

// ─── Lista ──────────────────────────────────────────────────────────
async function carregarLista() {
  const blocoAtivos = document.querySelector('#us-bloco-ativos');
  const blocoInativos = document.querySelector('#us-bloco-inativos');
  if (!blocoAtivos) return;

  blocoAtivos.innerHTML = `
    <div class="vd-grid">
      ${[1, 2, 3].map(() => `<div class="skel" style="height:9.5rem"></div>`).join('')}
    </div>`;
  blocoInativos.innerHTML = '';

  const { data, error } = await supabase.rpc('listar_usuarios_papeis');

  if (error) {
    blocoAtivos.innerHTML = `<p class="alert">Não foi possível carregar usuários. ${esc(error.message)}</p>`;
    return;
  }

  const todos = data || [];
  const ativos = todos.filter(u => u.papeis.length > 0);
  const inativos = todos.filter(u => u.papeis.length === 0);

  if (ativos.length === 0 && inativos.length === 0) {
    blocoAtivos.innerHTML = `
      <div class="vazio">
        <div class="vazio-num">∅</div>
        <p class="vazio-titulo">Nenhum usuário cadastrado.</p>
      </div>`;
    return;
  }

  blocoAtivos.innerHTML = `
    <div class="vd-grid">
      ${ativos.map((u, i) => cardUsuario(u, i)).join('')}
    </div>`;

  if (inativos.length > 0) {
    blocoInativos.innerHTML = `
      <button class="vd-inativas-toggle" type="button" aria-expanded="false" aria-controls="us-inativos-grid">
        <span>Acessos desativados (${inativos.length})</span>
        <span class="vd-toggle-caret" aria-hidden="true">
          <svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 1.5 L6 6.5 L11 1.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
      <div id="us-inativos-grid" class="vd-inativas vd-grid" hidden>
        ${inativos.map((u, i) => cardUsuario(u, i)).join('')}
      </div>`;
  }

  document.querySelectorAll('[data-us-acao]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.usId;
      const u = todos.find(x => x.user_id === id);
      if (!u) return;
      abrirDrawerPapeis(u);
    });
  });

  const tog = document.querySelector('.vd-inativas-toggle');
  if (tog) {
    tog.addEventListener('click', () => {
      const exp = tog.getAttribute('aria-expanded') === 'true';
      tog.setAttribute('aria-expanded', String(!exp));
      const grid = document.querySelector('#us-inativos-grid');
      if (grid) grid.hidden = exp;
    });
  }
}

function cardUsuario(u, i) {
  const ehEu = u.user_id === meuUid;
  const nome = [u.nome, u.sobrenome].filter(Boolean).join(' ').trim() || u.email.split('@')[0];
  const inicial = (u.nome?.[0] || u.email?.[0] || '?').toUpperCase();

  const pilhas = u.papeis.length > 0
    ? u.papeis.map(p => `<span class="us-pill us-pill--${esc(p)}">${esc(rotuloPapel(p))}</span>`).join('')
    : `<span class="us-pill us-pill--sem">sem acesso</span>`;

  const emailStatus = u.email_confirmado
    ? `<span class="us-meta us-meta--ok" title="Email confirmado">${esc(u.email)} <span aria-hidden="true">✓</span></span>`
    : `<span class="us-meta us-meta--warn" title="Email pendente">${esc(u.email)} · pendente</span>`;

  const acesso = u.ultimo_acesso
    ? `último acesso ${formatarRelativo(u.ultimo_acesso)}`
    : 'nunca acessou';

  return `
    <article class="vd-card us-card" data-ativa="${u.papeis.length > 0}" data-eu="${ehEu}" style="animation-delay:${i * 50}ms">
      <div class="us-card-topo">
        <span class="us-avatar" aria-hidden="true">${esc(inicial)}</span>
        <div class="us-cabec">
          <h3 class="vd-card-nome">${esc(nome)}${ehEu ? ' <span class="us-eu">você</span>' : ''}</h3>
          ${emailStatus}
        </div>
      </div>
      <div class="us-pilhas" aria-label="Papéis">${pilhas}</div>
      <p class="vd-card-data">${esc(acesso)} · cadastrado em ${formatarDataCurta(u.cadastrado_em)}</p>
      <div class="vd-card-acoes">
        <button class="vd-card-btn" data-us-acao="papeis" data-us-id="${esc(u.user_id)}">
          Alterar papéis
        </button>
      </div>
    </article>`;
}

// ─── Drawer alterar papéis ──────────────────────────────────────────
function abrirDrawerPapeis(u) {
  const ehEu = u.user_id === meuUid;
  const nome = [u.nome, u.sobrenome].filter(Boolean).join(' ').trim() || u.email.split('@')[0];
  const tinhaAdmin = u.papeis.includes('admin');
  const tinhaOperador = u.papeis.includes('operador');

  const corpo = `
    <p class="text-body" style="color:var(--c-tinta-2);line-height:1.55;margin-bottom:1.25rem">
      Marque os papéis que <strong style="font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--c-tinta)">${esc(nome)}</strong>
      deve ter. Pelo menos um papel é obrigatório.
    </p>

    <div class="us-checks" role="group" aria-label="Papéis">
      <label class="us-check ${tinhaOperador ? 'is-marcado' : ''}">
        <input type="checkbox" id="us-papel-operador" name="papeis" value="operador"
               ${tinhaOperador ? 'checked' : ''}>
        <span class="us-check-marca" aria-hidden="true">
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5 L4.5 8.5 L11 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="us-check-conteudo">
          <span class="us-check-titulo">Operador</span>
          <span class="us-check-desc">Lança NFs, categoriza, abre observações, fecha caixa.</span>
        </span>
      </label>

      <label class="us-check ${tinhaAdmin ? 'is-marcado' : ''} ${ehEu ? 'is-trava' : ''}"
             ${ehEu ? 'title="Você não pode remover seu próprio papel de administrador. Peça para outro admin fazer isso."' : ''}>
        <input type="checkbox" id="us-papel-admin" name="papeis" value="admin"
               ${tinhaAdmin ? 'checked' : ''} ${ehEu ? 'disabled' : ''}>
        <span class="us-check-marca" aria-hidden="true">
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5 L4.5 8.5 L11 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="us-check-conteudo">
          <span class="us-check-titulo">Admin</span>
          <span class="us-check-desc">Tudo do operador + gerenciar usuários, feriados e sistema.</span>
        </span>
      </label>
    </div>

    <div id="us-bloco-promover" class="us-aviso us-aviso--alerta" hidden>
      <div class="us-aviso-cabec">
        <span class="us-aviso-icone" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1.5 L17 16.5 L1 16.5 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
            <path d="M9 7 V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="9" cy="13.5" r="0.85" fill="currentColor"/>
          </svg>
        </span>
        <strong>Promovendo a administrador</strong>
      </div>
      <p>Ao confirmar, <strong>${esc(nome)}</strong> poderá:</p>
      <ul>
        <li>Gerenciar todos os usuários (inclusive remover seu acesso)</li>
        <li>Editar feriados e configurações do sistema</li>
        <li>Forçar fechamento de caixas</li>
        <li>Acessar relatórios completos</li>
      </ul>
      <label class="us-confirma-label" for="us-confirma-input">
        Digite <code>${PALAVRA_PROMOVER}</code> para confirmar:
      </label>
      <input id="us-confirma-input" type="text" class="us-confirma-input"
             autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
    </div>

    <div id="us-bloco-demover" class="us-aviso us-aviso--musgo" hidden>
      <p>Confirma remover privilégios de admin de <strong>${esc(nome)}</strong>?
         O histórico fica preservado — pode promover de novo a qualquer momento.</p>
    </div>

    <div id="us-bloco-zerar" class="us-aviso us-aviso--alerta" hidden>
      <p>Sem nenhum papel marcado, <strong>${esc(nome)}</strong> não conseguirá entrar
         no sistema. Marque ao menos um papel.</p>
    </div>
  `;

  abrirModal({
    lateral: true,
    eyebrow: `Acessos · ${u.email}`,
    titulo: `Alterar papéis`,
    conteudo: corpo,
    rodape: `
      <div id="us-erro" role="alert" aria-live="polite" class="hidden alert" style="margin-bottom:0.85rem"></div>
      <div class="painel-rodape-acoes">
        <button type="button" id="us-cancelar" class="btn-link">Cancelar</button>
        <button type="button" id="us-salvar" class="btn-primary" disabled>Confirmar</button>
      </div>`,
  });

  const f = (id) => document.querySelector(`#${id}`);
  const inOp = f('us-papel-operador');
  const inAd = f('us-papel-admin');
  const blocoProm = f('us-bloco-promover');
  const blocoDem = f('us-bloco-demover');
  const blocoZerar = f('us-bloco-zerar');
  const inputConf = f('us-confirma-input');
  const btnSalvar = f('us-salvar');
  const erroEl = f('us-erro');

  function atualizarUI() {
    const marcouAdmin = inAd.checked;
    const marcouOperador = inOp.checked;
    const algumMarcado = marcouAdmin || marcouOperador;

    inOp.closest('.us-check')?.classList.toggle('is-marcado', marcouOperador);
    inAd.closest('.us-check')?.classList.toggle('is-marcado', marcouAdmin);

    const promovendo = !tinhaAdmin && marcouAdmin && !ehEu;
    const demovendo = tinhaAdmin && !marcouAdmin && !ehEu;
    const zerou = !algumMarcado;

    blocoProm.hidden = !promovendo;
    blocoDem.hidden = !demovendo;
    blocoZerar.hidden = !zerou;

    let podeSalvar = algumMarcado;
    if (promovendo) {
      podeSalvar = podeSalvar && inputConf.value.trim().toLowerCase() === PALAVRA_PROMOVER;
    }
    btnSalvar.disabled = !podeSalvar;
  }

  inOp.addEventListener('change', atualizarUI);
  inAd.addEventListener('change', atualizarUI);
  inputConf.addEventListener('input', atualizarUI);

  f('us-cancelar').addEventListener('click', () => fecharModal(false));

  btnSalvar.addEventListener('click', async () => {
    erroEl.classList.add('hidden');
    const papeis = [
      inOp.checked ? 'operador' : null,
      inAd.checked ? 'admin' : null,
    ].filter(Boolean);

    btnSalvar.setAttribute('aria-busy', 'true');
    btnSalvar.disabled = true;

    const { error } = await supabase.rpc('definir_papeis_usuario', {
      p_user_id: u.user_id,
      p_papeis: papeis,
    });

    btnSalvar.removeAttribute('aria-busy');

    if (error) {
      btnSalvar.disabled = false;
      erroEl.classList.remove('hidden');
      erroEl.textContent = error.message || 'Erro ao salvar.';
      return;
    }

    if (u.user_id === meuUid) limparCachePapeis();
    fecharModal(true);
    mostrarToast('Papéis atualizados.', 'ok', 2400);
    await carregarLista();
  });

  setTimeout(() => atualizarUI(), 50);
}

// ─── Helpers ─────────────────────────────────────────────────────────
function rotuloPapel(p) {
  return p === 'admin' ? 'Admin' : (p === 'operador' ? 'Operador' : p);
}

function formatarDataCurta(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(ts)).replace('.', '');
}

function formatarRelativo(ts) {
  if (!ts) return 'nunca';
  const d = new Date(ts);
  const agora = Date.now();
  const seg = Math.floor((agora - d.getTime()) / 1000);
  if (seg < 60) return 'agora há pouco';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 86400 * 7) return `há ${Math.floor(seg / 86400)} dias`;
  return formatarDataCurta(ts);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
