// filter-bar.js — barra de filtros editorial reutilizável (CP5.2).
// Suporta tipos: select, texto (busca debounced), toggle (boolean).
// Estado é refletido na URL (querystring) — bookmarkable e F5-safe.
//
// CP-FILTER-COLLAPSE: o painel de filtros agora vive recolhido por
// default (só o cabeçalho com botão "Filtros" + contador é visível).
// Clicar no botão expande os campos. Se a URL já trouxer filtros
// aplicados, o painel abre automaticamente para o operador ver o que
// está filtrando.
//
// Uso (sem mudança na API pública):
//   import { instalarFilterBar } from '../components/filter-bar.js';
//
//   const fb = instalarFilterBar(container, {
//     filtros: [
//       { id: 'severidade', label: 'Severidade', tipo: 'select', opcoes: [
//         { valor: '', rotulo: 'Todas' },
//         { valor: 'urgente', rotulo: 'Urgente' },
//       ]},
//       { id: 'busca', label: 'Buscar', tipo: 'texto', placeholder: 'NF ou cliente' },
//       { id: 'resolvidos', label: 'Mostrar resolvidos', tipo: 'toggle' },
//     ],
//     onChange: (estado) => { ... },
//     debounceTexto: 300,        // ms
//     espelharNaUrl: true,       // default true
//     mostrarResumo: true,       // default true
//   });
//
//   fb.estado();    // { severidade: 'urgente', busca: '', resolvidos: false }
//   fb.destruir();  // remove listeners

import { instalarPopSelect } from './pop-select.js';

export function instalarFilterBar(container, opcoes) {
  if (!container) return null;
  const cfg = {
    filtros: [],
    onChange: () => {},
    debounceTexto: 300,
    espelharNaUrl: true,
    mostrarResumo: true,
    ...opcoes,
  };

  // Estado inicial: lê da URL ou aplica padrões.
  const params = new URLSearchParams(location.search);
  const estado = {};
  for (const f of cfg.filtros) {
    const bruto = params.get(f.id);
    if (f.tipo === 'toggle') {
      estado[f.id] = bruto === '1' || bruto === 'true';
    } else {
      estado[f.id] = bruto ?? '';
    }
  }

  // Painel começa aberto SE o operador já chegou com filtros na URL —
  // assim ele vê o que está filtrando. Caso contrário fica recolhido.
  const temFiltrosAtivos = cfg.filtros.some(f =>
    (f.tipo === 'toggle' && estado[f.id]) ||
    (f.tipo !== 'toggle' && estado[f.id] !== '')
  );
  let aberto = temFiltrosAtivos;

  container.classList.add('filter-bar');
  container.dataset.aberto = String(aberto);
  container.innerHTML = corpoHtml(cfg, estado);

  // Pop-selects: instala em todos os <select> que existirem.
  container.querySelectorAll('select.field-input').forEach(instalarPopSelect);

  // Listeners
  const destruidores = [];
  for (const f of cfg.filtros) {
    if (f.tipo === 'select') {
      const sel = container.querySelector(`#fb-${f.id}`);
      if (sel) {
        const h = () => atualizar(f.id, sel.value);
        sel.addEventListener('change', h);
        destruidores.push(() => sel.removeEventListener('change', h));
      }
    } else if (f.tipo === 'texto') {
      const inp = container.querySelector(`#fb-${f.id}`);
      if (inp) {
        let timer = null;
        const h = () => {
          clearTimeout(timer);
          timer = setTimeout(() => atualizar(f.id, inp.value.trim()), cfg.debounceTexto);
        };
        inp.addEventListener('input', h);
        destruidores.push(() => { clearTimeout(timer); inp.removeEventListener('input', h); });
      }
    } else if (f.tipo === 'toggle') {
      const btn = container.querySelector(`#fb-${f.id}`);
      if (btn) {
        const h = () => atualizar(f.id, !estado[f.id]);
        btn.addEventListener('click', h);
        destruidores.push(() => btn.removeEventListener('click', h));
      }
    }
  }

  // Botão limpar
  const btnLimpar = container.querySelector('.filter-bar-limpar');
  if (btnLimpar) {
    const h = () => limpar();
    btnLimpar.addEventListener('click', h);
    destruidores.push(() => btnLimpar.removeEventListener('click', h));
  }

  // Botão toggle do painel (CP-FILTER-COLLAPSE)
  const btnToggle = container.querySelector('.filter-bar-toggle-painel');
  if (btnToggle) {
    const h = () => alternarPainel();
    btnToggle.addEventListener('click', h);
    destruidores.push(() => btnToggle.removeEventListener('click', h));
  }

  // Atualiza header inicial (badge + botão limpar)
  atualizarHeader();

  function atualizar(id, valor) {
    estado[id] = valor;
    if (cfg.espelharNaUrl) escreverNaUrl();
    atualizarUiToggle();
    atualizarHeader();
    cfg.onChange({ ...estado });
  }

  function limpar() {
    for (const f of cfg.filtros) {
      estado[f.id] = (f.tipo === 'toggle') ? false : '';
      const el = container.querySelector(`#fb-${f.id}`);
      if (!el) continue;
      if (f.tipo === 'select' || f.tipo === 'texto') {
        el.value = '';
        if (f.tipo === 'select') el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    atualizarUiToggle();
    if (cfg.espelharNaUrl) escreverNaUrl();
    atualizarHeader();
    cfg.onChange({ ...estado });
  }

  function alternarPainel() {
    aberto = !aberto;
    container.dataset.aberto = String(aberto);
    const btn = container.querySelector('.filter-bar-toggle-painel');
    if (btn) btn.setAttribute('aria-expanded', String(aberto));
  }

  function atualizarUiToggle() {
    for (const f of cfg.filtros) {
      if (f.tipo !== 'toggle') continue;
      const btn = container.querySelector(`#fb-${f.id}`);
      if (btn) btn.setAttribute('aria-pressed', String(!!estado[f.id]));
    }
  }

  function contarAtivos() {
    return cfg.filtros.filter(f =>
      (f.tipo === 'toggle' && estado[f.id]) ||
      (f.tipo !== 'toggle' && estado[f.id] && estado[f.id] !== '')
    ).length;
  }

  function atualizarHeader() {
    const ativos = contarAtivos();
    // Badge no botão de filtro
    const badge = container.querySelector('.filter-bar-badge');
    if (badge) {
      badge.textContent = String(ativos);
      badge.dataset.zero = String(ativos === 0);
    }
    // Botão limpar só aparece se houver filtros ativos
    const btnLimpar = container.querySelector('.filter-bar-limpar');
    if (btnLimpar) btnLimpar.hidden = ativos === 0;
    // Resumo (texto opcional)
    if (cfg.mostrarResumo) {
      const resumoEl = container.querySelector('.filter-bar-resumo');
      if (resumoEl) {
        resumoEl.textContent = ativos === 0
          ? ''
          : `${ativos} filtro${ativos > 1 ? 's' : ''} aplicado${ativos > 1 ? 's' : ''}`;
      }
    }
  }

  function escreverNaUrl() {
    const p = new URLSearchParams(location.search);
    for (const f of cfg.filtros) {
      const v = estado[f.id];
      if (f.tipo === 'toggle') {
        if (v) p.set(f.id, '1');
        else   p.delete(f.id);
      } else {
        if (v) p.set(f.id, v);
        else   p.delete(f.id);
      }
    }
    const qs = p.toString();
    const url = location.pathname + (qs ? '?' + qs : '');
    history.replaceState(history.state, '', url);
  }

  return {
    estado: () => ({ ...estado }),
    aplicar: (novoEstado) => {
      Object.assign(estado, novoEstado);
      // Atualiza UI dos campos
      for (const f of cfg.filtros) {
        const el = container.querySelector(`#fb-${f.id}`);
        if (!el) continue;
        if (f.tipo === 'select' || f.tipo === 'texto') el.value = estado[f.id] ?? '';
        if (f.tipo === 'select') el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      atualizarUiToggle();
      if (cfg.espelharNaUrl) escreverNaUrl();
      atualizarHeader();
    },
    destruir: () => {
      destruidores.forEach(d => { try { d(); } catch (e) {} });
      container.innerHTML = '';
      container.classList.remove('filter-bar');
      delete container.dataset.aberto;
    },
  };
}

// ─── HTML do filter-bar ────────────────────────────────────────────
function corpoHtml(cfg, estado) {
  const camposHtml = cfg.filtros
    .filter(f => f.tipo !== 'toggle')
    .map(f => campoHtml(f, estado[f.id]))
    .join('');

  const togglesHtml = cfg.filtros
    .filter(f => f.tipo === 'toggle')
    .map(f => `
      <button type="button" id="fb-${esc(f.id)}" class="filter-bar-toggle"
              aria-pressed="${!!estado[f.id]}">
        <span aria-hidden="true">${estado[f.id] ? '◉' : '○'}</span>
        ${esc(f.label)}
      </button>`)
    .join('');

  return `
    <div class="filter-bar-header">
      <button type="button" class="filter-bar-toggle-painel"
              aria-expanded="false" aria-controls="filter-bar-painel">
        <span class="filter-bar-toggle-icone" aria-hidden="true">${svgFunil()}</span>
        <span class="filter-bar-toggle-rotulo">Filtros</span>
        <span class="filter-bar-badge" data-zero="true" aria-hidden="true">0</span>
      </button>
      ${cfg.mostrarResumo ? `<span class="filter-bar-resumo"></span>` : ''}
      <button type="button" class="filter-bar-limpar" hidden>Limpar filtros</button>
    </div>
    <div class="filter-bar-painel" id="filter-bar-painel" role="region" aria-label="Filtros">
      <div class="filter-bar-painel-conteudo">
        <div class="filter-bar-grid">
          ${camposHtml}
        </div>
        ${togglesHtml ? `<div class="filter-bar-toggles">${togglesHtml}</div>` : ''}
      </div>
    </div>
  `;
}

function campoHtml(f, valor) {
  if (f.tipo === 'select') {
    return `
      <div class="filter-bar-campo field" style="margin-bottom:0">
        <label class="field-label" for="fb-${esc(f.id)}">${esc(f.label)}</label>
        <select id="fb-${esc(f.id)}" class="field-input">
          ${(f.opcoes || []).map(o =>
            `<option value="${esc(o.valor)}" ${o.valor === valor ? 'selected' : ''}>${esc(o.rotulo)}</option>`
          ).join('')}
        </select>
      </div>`;
  }
  if (f.tipo === 'texto') {
    return `
      <div class="filter-bar-campo filter-bar-busca field" style="margin-bottom:0">
        <label class="field-label" for="fb-${esc(f.id)}">${esc(f.label)}</label>
        <span class="filter-bar-busca-icone" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M11 11 L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        <input id="fb-${esc(f.id)}" type="search" class="field-input"
               placeholder="${esc(f.placeholder || '')}" value="${esc(valor || '')}"
               autocomplete="off" />
      </div>`;
  }
  return '';
}

// Ícone funil (lucide-inspired strokes 1.5px, currentColor).
function svgFunil() {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 5 H20 L14 12.5 V19 L10 21 V12.5 Z"
            stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
