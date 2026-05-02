// lancamento.js — Tela /lancamento/:id (CP6.3).
// Ficha técnica do lançamento: dados imutáveis no topo, timeline editorial
// cronológica reversa abaixo, ações conforme estado no rodapé.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModalEditarLancamento } from '../../components/modal-editar-lancamento.js';
import { LABEL_CATEGORIA, dataLonga, resumoDetalhes } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';
import { navegar } from '../router.js';

let canalObs = null;

export async function renderLancamento({ params }) {
  desmontar();
  const lancId = params?.[0];
  if (!/^[0-9a-f-]{36}$/i.test(lancId || '')) {
    return mostrarErro('ID de lançamento inválido.');
  }

  // 1. Carrega lancamento + caixa (join)
  const { data: lanc, error } = await supabase
    .from('lancamento')
    .select('id, numero_nf, codigo_pedido, cliente_nome, valor_nf, categoria, estado, dados_categoria, criado_em, resolvido_em, atualizado_em, caixa_id')
    .eq('id', lancId)
    .maybeSingle();

  if (error) return mostrarErro('Não foi possível carregar: ' + error.message);
  if (!lanc)  return mostrarErro('Lançamento não encontrado.');

  const { data: cx } = await supabase
    .from('caixa').select('id, data, estado').eq('id', lanc.caixa_id).maybeSingle();
  const dataCaixa = cx?.data || '';

  // 2. Render esqueleto
  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'caixas',
    conteudo: `
    <main id="main" class="lanc-tela">
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="${dataCaixa ? '/caixa/' + dataCaixa : '/caixas'}" data-link
           class="btn-link" style="font-size:0.85rem">← ${dataCaixa ? 'Voltar ao caixa' : 'Voltar aos caixas'}</a>
      </nav>

      <header class="lanc-cabec reveal reveal-2" data-cat="${esc(lanc.categoria || '')}" data-estado="${esc(lanc.estado)}">
        <div class="lanc-cabec-conteudo">
          <p class="h-eyebrow">Nota fiscal · ${esc(estadoLabel(lanc.estado))}</p>
          <h1 class="lanc-cabec-numero">NF ${esc(lanc.numero_nf)}</h1>
          <p class="lanc-cabec-cliente">${esc(lanc.cliente_nome || '— sem cliente —')}</p>
        </div>
        <div class="lanc-cabec-direita">
          <span class="lanc-cabec-valor">${formatBRL(lanc.valor_nf)}</span>
          ${lanc.categoria
            ? `<span class="pend-row-cat" data-cat="${esc(lanc.categoria)}">${esc(LABEL_CATEGORIA[lanc.categoria] || lanc.categoria)}</span>`
            : `<span class="pend-row-cat" data-cat="">Em análise</span>`}
        </div>
      </header>

      <section class="lanc-info reveal reveal-3">
        ${blocoInfo('Cliente', esc(lanc.cliente_nome || '—'))}
        ${blocoInfo('Código do pedido', esc(lanc.codigo_pedido || '—'))}
        ${blocoInfo('Categoria', lanc.categoria
          ? esc(LABEL_CATEGORIA[lanc.categoria] || lanc.categoria) +
            (lanc.dados_categoria
              ? ` <span style="color:var(--c-tinta-3);font-size:0.85rem">· ${esc(resumoDetalhes(lanc.categoria, lanc.dados_categoria) || '')}</span>`
              : '')
          : '<em style="color:var(--c-tinta-3)">aguardando categorização</em>', { html: true })}
        ${blocoInfo('Caixa de origem',
          dataCaixa ? `<a href="/caixa/${esc(dataCaixa)}" data-link class="btn-link">${esc(dataLonga(dataCaixa))}</a>` : '—',
          { html: true })}
      </section>

      <section class="lanc-timeline reveal reveal-4" aria-label="Linha do tempo">
        <h2 class="h-eyebrow lanc-timeline-titulo">Linha do tempo</h2>
        <ol id="timeline-lista" class="timeline-lista">
          ${[1,2,3].map(() => `<li class="timeline-skel"><div class="skel" style="height:5rem"></div></li>`).join('')}
        </ol>
      </section>

      <footer class="lanc-rodape reveal reveal-5">
        ${rodapeAcoes(lanc)}
      </footer>
    </main>
  `,
  });

  ligarShell();

  // 3. Carrega timeline real
  await carregarTimeline(lancId);

  // 4. Liga ações do rodapé
  ligarAcoes(lanc, dataCaixa);

  // 5. Realtime: nova observação chega → re-render timeline
  ligarRealtime(lancId);
}

// ─── Timeline ───────────────────────────────────────────────────────
async function carregarTimeline(lancId) {
  const lista = document.querySelector('#timeline-lista');
  if (!lista) return;
  const { data, error } = await supabase.rpc('linha_do_tempo_lancamento', {
    p_lancamento_id: lancId,
  });
  if (error) {
    lista.innerHTML = `<li><p class="alert">Não conseguimos carregar a linha do tempo. ${esc(error.message)}</p></li>`;
    return;
  }
  if (!data || data.length === 0) {
    lista.innerHTML = `<li class="vazio" style="padding:2rem"><p class="vazio-titulo">Sem eventos.</p></li>`;
    return;
  }
  lista.innerHTML = data.map(itemTimeline).join('');
}

function itemTimeline(ev) {
  const tipo = ev.evento_tipo;
  const labels = {
    criacao:           'CRIAÇÃO',
    observacao:        'OBSERVAÇÃO',
    finalizacao:       'FINALIZAÇÃO',
    cancelamento_pos:  'CANCELAMENTO PÓS-PAGAMENTO',
    sistema:           'SISTEMA',
  };
  const label = labels[tipo] || tipo.toUpperCase();
  const tom = tipo === 'finalizacao'      ? 'good'
            : tipo === 'cancelamento_pos' ? 'alerta'
            : tipo === 'criacao'          ? 'criacao'
            : '';

  const c = ev.conteudo || {};
  let corpoHtml = '';
  if (tipo === 'criacao') {
    corpoHtml = `
      <p class="timeline-corpo">
        <strong>NF ${esc(c.numero_nf)}</strong> registrada com valor <strong>${formatBRL(c.valor_nf)}</strong>
        ${c.cliente_nome ? `para <strong>${esc(c.cliente_nome)}</strong>` : ''}
        ${c.codigo_pedido ? `<span style="color:var(--c-tinta-3)">· pedido ${esc(c.codigo_pedido)}</span>` : ''}
      </p>`;
  } else {
    corpoHtml = `<p class="timeline-corpo">${esc(c.texto || '')}</p>`;
  }

  return `
    <li class="timeline-item" data-tom="${esc(tom)}">
      <span class="timeline-bola" aria-hidden="true"></span>
      <div class="timeline-conteudo">
        <div class="timeline-cabec">
          <span class="h-eyebrow timeline-tipo">${esc(label)}</span>
          <time class="timeline-tempo" title="${esc(formatarTimestampLongo(ev.ocorrido_em))}">${esc(formatarTempoRelativo(ev.ocorrido_em))}</time>
        </div>
        ${corpoHtml}
        <p class="timeline-autor">por <span>${esc(truncarEmail(ev.autor_email))}</span></p>
      </div>
    </li>`;
}

// ─── Ações do rodapé ────────────────────────────────────────────────
function ligarAcoes(lanc, dataCaixa) {
  const btn = document.querySelector('#btn-acao-principal');
  if (!btn) return;
  btn.addEventListener('click', () => {
    abrirModalEditarLancamento({
      lancamento: lanc,
      dataCaixa,
      aoSalvar: () => {
        // Recarrega a tela inteira pra refletir mudanças de estado/dados.
        navegar(location.pathname);
      },
    });
  });
}

function rodapeAcoes(lanc) {
  let label;
  if (lanc.estado === 'pendente' || lanc.estado === 'em_preenchimento') {
    label = 'Categorizar lançamento';
  } else if (lanc.estado === 'completo') {
    label = 'Adicionar observação ou finalizar';
  } else if (lanc.estado === 'finalizado' || lanc.estado === 'cancelado_pos') {
    label = 'Adicionar observação';
  } else {
    label = 'Abrir';
  }
  return `
    <button id="btn-acao-principal" class="btn-primary">${esc(label)}</button>
  `;
}

// ─── Realtime ───────────────────────────────────────────────────────
function ligarRealtime(lancId) {
  canalObs = supabase.channel(`lanc-tl-${lancId}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lancamento_observacao', filter: `lancamento_id=eq.${lancId}` },
        () => carregarTimeline(lancId))
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lancamento', filter: `id=eq.${lancId}` },
        () => carregarTimeline(lancId))
    .subscribe();
}

function desmontar() {
  if (canalObs) {
    supabase.removeChannel(canalObs).catch(() => {});
    canalObs = null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
function blocoInfo(label, valor, opts = {}) {
  return `
    <div class="lanc-info-bloco">
      <p class="h-eyebrow">${esc(label)}</p>
      <p class="lanc-info-valor">${opts.html ? valor : esc(valor)}</p>
    </div>`;
}

function estadoLabel(estado) {
  const m = {
    pendente: 'em análise', em_preenchimento: 'em preenchimento',
    completo: 'aguardando desfecho', finalizado: 'finalizada',
    cancelado_pos: 'cancelada pós-pagamento', cancelado: 'cancelada',
    excluido: 'excluída',
  };
  return m[estado] || estado;
}

function truncarEmail(email) {
  if (!email || email === '—') return email || '—';
  const [user] = email.split('@');
  return user;
}

function formatarTempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h} h atrás`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d} dia${d > 1 ? 's' : ''} atrás`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts));
}
function formatarTimestampLongo(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

function mostrarErro(msg) {
  // Usa o shell editorial da 404 com etiqueta âmbar lateral. Texto e CTAs
  // contextuais a "Lançamento não encontrado / inválido", em vez do 404
  // genérico — guia o operador de volta pra /caixas (lugar natural pra
  // procurar uma NF, não pra /dashboard).
  document.querySelector('#app').innerHTML = `
    <main id="main" class="erro-shell" role="main">
      <aside class="erro-etiqueta" aria-hidden="true">NF</aside>

      <section class="erro-conteudo">
        <p class="h-eyebrow">Lançamento não encontrado</p>
        <h1 class="erro-titulo">
          Esta nota fiscal<br>
          <em>não está no caderno.</em>
        </h1>
        <p class="erro-texto">
          ${esc(msg)} Pode ter sido excluído, arquivado ou o link veio com
          o identificador errado. Confira a lista de caixas pra encontrá-lo.
        </p>
        <div class="erro-acoes">
          <a href="/caixas" data-link class="btn-primary">Ver todos os caixas</a>
          <a href="/dashboard" data-link class="btn-link">Ir para o início</a>
        </div>
      </section>
    </main>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
