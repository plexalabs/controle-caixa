// notificacoes.js — Tela /notificacoes (CP5.3 auxiliar).
// Lista paginada (20 por página) das notificações do usuário, com
// filtros lida/não-lida/todas e busca livre. Reusa filter-bar.
// Botões: "marcar como lida" e "descartar" por item.

import { supabase, pegarSessao } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { instalarFilterBar } from '../../components/filter-bar.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';

const POR_PAGINA = 20;
let fbCtrl = null;
let canalNotif = null;
let paginaAtual = 1;
let totalAtual = 0;

export async function renderNotificacoes() {
  desmontar();

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'notificacoes',
    conteudo: `
    <main id="main" class="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <header class="tela-cabec reveal reveal-1">
        <div class="tela-cabec-texto">
          <p class="h-eyebrow">Histórico</p>
          <h1 class="tela-cabec-titulo">Avisos.</h1>
          <p class="tela-cabec-sub">
            Tudo que apareceu — lidas, não lidas e descartadas. Use os filtros
            acima da lista para enxergar o que importa agora.
          </p>
        </div>
      </header>

      <div id="notif-filtros" class="reveal reveal-2"></div>
      <section id="notif-lista" class="reveal reveal-3"></section>
      <nav id="notif-pag" class="reveal reveal-4 mt-6 flex items-center justify-between"
           aria-label="Paginação"></nav>
    </main>
  `,
  });

  ligarShell();

  fbCtrl = instalarFilterBar(document.querySelector('#notif-filtros'), {
    filtros: [
      { id: 'estado', label: 'Estado', tipo: 'select', opcoes: [
        { valor: '',           rotulo: 'Todas' },
        { valor: 'nao_lida',   rotulo: 'Não lidas' },
        { valor: 'lida',       rotulo: 'Lidas' },
        { valor: 'descartada', rotulo: 'Descartadas' },
      ]},
      { id: 'severidade', label: 'Severidade', tipo: 'select', opcoes: [
        { valor: '',         rotulo: 'Todas' },
        { valor: 'urgente',  rotulo: 'Urgente' },
        { valor: 'aviso',    rotulo: 'Aviso' },
        { valor: 'info',     rotulo: 'Info' },
      ]},
      { id: 'busca', label: 'Buscar', tipo: 'texto', placeholder: 'Título ou mensagem' },
    ],
    onChange: () => { paginaAtual = 1; carregar(); },
  });

  // Página inicial vem da URL (?p=N)
  const params = new URLSearchParams(location.search);
  paginaAtual = Math.max(1, parseInt(params.get('p') || '1', 10) || 1);

  await carregar();
  ligarRealtime();
}

async function carregar() {
  const lista = document.querySelector('#notif-lista');
  const pag   = document.querySelector('#notif-pag');
  if (!lista || !pag) return;

  lista.innerHTML = `
    <div class="space-y-2">
      ${[1,2,3,4,5].map(() => `<div class="skel" style="height:4.5rem;border-radius:8px"></div>`).join('')}
    </div>`;
  pag.innerHTML = '';

  const sessao = await pegarSessao();
  const uid = sessao?.user?.id;
  if (!uid) {
    lista.innerHTML = `<p class="alert">Sessão inválida — refaça login.</p>`;
    return;
  }

  const f = fbCtrl?.estado() || {};
  const ini = (paginaAtual - 1) * POR_PAGINA;
  const fim = ini + POR_PAGINA - 1;

  let q = supabase
    .from('notificacao')
    .select('id, tipo, severidade, titulo, mensagem, lancamento_id, caixa_id, lida_em, descartada_em, criada_em', { count: 'exact' })
    .or(`usuario_destino.eq.${uid},usuario_destino.is.null`);

  if (f.estado === 'nao_lida') {
    q = q.is('lida_em', null).is('descartada_em', null);
  } else if (f.estado === 'lida') {
    q = q.not('lida_em', 'is', null).is('descartada_em', null);
  } else if (f.estado === 'descartada') {
    q = q.not('descartada_em', 'is', null);
  } else {
    q = q.is('descartada_em', null);
  }

  if (f.severidade) q = q.eq('severidade', f.severidade);
  if (f.busca) {
    const t = f.busca.replace(/[%_]/g, m => `\\${m}`);
    q = q.or(`titulo.ilike.%${t}%,mensagem.ilike.%${t}%`);
  }

  q = q.order('criada_em', { ascending: false }).range(ini, fim);

  const { data, error, count } = await q;

  if (error) {
    lista.innerHTML = `<p class="alert">Não foi possível carregar. ${esc(error.message)}</p>`;
    return;
  }

  totalAtual = count ?? 0;

  if (!data || data.length === 0) {
    lista.innerHTML = `
      <div class="vazio" style="padding:2rem 1rem">
        <p class="vazio-titulo">Nada por aqui.</p>
        <p class="vazio-desc">Mude os filtros ou aguarde — avisos chegam quando algo precisa de atenção.</p>
      </div>`;
    return;
  }

  lista.innerHTML = `
    <ul class="notif-lista" role="list">
      ${data.map(itemHtml).join('')}
    </ul>`;

  // Navegação ao item
  lista.querySelectorAll('[data-notif-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-acao]')) return;
      const alvo = el.dataset.alvo;
      const id = el.dataset.notifId;
      if (el.dataset.lida === 'false') marcarLida(id);
      if (alvo && alvo !== 'none') navegar(alvo);
    });
  });

  // Botões de ação
  lista.querySelectorAll('[data-acao="marcar-lida"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.closest('[data-notif-id]')?.dataset.notifId;
      if (id) { await marcarLida(id); await carregar(); }
    });
  });
  lista.querySelectorAll('[data-acao="descartar"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.closest('[data-notif-id]')?.dataset.notifId;
      if (id) { await descartar(id); await carregar(); }
    });
  });

  // Paginação
  renderPaginacao();
}

function itemHtml(n) {
  const lida = !!n.lida_em;
  const descartada = !!n.descartada_em;
  let alvo = 'none';
  if (n.caixa_id) alvo = `/caixa/${n.caixa_id}`;
  else if (n.lancamento_id) alvo = '/pendencias';

  return `
    <li>
      <button class="notif-item" data-notif-id="${esc(n.id)}" data-alvo="${esc(alvo)}"
              data-severidade="${esc(n.severidade)}" data-lida="${lida}">
        <div class="notif-item-cabec">
          <strong class="notif-item-titulo">${esc(n.titulo)}</strong>
          <time class="notif-item-tempo" title="${esc(n.criada_em)}">${tempoRelativo(n.criada_em)}</time>
        </div>
        <p class="notif-item-mensagem">${esc(n.mensagem)}</p>
        <div style="margin-top:0.5rem;display:flex;gap:0.6rem;flex-wrap:wrap">
          ${!lida && !descartada ? '<button type="button" class="notif-item-acao" data-acao="marcar-lida">Marcar como lida</button>' : ''}
          ${!descartada ? '<button type="button" class="notif-item-acao" data-acao="descartar" style="color:var(--c-alerta)">Descartar</button>' : '<span class="notif-item-acao" style="opacity:0.6;cursor:default">descartada</span>'}
        </div>
      </button>
    </li>`;
}

function renderPaginacao() {
  const pag = document.querySelector('#notif-pag');
  if (!pag) return;
  const totalPaginas = Math.max(1, Math.ceil(totalAtual / POR_PAGINA));
  if (totalPaginas <= 1) { pag.innerHTML = ''; return; }

  pag.innerHTML = `
    <span class="text-body" style="font-size:0.85rem;color:var(--c-tinta-3)">
      Página <strong style="color:var(--c-tinta);font-family:'Fraunces',serif;font-style:italic">${paginaAtual}</strong>
      de <strong style="color:var(--c-tinta);font-family:'Fraunces',serif;font-style:italic">${totalPaginas}</strong>
      (${totalAtual} ${totalAtual === 1 ? 'aviso' : 'avisos'})
    </span>
    <span style="display:flex;gap:0.6rem">
      <button type="button" class="vd-card-btn" id="pag-prev" ${paginaAtual <= 1 ? 'disabled' : ''}>
        ← Anterior
      </button>
      <button type="button" class="vd-card-btn" id="pag-next" ${paginaAtual >= totalPaginas ? 'disabled' : ''}>
        Próxima →
      </button>
    </span>`;

  document.querySelector('#pag-prev')?.addEventListener('click', () => mudarPagina(paginaAtual - 1));
  document.querySelector('#pag-next')?.addEventListener('click', () => mudarPagina(paginaAtual + 1));
}

function mudarPagina(n) {
  paginaAtual = Math.max(1, n);
  // Atualiza ?p= na URL sem perder filtros existentes.
  const p = new URLSearchParams(location.search);
  if (paginaAtual === 1) p.delete('p');
  else p.set('p', String(paginaAtual));
  const qs = p.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : ''));
  carregar();
  document.querySelector('#main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function marcarLida(id) {
  const { error } = await supabase
    .from('notificacao')
    .update({ lida_em: new Date().toISOString() })
    .eq('id', id);
  if (error) mostrarToast('Erro: ' + error.message, 'erro', 4000);
}

async function descartar(id) {
  const { error } = await supabase
    .from('notificacao')
    .update({ descartada_em: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    mostrarToast('Erro ao descartar: ' + error.message, 'erro', 4000);
    return;
  }
  mostrarToast('Aviso descartado.', 'ok', 1800);
}

function ligarRealtime() {
  canalNotif = supabase.channel('notif-feed')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacao' },
        () => carregar())
    .subscribe();
}

function desmontar() {
  if (canalNotif) {
    supabase.removeChannel(canalNotif).catch(() => {});
    canalNotif = null;
  }
  if (fbCtrl) {
    fbCtrl.destruir();
    fbCtrl = null;
  }
  paginaAtual = 1;
  totalAtual = 0;
}

function tempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'agora';
  if (min < 60)  return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30)    return `${d} dia${d > 1 ? 's' : ''}`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
