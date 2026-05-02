// configuracoes-sistema.js — Os parâmetros internos do caderno (CP7.3).
//
// Lista as chaves de config (JSONB) com edição inline tipada.
// Tipo determina o input: number | text | boolean (toggle) | date | time.
// Validação dupla: client-side instantânea + RPC atualizar_config no servidor.
//
// Auditoria visível: cada item mostra atualizado_em + email do último editor.
// Agrupamento por prefixo da chave (caixa.*, notificacao.*, etc.).

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { mostrarToast } from '../notifications.js';
import { pegarPapeis } from '../papeis.js';

const ROTULOS_GRUPO = {
  caixa:        'Caixa diário',
  notificacao:  'Notificações',
  pendencia:    'Pendências',
  sync:         'Sincronização Excel',
};

let configs = [];

export async function renderSistema() {
  const papeis = await pegarPapeis();
  const ehAdmin = papeis.includes('admin');

  if (!ehAdmin) {
    document.querySelector('#app').innerHTML = await renderShell({
      rotaAtiva: 'config',
      conteudo: `
        <main class="max-w-3xl mx-auto px-5 sm:px-8 py-12">
          <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
          <div class="alert mt-6">
            Esta seção é restrita a administradores.
          </div>
        </main>`,
    });
    ligarShell();
    return;
  }

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'config',
    conteudo: `
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/configuracoes" data-link class="btn-link" style="font-size:0.85rem">← Configurações</a>
      </nav>

      <header class="tela-cabec reveal reveal-2" data-etiqueta="ADMIN">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Bastidores · Sistema</p>
          <h1 class="tela-cabec-titulo">Os parâmetros internos do caderno.</h1>
          <p class="tela-cabec-sub">
            Valores que afetam comportamento global. Mude com cuidado —
            todas as alterações são auditadas e visíveis para todos os admins.
          </p>
        </div>
      </header>

      <div class="sis-aviso reveal reveal-3">
        <strong>Atenção:</strong> alterações entram em vigor na próxima execução
        de cada job. Notificações e geração de caixa diário usam os valores
        no momento de rodar — não há cache adicional.
      </div>

      <section id="sis-lista" class="reveal reveal-4"></section>
    </main>
  `,
  });

  ligarShell();
  await carregarLista();
}

// ─── Lista ──────────────────────────────────────────────────────────
async function carregarLista() {
  const lista = document.querySelector('#sis-lista');
  if (!lista) return;
  lista.innerHTML = `
    <div>
      ${[1,2,3,4,5,6].map(() => `<div class="skel" style="height:5rem;margin-bottom:0.5rem"></div>`).join('')}
    </div>`;

  const { data, error } = await supabase
    .from('config_visualizacao')
    .select('*')
    .order('chave');

  if (error) {
    lista.innerHTML = `<p class="alert">Não foi possível carregar configurações. ${esc(error.message)}</p>`;
    return;
  }

  configs = data || [];
  if (configs.length === 0) {
    lista.innerHTML = `<div class="vazio"><p class="vazio-titulo">Sem chaves cadastradas.</p></div>`;
    return;
  }

  // Agrupa por prefixo (parte antes do primeiro ponto)
  const grupos = new Map();
  for (const c of configs) {
    const grp = c.chave.split('.')[0];
    if (!grupos.has(grp)) grupos.set(grp, []);
    grupos.get(grp).push(c);
  }

  let html = '';
  for (const [grp, items] of grupos) {
    html += `<h2 class="sis-grupo-titulo">${esc(ROTULOS_GRUPO[grp] || grp)}</h2>`;
    items.forEach((c, i) => {
      html += rowSistema(c, i);
    });
  }
  lista.innerHTML = html;

  // Liga handlers
  document.querySelectorAll('[data-sis-acao="editar"]').forEach(btn => {
    btn.addEventListener('click', () => abrirEdicao(btn.dataset.sisChave));
  });
}

function rowSistema(c, i) {
  return `
    <article class="sis-row" data-chave="${esc(c.chave)}" style="animation-delay:${i * 30}ms">
      <div class="sis-row-topo">
        <div class="sis-row-info">
          <h3 class="sis-row-chave">${esc(c.chave)}</h3>
          <p class="sis-row-desc">${esc(c.descricao || 'sem descrição')}</p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <span class="sis-row-valor" data-tipo="${esc(c.tipo)}" data-valor="${esc(formatarValor(c))}">
            ${esc(formatarValor(c))}
          </span>
          <button class="vd-card-btn" data-sis-acao="editar" data-sis-chave="${esc(c.chave)}">
            Editar
          </button>
        </div>
      </div>
      <div class="sis-row-edicao" hidden></div>
      <p class="sis-row-audit">
        Atualizado ${formatarRelativo(c.atualizado_em)}
        ${c.atualizado_por_email ? '· por ' + esc(c.atualizado_por_email) : ''}
      </p>
    </article>`;
}

// ─── Edição inline ─────────────────────────────────────────────────
function abrirEdicao(chave) {
  // Fecha qualquer outra edição aberta
  document.querySelectorAll('.sis-row.is-editando').forEach(r => {
    r.classList.remove('is-editando');
    const ed = r.querySelector('.sis-row-edicao');
    if (ed) { ed.innerHTML = ''; ed.hidden = true; }
  });

  const c = configs.find(x => x.chave === chave);
  if (!c) return;
  const row = document.querySelector(`.sis-row[data-chave="${cssEsc(chave)}"]`);
  if (!row) return;

  row.classList.add('is-editando');
  const ed = row.querySelector('.sis-row-edicao');
  ed.hidden = false;
  ed.innerHTML = htmlInputPorTipo(c);

  const f = (sel) => ed.querySelector(sel);
  const inp = f('.sis-edit-input');
  const tog = f('.sis-edit-toggle input');
  const erro = f('.sis-edit-erro');
  const btnSalvar = f('[data-sis-edit="salvar"]');
  const btnCancel = f('[data-sis-edit="cancelar"]');

  setTimeout(() => (inp || tog)?.focus(), 50);

  // Validação client-side em tempo real
  function validarClient() {
    const v = lerValor(c.tipo, inp, tog);
    const r = validarTipo(c.tipo, v);
    if (inp) inp.classList.toggle('is-invalido', !r.ok);
    erro.hidden = r.ok;
    erro.textContent = r.ok ? '' : r.msg;
    btnSalvar.disabled = !r.ok;
    return r.ok;
  }
  inp?.addEventListener('input', validarClient);
  tog?.addEventListener('change', validarClient);
  validarClient();

  btnCancel.addEventListener('click', () => {
    row.classList.remove('is-editando');
    ed.innerHTML = '';
    ed.hidden = true;
  });

  btnSalvar.addEventListener('click', async () => {
    if (!validarClient()) return;
    const v = lerValor(c.tipo, inp, tog);

    btnSalvar.setAttribute('aria-busy', 'true');
    btnSalvar.disabled = true;
    erro.hidden = true;

    const { error } = await supabase.rpc('atualizar_config', {
      p_chave: chave,
      p_valor: v,
    });

    btnSalvar.removeAttribute('aria-busy');

    if (error) {
      btnSalvar.disabled = false;
      erro.hidden = false;
      erro.textContent = error.message || 'Erro ao salvar.';
      return;
    }

    mostrarToast('Configuração atualizada.', 'ok', 2200);
    await carregarLista();
  });
}

// ─── Helpers de tipo ─────────────────────────────────────────────────
function htmlInputPorTipo(c) {
  const v = c.valor;
  let campo = '';
  if (c.tipo === 'boolean') {
    const checked = v === true;
    campo = `
      <label class="sis-edit-toggle">
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span class="sis-edit-toggle-trilho" aria-hidden="true"></span>
        <span class="sis-edit-toggle-rotulo" data-rotulo>${checked ? 'Ativo' : 'Inativo'}</span>
      </label>`;
  } else if (c.tipo === 'number') {
    const decimal = String(v).includes('.');
    campo = `<input type="number" class="sis-edit-input" value="${esc(v)}" step="${decimal ? 'any' : '1'}" inputmode="numeric">`;
  } else if (c.tipo === 'date') {
    campo = `<input type="date" class="sis-edit-input" value="${esc(v)}">`;
  } else if (c.tipo === 'time') {
    campo = `<input type="time" class="sis-edit-input" value="${esc(v)}">`;
  } else {
    campo = `<input type="text" class="sis-edit-input" value="${esc(v ?? '')}" maxlength="200">`;
  }
  return `
    <div class="sis-edit-grid">
      ${campo}
      <button type="button" class="btn-link" data-sis-edit="cancelar">Cancelar</button>
      <button type="button" class="btn-primary" data-sis-edit="salvar"
              style="padding:0.4rem 0.9rem;font-size:0.85rem">Salvar</button>
      <p class="sis-edit-erro" hidden></p>
    </div>`;
}

function lerValor(tipo, inp, tog) {
  if (tipo === 'boolean') {
    // Atualiza rótulo
    const rotEl = tog?.parentElement?.querySelector('[data-rotulo]');
    if (rotEl) rotEl.textContent = tog.checked ? 'Ativo' : 'Inativo';
    return tog?.checked === true;
  }
  if (tipo === 'number') {
    const v = inp?.value ?? '';
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  return inp?.value ?? '';
}

function validarTipo(tipo, v) {
  if (tipo === 'boolean') {
    return typeof v === 'boolean'
      ? { ok: true }
      : { ok: false, msg: 'Marque ou desmarque o toggle.' };
  }
  if (tipo === 'number') {
    if (v === null || v === '' || v === undefined) return { ok: false, msg: 'Informe um número.' };
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, msg: 'Valor numérico inválido.' };
    return { ok: true };
  }
  if (tipo === 'date') {
    if (!v) return { ok: false, msg: 'Informe uma data.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) {
      return { ok: false, msg: 'Data inválida (YYYY-MM-DD).' };
    }
    return { ok: true };
  }
  if (tipo === 'time') {
    if (!v) return { ok: false, msg: 'Informe um horário.' };
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
      return { ok: false, msg: 'Horário inválido (HH:MM).' };
    }
    return { ok: true };
  }
  if (typeof v !== 'string') return { ok: false, msg: 'Valor inválido.' };
  if (v.length > 200) return { ok: false, msg: 'Texto muito longo (máx 200).' };
  return { ok: true };
}

function formatarValor(c) {
  const v = c.valor;
  if (c.tipo === 'boolean') return v === true ? 'Ativo' : 'Inativo';
  if (v === null || v === undefined) return '—';
  return String(v);
}

function formatarRelativo(ts) {
  if (!ts) return 'nunca';
  const d = new Date(ts);
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora há pouco';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 86400 * 7) return `há ${Math.floor(seg / 86400)} dias`;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d).replace('.', '');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function cssEsc(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
}
