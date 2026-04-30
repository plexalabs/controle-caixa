// caixa.js — Tela /caixa/hoje e /caixa/:data (CP3.2, Fase 2).
// Cabeçalho com data, tab strip dos últimos 14 dias, lista de lançamentos
// com cores canônicas, realtime, estado vazio, criar caixa se não existe.

import { supabase } from '../supabase.js';
import { renderHeader, ligarHeader } from '../../components/header.js';
import { abrirModalAdicionarNF }    from '../../components/modal-adicionar-nf.js';
import { abrirModalEditarLancamento } from '../../components/modal-editar-lancamento.js';
import { dataLonga, dataCurta, isoData, hora,
         LABEL_CATEGORIA, LABEL_CATEGORIA_CURTA, ESTADO_CAIXA,
         resumoDetalhes } from '../dominio.js';
import { formatBRL } from '../utils.js';
import { mostrarToast } from '../notifications.js';

let canalLanc = null;
let caixaIdAtual = null;
let dataAlvoAtual = null;

export async function renderCaixa({ params }) {
  desmontar();

  // params[0] = /caixa/:data → 'hoje' ou 'YYYY-MM-DD'.
  const slug = params?.[0] ?? 'hoje';
  const dataAlvo = slug === 'hoje' ? isoData(new Date()) : slug;

  // Validação básica de formato YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAlvo)) {
    return mostrarErroEFim('Data inválida.');
  }

  document.querySelector('#app').innerHTML = `
    ${await renderHeader('caixas')}
    <main id="main" class="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <!-- Voltar para a lista -->
      <nav class="mb-5 reveal reveal-1" aria-label="Voltar">
        <a href="/caixas" data-link class="btn-link" style="font-size:0.85rem">← Todos os caixas</a>
      </nav>

      <!-- Cabeçalho do dia -->
      <header class="mb-7 reveal reveal-2">
        <p class="h-eyebrow">Caixa de</p>
        <div class="flex flex-wrap items-baseline justify-between gap-4 mt-1">
          <h1 class="h-display text-3xl sm:text-4xl" style="font-style:normal;font-weight:500"
              id="cab-data">${dataLonga(dataAlvo)}</h1>
          <div class="flex items-center gap-3">
            <span id="cab-status" class="badge-status"></span>
            <button id="btn-novo" class="btn-primary" disabled>
              + Novo lançamento
            </button>
          </div>
        </div>
      </header>

      <!-- Conteúdo principal -->
      <section id="bloco-conteudo" class="reveal reveal-3">
        ${blocoSkel()}
      </section>

      <!-- Resumo do rodapé -->
      <footer id="rodape" class="hidden mt-10 pt-6 border-t reveal reveal-4"
              style="border-color:var(--c-papel-3)"></footer>
    </main>
  `;

  ligarHeader();

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
    .select('id, numero_nf, codigo_pedido, cliente_nome, valor_nf, categoria, estado, dados_categoria, criado_em, resolvido_em')
    .eq('caixa_id', caixaId)
    .neq('estado', 'excluido')
    .order('criado_em', { ascending: true });

  if (error) {
    bloco.innerHTML = `<p class="alert">Não conseguimos carregar os lançamentos.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    bloco.innerHTML = `
      <div class="vazio">
        <div class="vazio-num">∅</div>
        <p class="vazio-titulo">Nenhum lançamento ainda.</p>
        <p class="vazio-desc">Comece pelo botão <strong>+ Novo lançamento</strong> no canto superior direito.</p>
      </div>`;
    atualizarRodape([]);
    return;
  }

  bloco.innerHTML = data.map(linhaLancamento).join('');

  // Mapa rapido id → lançamento, para abrir o drawer com o objeto certo.
  const porId = Object.fromEntries(data.map(l => [l.id, l]));

  bloco.querySelectorAll('.lanc-row').forEach(el => {
    el.addEventListener('click', () => {
      const lanc = porId[el.dataset.id];
      if (!lanc) return;
      abrirModalEditarLancamento({
        lancamento: lanc,
        dataCaixa:  dataAlvoAtual,
        aoSalvar:   () => carregarLancamentos(caixaId),
      });
    });
  });

  atualizarRodape(data);
}

function linhaLancamento(l) {
  const cat            = l.categoria || '';
  const labelLongo     = cat ? (LABEL_CATEGORIA[cat] || cat) : 'Em análise';
  const labelVertical  = cat ? (LABEL_CATEGORIA_CURTA[cat] || cat.toUpperCase()) : 'EM ANÁLISE';
  const ehAtrasado     = l.estado === 'pendente' && diasUteisDesde(l.criado_em) > 3;
  const ehResolvido    = l.estado === 'resolvido';
  const emAnalise      = !cat;
  const estadoFinal    = l.dados_categoria?.estado_final || '';
  const detalheBase    = cat ? resumoDetalhes(cat, l.dados_categoria) : '';
  const detalheSuffix  = estadoFinal === 'finalizado' ? ' · finalizado'
                       : estadoFinal === 'cancelado'  ? ' · cancelado pós-pagamento'
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

// ─── Rodapé com totais ────────────────────────────────────────────────────
function atualizarRodape(lancamentos) {
  const rod = document.querySelector('#rodape');
  if (!rod) return;
  if (lancamentos.length === 0) { rod.classList.add('hidden'); return; }
  rod.classList.remove('hidden');

  const validos    = lancamentos.filter(l => l.categoria !== 'cancelado');
  const total      = validos.reduce((s, l) => s + Number(l.valor_nf || 0), 0);
  const emAnalise  = lancamentos.filter(l => !l.categoria);
  const pendentes  = lancamentos.filter(l => ['pendente','em_preenchimento'].includes(l.estado));
  const resolvidos = lancamentos.filter(l => l.estado === 'resolvido');
  const cancelados = lancamentos.filter(l => l.categoria === 'cancelado');

  // Distribuição por categoria — exclui pendentes "em análise" da contagem.
  const dist = {};
  for (const l of validos) {
    if (!l.categoria) continue;
    dist[l.categoria] = (dist[l.categoria] || 0) + 1;
  }

  rod.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <div>
        <p class="h-eyebrow">Total do dia</p>
        <p class="h-display" style="font-style:normal;font-weight:500;font-size:2.2rem;font-variant-numeric:tabular-nums;line-height:1.05">
          ${formatBRL(total)}
        </p>
        <p class="text-sm" style="color:var(--c-tinta-3)">${validos.length} lançamento${validos.length !== 1 ? 's' : ''} válidos</p>
      </div>
      <div>
        <p class="h-eyebrow">Distribuição</p>
        <ul class="lista-edit" style="margin-top:0.5rem">
          ${Object.entries(dist).map(([cat, n]) =>
            `<li>${esc(LABEL_CATEGORIA[cat] || cat)} — ${n}</li>`
          ).join('') || '<li style="color:var(--c-tinta-3)">—</li>'}
        </ul>
      </div>
      <div>
        <p class="h-eyebrow">Status</p>
        <ul class="lista-edit" style="margin-top:0.5rem">
          <li>Em análise: <strong style="color:${emAnalise.length > 0 ? 'var(--cat-pendente-text)' : 'var(--c-tinta-3)'}">${emAnalise.length}</strong></li>
          <li>Pendentes: <strong style="color:${pendentes.length > 0 ? 'var(--c-ambar-2)' : 'var(--c-musgo)'}">${pendentes.length}</strong></li>
          <li>Resolvidas hoje: <strong>${resolvidos.length}</strong></li>
          <li>Canceladas: <strong>${cancelados.length}</strong></li>
        </ul>
      </div>
    </div>`;
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
