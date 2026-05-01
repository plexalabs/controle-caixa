// caixa.js — Tela /caixa/hoje e /caixa/:data (CP3.2, Fase 2).
// Cabeçalho com data, tab strip dos últimos 14 dias, lista de lançamentos
// com cores canônicas, realtime, estado vazio, criar caixa se não existe.

import { supabase } from '../supabase.js';
import { renderShell, ligarShell } from '../shell.js';
import { abrirModalAdicionarNF }    from '../../components/modal-adicionar-nf.js';
import { abrirModalEditarLancamento } from '../../components/modal-editar-lancamento.js';
import { instalarFilterBar } from '../../components/filter-bar.js';
import { dataLonga, dataCurta, isoData, hora,
         LABEL_CATEGORIA, LABEL_CATEGORIA_CURTA, ESTADO_CAIXA,
         CATEGORIAS, resumoDetalhes } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';

let canalLanc = null;
let caixaIdAtual = null;
let dataAlvoAtual = null;
let lancCache = [];      // CP5.5: cache para filtros client-side
let fbCtrl = null;

export async function renderCaixa({ params }) {
  desmontar();

  // params[0] = /caixa/:data → 'hoje' ou 'YYYY-MM-DD'.
  const slug = params?.[0] ?? 'hoje';
  const dataAlvo = slug === 'hoje' ? isoData(new Date()) : slug;

  // Validação básica de formato YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo)) {
    return mostrarErroEFim('Data inválida.');
  }

  document.querySelector('#app').innerHTML = await renderShell({
    rotaAtiva: 'caixas',
    conteudo: `
    <main id="main" class="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <!-- Voltar para a lista -->
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/caixas" data-link class="btn-link" style="font-size:0.85rem">← Todos os caixas</a>
      </nav>

      <!-- Cabeçalho do dia -->
      <header class="mb-6 reveal reveal-2">
        <p class="h-eyebrow">Caixa de</p>
        <div class="flex flex-wrap items-baseline justify-between gap-4 mt-1">
          <h1 class="h-display text-3xl sm:text-4xl" style="font-style:normal;font-weight:500"
              id="cab-data">${dataLonga(dataAlvo)}</h1>
          <div class="flex items-center gap-3">
            <span id="cab-status" class="badge-status"></span>
          </div>
        </div>
      </header>

      <!-- Resumo do dia: contexto antes da leitura linha-a-linha -->
      <aside id="rodape" class="resumo-dia hidden reveal reveal-3" aria-label="Resumo do dia"></aside>

      <!-- Botão de ação principal — entre o resumo e a lista -->
      <div class="resumo-acao reveal reveal-3">
        <button id="btn-novo" class="btn-primary" disabled>
          + Novo lançamento
        </button>
      </div>

      <!-- Filter-bar (CP5.5) — só aparece quando há lançamentos -->
      <div id="cx-filtros" class="reveal reveal-4 hidden" style="margin-top:1.5rem"></div>

      <!-- Conteúdo principal: lista de lançamentos -->
      <section id="bloco-conteudo" class="reveal reveal-4">
        ${blocoSkel()}
      </section>
    </main>
  `,
  });

  ligarShell();

  // Carrega caixa do dia. Se não existe, oferece criar.
  await carregarCaixa(dataAlvo);
}

// ─── Carrega caixa + lançamentos ──────────────────────────────────────────
async function carregarCaixa(dataAlvo) {
  const bloco  = document.querySelector('#bloco-conteudo');
  const status = document.querySelector('#cab-status');
  const btnNov = document.querySelector('#btn-novo');

  // 1. Busca caixa pela data.
  const { data: caixa } = await supabase
    .from('caixa')
    .select('id, data, estado, total_lancamentos, total_pendentes, total_valor')
    .eq('data', dataAlvo)
    .maybeSingle();

  // Se não existe → estado vazio com botão criar (apenas se for hoje ou passado).
  if (!caixa) {
    status.textContent = '';
    btnNov.disabled = true;
    bloco.innerHTML = renderSemCaixa(dataAlvo);

    const btnCriar = document.querySelector('#btn-criar-caixa');
    if (btnCriar) {
      btnCriar.addEventListener('click', async () => {
        btnCriar.setAttribute('aria-busy', 'true');
        btnCriar.disabled = true;
        const { error } = await supabase.rpc('criar_caixa_se_nao_existe', { p_data: dataAlvo });
        if (error) {
          mostrarToast('Não foi possível criar o caixa: ' + error.message, 'erro', 5000);
          btnCriar.removeAttribute('aria-busy');
          btnCriar.disabled = false;
          return;
        }
        mostrarToast('Caixa aberto.', 'ok', 2000);
        await carregarCaixa(dataAlvo);
      });
    }
    return;
  }

  caixaIdAtual = caixa.id;
  dataAlvoAtual = dataAlvo;
  status.textContent = ESTADO_CAIXA[caixa.estado] || caixa.estado;
  status.dataset.estado = caixa.estado;
  btnNov.disabled = caixa.estado === 'fechado' || caixa.estado === 'arquivado';
  btnNov.onclick = () =>
    abrirModalAdicionarNF({ dataCaixa: dataAlvo, aoSalvar: () => carregarLancamentos(caixa.id) });

  await carregarLancamentos(caixa.id);
  ligarRealtime(caixa.id);
}

async function carregarLancamentos(caixaId) {
  const bloco  = document.querySelector('#bloco-conteudo');
  if (!bloco) return;

  const { data, error } = await supabase
    .from('lancamento')
    .select('id, numero_nf, codigo_pedido, cliente_nome, valor_nf, categoria, estado, dados_categoria, criado_em, resolvido_em, atualizado_em')
    .eq('caixa_id', caixaId)
    .neq('estado', 'excluido')
    .order('criado_em', { ascending: true });

  if (error) {
    bloco.innerHTML = `<p class="alert">Não conseguimos carregar os lançamentos.</p>`;
    return;
  }

  lancCache = data || [];

  if (lancCache.length === 0) {
    document.querySelector('#cx-filtros')?.classList.add('hidden');
    bloco.innerHTML = `
      <div class="vazio">
        <div class="vazio-num">∅</div>
        <p class="vazio-titulo">Nenhum lançamento ainda.</p>
        <p class="vazio-desc">Comece pelo botão <strong>+ Novo lançamento</strong> no canto superior direito.</p>
      </div>`;
    atualizarRodape([]);
    return;
  }

  // CP5.5: instala filter-bar na primeira carga (ou reaplica estado da URL)
  garantirFilterBar();
  renderListaFiltrada();
  atualizarRodape(lancCache);
}

// ─── CP5.5: filter-bar do caixa do dia ────────────────────────────────
function garantirFilterBar() {
  const cont = document.querySelector('#cx-filtros');
  if (!cont) return;
  cont.classList.remove('hidden');
  if (fbCtrl) return;   // já instalado nesta visita

  fbCtrl = instalarFilterBar(cont, {
    filtros: [
      { id: 'categoria', label: 'Categoria', tipo: 'select', opcoes: [
        { valor: '',           rotulo: 'Todas' },
        { valor: 'em_analise', rotulo: 'Em análise (sem categoria)' },
        ...CATEGORIAS.map(c => ({ valor: c.valor, rotulo: c.rotulo })),
      ]},
      { id: 'estado', label: 'Estado', tipo: 'select', opcoes: [
        { valor: '',              rotulo: 'Todos' },
        { valor: 'pendente',      rotulo: 'Em análise' },
        { valor: 'completo',      rotulo: 'Categorizado' },
        { valor: 'finalizado',    rotulo: 'Finalizado' },
        { valor: 'cancelado_pos', rotulo: 'Cancelado pós-pagamento' },
      ]},
      { id: 'busca', label: 'Buscar', tipo: 'texto', placeholder: 'NF ou cliente' },
      { id: 'ocultar_resolvidos', label: 'Ocultar resolvidos', tipo: 'toggle' },
    ],
    onChange: () => renderListaFiltrada(),
  });
}

function renderListaFiltrada() {
  const bloco = document.querySelector('#bloco-conteudo');
  if (!bloco) return;
  const f = fbCtrl?.estado() || {};
  const filtrados = aplicarFiltrosCaixa(lancCache, f);

  if (filtrados.length === 0) {
    bloco.innerHTML = `
      <div class="vazio" style="padding:2rem 1.5rem">
        <p class="vazio-titulo" style="font-size:1.1rem">Nenhum lançamento com esses filtros.</p>
        <p class="vazio-desc">Ajuste os filtros acima ou clique em <em>Limpar filtros</em>.</p>
      </div>`;
    return;
  }

  bloco.innerHTML = filtrados.map(linhaLancamento).join('');

  const porId = Object.fromEntries(filtrados.map(l => [l.id, l]));
  bloco.querySelectorAll('.lanc-row').forEach(el => {
    el.addEventListener('click', () => {
      const lanc = porId[el.dataset.id];
      if (!lanc) return;
      abrirModalEditarLancamento({
        lancamento: lanc,
        dataCaixa:  dataAlvoAtual,
        aoSalvar:   () => carregarLancamentos(caixaIdAtual),
      });
    });
  });
}

function aplicarFiltrosCaixa(itens, f) {
  return itens.filter(l => {
    // Ocultar resolvidos = remove finalizados, cancelado_pos, cancelado, resolvido.
    if (f.ocultar_resolvidos &&
        ['finalizado','cancelado_pos','cancelado','resolvido'].includes(l.estado)) {
      return false;
    }
    if (f.categoria) {
      if (f.categoria === 'em_analise') {
        if (l.categoria != null) return false;
      } else {
        if (l.categoria !== f.categoria) return false;
      }
    }
    if (f.estado && l.estado !== f.estado) return false;
    if (f.busca) {
      const q = f.busca.toLowerCase();
      const nf = (l.numero_nf || '').toLowerCase();
      const cli = (l.cliente_nome || '').toLowerCase();
      const ped = (l.codigo_pedido || '').toLowerCase();
      if (!nf.includes(q) && !cli.includes(q) && !ped.includes(q)) return false;
    }
    return true;
  });
}

function linhaLancamento(l) {
  const cat            = l.categoria || '';
  const labelLongo     = cat ? (LABEL_CATEGORIA[cat] || cat) : 'Em análise';
  const labelVertical  = cat ? (LABEL_CATEGORIA_CURTA[cat] || cat.toUpperCase()) : 'EM ANÁLISE';
  const ehAtrasado     = l.estado === 'pendente' && diasUteisDesde(l.criado_em) > 3;
  const ehResolvido    = ['resolvido','finalizado'].includes(l.estado);
  const emAnalise      = !cat;

  // estado_final agora vem do enum real, nao mais do JSON.
  const estadoFinal    = l.estado === 'finalizado' ? 'finalizado'
                       : ['cancelado_pos','cancelado'].includes(l.estado) ? 'cancelado'
                       : '';

  const dataDesfecho   = l.resolvido_em || l.atualizado_em;
  const dataCurtaFmt   = dataDesfecho ? formatarDataBR(dataDesfecho) : '';
  const detalheBase    = cat ? resumoDetalhes(cat, l.dados_categoria) : '';
  const detalheSuffix  = estadoFinal === 'finalizado' ? ` · finalizado${dataCurtaFmt ? ' em ' + dataCurtaFmt : ''}`
                       : estadoFinal === 'cancelado'  ? ` · cancelado pós-pagamento${dataCurtaFmt ? ' em ' + dataCurtaFmt : ''}`
                       : '';

  return `
    <button class="lanc-row" data-cat="${esc(cat)}"
            data-cat-label="${esc(labelVertical)}"
            data-em-analise="${emAnalise}"
            data-estado-final="${esc(estadoFinal)}"
            data-resolvido="${ehResolvido}" data-atrasado="${ehAtrasado}"
            data-id="${esc(l.id)}">
      <div class="lanc-meta">
        <span class="lanc-meta-nf">NF ${esc(l.numero_nf)}</span>
        <span style="font-style:italic">${hora(l.criado_em)}</span>
      </div>
      <div class="lanc-corpo">
        <span class="lanc-cliente">${esc(l.cliente_nome || '— sem cliente —')}</span>
        ${cat
          ? `<div class="lanc-detalhes">${esc(detalheBase + detalheSuffix)}</div>`
          : `<div class="lanc-detalhes lanc-detalhes--analise">aguardando categorização</div>`}
      </div>
      <div class="lanc-direita">
        <span class="lanc-valor">${formatBRL(l.valor_nf)}</span>
        <span class="lanc-categoria ${emAnalise ? 'lanc-categoria--analise' : ''}">${esc(labelLongo)}</span>
      </div>
    </button>`;
}

// ─── Resumo do dia ─────────────────────────────────────────────────────────
// 3 blocos em coluna, com label-eyebrow à esquerda e conteúdo à direita.
// Mobile empilha. Cada bloco tem identidade visual propria.
function atualizarRodape(lancamentos) {
  const rod = document.querySelector('#rodape');
  if (!rod) return;
  if (lancamentos.length === 0) { rod.classList.add('hidden'); return; }
  rod.classList.remove('hidden');

  // Categorias filtradas pelo estado real do enum (CP4):
  const ehCancelado = (l) => l.categoria === 'cancelado'
                          || ['cancelado','cancelado_pos'].includes(l.estado);
  const validos    = lancamentos.filter(l => !ehCancelado(l));
  const total      = validos.reduce((s, l) => s + Number(l.valor_nf || 0), 0);

  const emAnalise  = lancamentos.filter(l => !l.categoria);
  const emCurso    = lancamentos.filter(l => l.categoria && l.estado === 'completo');
  const resolvidos = lancamentos.filter(l => ['resolvido','finalizado'].includes(l.estado));
  const cancelados = lancamentos.filter(ehCancelado);

  // Distribuição por categoria (apenas categorizados, exclui em-análise).
  const dist = {};
  for (const l of validos) {
    if (!l.categoria) continue;
    dist[l.categoria] = (dist[l.categoria] || 0) + 1;
  }

  rod.innerHTML = `
    <div class="resumo-dia-bloco resumo-dia-bloco--total">
      <p class="h-eyebrow">Total do dia</p>
      <div class="resumo-dia-total">
        <span class="resumo-dia-total-valor">${formatBRL(total)}</span>
        <span class="resumo-dia-total-quant">
          ${validos.length} ${validos.length === 1 ? 'lançamento válido' : 'lançamentos válidos'}
        </span>
      </div>
    </div>

    <div class="resumo-dia-bloco resumo-dia-bloco--estado">
      <p class="h-eyebrow">Estado</p>
      <div class="resumo-dia-chips">
        ${chipEstado('analise',   'Em análise', emAnalise.length)}
        ${chipEstado('curso',     'Em curso',   emCurso.length)}
        ${chipEstado('resolvido', 'Resolvidas', resolvidos.length)}
        ${chipEstado('cancelado', 'Canceladas', cancelados.length)}
      </div>
    </div>

    ${Object.keys(dist).length ? `
      <div class="resumo-dia-bloco resumo-dia-bloco--dist">
        <p class="h-eyebrow">Distribuição</p>
        <div class="resumo-dia-cats">
          ${Object.entries(dist).map(([cat, n]) => `
            <span class="rd-cat" data-cat="${esc(cat)}">
              <span class="rd-cat-conteudo">
                <span class="rd-cat-nome">${esc(LABEL_CATEGORIA[cat] || cat)}</span>
                <span class="rd-cat-num">${n}</span>
              </span>
            </span>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function chipEstado(tom, rotulo, n) {
  return `
    <span class="rd-chip" data-tom="${tom}" data-zero="${n === 0 ? 'true' : 'false'}">
      <span class="rd-chip-num">${n}</span>
      <span class="rd-chip-rotulo">${rotulo}</span>
    </span>`;
}

function renderSemCaixa(dataAlvo) {
  return `
    <div class="vazio">
      <div class="vazio-num">○</div>
      <p class="vazio-titulo">Sem caixa aberto para esta data.</p>
      <p class="vazio-desc">
        O caixa é gerado automaticamente todo dia útil às 06h.
        Se ainda não rolou, abra manualmente abaixo.
      </p>
      <button id="btn-criar-caixa" class="btn-primary mt-4">
        Abrir caixa de ${dataCurta(dataAlvo)}
      </button>
    </div>`;
}

function formatarDataBR(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function diasUteisDesde(ts) {
  const ini = new Date(ts);
  const hoje = new Date();
  let dias = 0;
  const cur = new Date(ini);
  cur.setHours(0,0,0,0);
  hoje.setHours(0,0,0,0);
  while (cur < hoje) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) dias++;
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

// ─── Realtime ─────────────────────────────────────────────────────────────
function ligarRealtime(caixaId) {
  canalLanc = supabase.channel(`caixa-${caixaId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lancamento', filter: `caixa_id=eq.${caixaId}` },
        (payload) => {
          carregarLancamentos(caixaId).then(() => {
            // Pisca a linha que mudou (se ainda estiver no DOM).
            const id = payload.new?.id || payload.old?.id;
            if (!id) return;
            const el = document.querySelector(`.lanc-row[data-id="${id}"]`);
            if (el) el.classList.add('lanc-row--flash');
          });
        })
    .subscribe();
}

function desmontar() {
  if (canalLanc) {
    supabase.removeChannel(canalLanc).catch(() => {});
    canalLanc = null;
  }
  if (fbCtrl) {
    fbCtrl.destruir();
    fbCtrl = null;
  }
  lancCache = [];
}

function blocoSkel() {
  return `
    <div class="space-y-2">
      ${[1,2,3,4].map(() => `<div class="skel" style="height:4rem"></div>`).join('')}
    </div>`;
}

function mostrarErroEFim(msg) {
  document.querySelector('#app').innerHTML = `
    <main class="min-h-screen flex items-center justify-center p-8 text-center">
      <div>
        <p class="h-eyebrow" style="color:var(--c-alerta)">Erro</p>
        <h1 class="h-display text-4xl mt-1 mb-4">${esc(msg)}</h1>
        <a href="/dashboard" data-link class="btn-link">Voltar ao painel</a>
      </div>
    </main>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
