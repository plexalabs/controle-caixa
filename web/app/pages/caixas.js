// caixas.js — tela /caixas: arquivo editorial de todos os caixas.
// Lista cada caixa que existe (criado manual ou pelo cron diario), com
// resumo de lancamentos, pendentes, resolvidas, canceladas e status.

import { supabase } from '../supabase.js';
import { renderHeader, ligarHeader } from '../../components/header.js';
import { ESTADO_CAIXA, LABEL_ESTADO_CAIXA_CURTO } from '../dominio.js';
import { formatBRL } from '../utils.js';

export async function renderCaixas() {
  document.querySelector('#app').innerHTML = `
    ${await renderHeader('caixas')}
    <main class="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <header class="caixas-cabec reveal reveal-1" data-etiqueta="ARQUIVO">
        <div class="caixas-cabec-conteudo">
          <h1 class="h-display caixas-titulo">Os caixas, em ordem.</h1>
          <p class="caixas-subtitulo text-body">
            Cada dia útil ganha sua página. Aqui ficam todas — abertas,
            em conferência ou já fechadas.
          </p>
        </div>
      </header>

      <section id="lista-caixas" class="reveal reveal-2 mt-8"></section>
    </main>
  `;
  ligarHeader();
  await carregarCaixas();
}

async function carregarCaixas() {
  const lista = document.querySelector('#lista-caixas');
  if (!lista) return;

  lista.innerHTML = `
    <div class="space-y-3">
      ${[1,2,3,4].map(() => `<div class="skel" style="height:6.5rem"></div>`).join('')}
    </div>`;

  const [caixasRes, statsRes] = await Promise.all([
    supabase.from('caixa')
      .select('id, data, estado, total_lancamentos, total_pendentes, total_valor')
      .order('data', { ascending: false }),
    supabase.from('lancamento')
      .select('caixa_id, categoria, estado')
      .neq('estado', 'excluido'),
  ]);

  if (caixasRes.error) {
    lista.innerHTML = `<p class="alert">Não conseguimos carregar os caixas. ${esc(caixasRes.error.message)}</p>`;
    return;
  }

  const caixas       = caixasRes.data ?? [];
  const lancamentos  = statsRes.data ?? [];

  // Agrega resolvidos e cancelados por caixa.
  const stats = {};
  for (const l of lancamentos) {
    const k = l.caixa_id;
    if (!stats[k]) stats[k] = { resolvidos: 0, cancelados: 0 };
    if (l.estado === 'resolvido')    stats[k].resolvidos++;
    if (l.categoria === 'cancelado') stats[k].cancelados++;
  }

  if (caixas.length === 0) {
    lista.innerHTML = `
      <div class="vazio">
        <div class="vazio-num">∅</div>
        <p class="vazio-titulo">Nenhum caixa criado ainda.</p>
        <p class="vazio-desc">
          O caixa do dia é gerado automaticamente todo dia útil às 06h.
          Você também pode abrir um manualmente em
          <a href="/caixa/hoje" data-link>Caixa de hoje</a>.
        </p>
      </div>`;
    return;
  }

  // Cards em grid de 2 colunas no desktop, 1 no mobile.
  lista.innerHTML = `
    <div class="caixas-grid">
      ${caixas.map((c, i) =>
        linhaCaixa(c, stats[c.id] || { resolvidos: 0, cancelados: 0 }, i)
      ).join('')}
    </div>`;
}

function linhaCaixa(c, s, i) {
  const total   = c.total_lancamentos ?? 0;
  const pend    = c.total_pendentes ?? 0;
  const valor   = c.total_valor ?? 0;
  const dia     = diaSemanaCurto(c.data);          // "QUI"
  const diaNum  = diaDoMes(c.data);                // "30"
  const mesSlash = mesComBarra(c.data);            // "/04"
  const titulo  = tituloCompacto(c.data);          // "Quinta, 30/04/2026"
  const ehHoje  = ehMesmoDia(c.data, new Date());

  const labelVertical = LABEL_ESTADO_CAIXA_CURTO[c.estado] || c.estado.toUpperCase();
  return `
    <a href="/caixa/${c.data}" data-link
       class="caixa-row" data-estado="${esc(c.estado)}"
       data-estado-label="${esc(labelVertical)}"
       style="animation-delay:${i * 35}ms">
      <div class="caixa-row-data">
        <span class="caixa-row-dia">${dia}</span>
        <span class="caixa-row-dm">
          <span class="caixa-row-dm-dia">${diaNum}</span><span class="caixa-row-dm-mes">${mesSlash}</span>
        </span>
        ${ehHoje ? '<span class="caixa-row-marcador">hoje</span>' : ''}
      </div>

      <div class="caixa-row-corpo">
        <h3 class="caixa-row-titulo">${esc(titulo)}</h3>
        <p class="caixa-row-meta">
          <strong>${total}</strong> ${total === 1 ? 'lançamento' : 'lançamentos'}
          <span class="caixa-row-sep">·</span>
          <strong class="${pend > 0 ? 'is-warn' : ''}">${pend}</strong>
          ${pend === 1 ? 'pendente' : 'pendentes'}
        </p>
      </div>

      <div class="caixa-row-direita">
        <span class="badge-status" data-estado="${esc(c.estado)}">${esc(ESTADO_CAIXA[c.estado] || c.estado)}</span>
        <span class="caixa-row-valor">${formatBRL(valor)}</span>
      </div>
    </a>
  `;
}

// ─── Helpers de data ─────────────────────────────────────────────────────

// "QUI" / "SEX" / "SAB" — abreviado em uppercase, sem ponto.
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
function diaSemanaCurto(iso) {
  const d = new Date(iso + 'T00:00:00');
  return fmtDiaSemana.format(d).replace('.', '').toUpperCase();
}

// "Quinta, 30/04/2026" — dia da semana sem "-feira" + data numerica.
const fmtDiaSemanaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
function tituloCompacto(iso) {
  const d = new Date(iso + 'T00:00:00');
  // "quinta-feira" -> "quinta"; "sábado"/"domingo" ja sem hifen.
  const longo = fmtDiaSemanaLongo.format(d).split('-')[0];
  const dia   = longo.charAt(0).toUpperCase() + longo.slice(1);
  const [ano, mes, diaIso] = iso.split('-');
  return `${dia}, ${diaIso}/${mes}/${ano}`;
}

// "30" — apenas o dia do mes, em destaque visual.
function diaDoMes(iso) {
  return iso.split('-')[2];
}

// "/04" — barra + mes em duas casas, em tipografia reduzida.
function mesComBarra(iso) {
  return '/' + iso.split('-')[1];
}

function ehMesmoDia(iso, dt) {
  const a = new Date(iso + 'T00:00:00');
  return a.getFullYear() === dt.getFullYear()
      && a.getMonth() === dt.getMonth()
      && a.getDate() === dt.getDate();
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
