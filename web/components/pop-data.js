// pop-data.js — Date picker custom para <input type="date"> e
// <input type="datetime-local">. O input original permanece no DOM
// (escondido, funcional pra form/a11y) e o popover renderiza um
// calendario mensal papel/musgo + filete ambar lateral.
//
// Uso direto:   instalarPopData(inputEl)
// Uso em massa: instalarPopDatasEm(containerEl)

const NOMES_MES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const NOMES_DIA_SEM = ['D','S','T','Q','Q','S','S'];

export function instalarPopData(input) {
  if (input.dataset.popInstalled === '1') return;
  input.dataset.popInstalled = '1';

  const ehDateTime = input.type === 'datetime-local';

  // Esconde input nativo
  input.style.position = 'absolute';
  input.style.opacity  = '0';
  input.style.height   = '0';
  input.style.width    = '0';
  input.style.padding  = '0';
  input.style.margin   = '0';
  input.style.pointerEvents = 'none';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');

  // Trigger custom
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pop-data-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  if (input.disabled) trigger.disabled = true;

  // Reaproveita label
  const labelEl = input.closest('.field')?.querySelector('label.field-label');
  if (labelEl) {
    if (!labelEl.id) labelEl.id = 'lbl-' + cryptoRandom();
    trigger.setAttribute('aria-labelledby', labelEl.id);
    labelEl.addEventListener('click', (e) => { e.preventDefault(); trigger.focus(); });
  }

  input.parentElement.insertBefore(trigger, input);
  atualizarTrigger();
  input.addEventListener('change', atualizarTrigger);

  function atualizarTrigger() {
    const v = input.value;
    const placeholder = ehDateTime ? '— data e hora —' : '— escolher data —';
    if (!v) {
      trigger.innerHTML = `
        <span class="pop-data-trigger-texto is-placeholder">${placeholder}</span>
        <span class="pop-data-trigger-icone" aria-hidden="true">${calendarSvg()}</span>
      `;
      return;
    }
    trigger.innerHTML = `
      <span class="pop-data-trigger-texto">${esc(formatarDisplay(v, ehDateTime))}</span>
      <span class="pop-data-trigger-icone" aria-hidden="true">${calendarSvg()}</span>
    `;
  }

  let popover = null;
  let aberto = false;
  let estado = null;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    aberto ? fechar() : abrir();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) abrir();
    }
  });

  function abrir() {
    aberto = true;
    trigger.setAttribute('aria-expanded', 'true');

    const inicial = parseValor(input.value, ehDateTime) || datasHoje();
    estado = {
      mes: inicial.mes, ano: inicial.ano,
      diaSel: inicial.dia, mesSel: inicial.mes, anoSel: inicial.ano,
      hora: inicial.hora ?? 0,
      minuto: inicial.minuto ?? 0,
    };

    popover = document.createElement('div');
    popover.className = 'pop-data-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', ehDateTime ? 'Selecionar data e hora' : 'Selecionar data');
    document.body.appendChild(popover);

    renderPopover();
    posicionar();
    requestAnimationFrame(() => popover.classList.add('is-aberto'));

    setTimeout(() => {
      window.addEventListener('mousedown', clickFora);
      window.addEventListener('keydown',  tecla);
      window.addEventListener('resize',   fechar);
      window.addEventListener('scroll',   fechar, true);
    }, 0);
  }

  function renderPopover() {
    popover.innerHTML = `
      <header class="pop-data-header">
        <button type="button" class="pop-data-nav" data-nav="-1" aria-label="Mês anterior">
          ${chevronSvg('left')}
        </button>
        <span class="pop-data-titulo">${NOMES_MES[estado.mes]} <span class="pop-data-titulo-ano">${estado.ano}</span></span>
        <button type="button" class="pop-data-nav" data-nav="1" aria-label="Próximo mês">
          ${chevronSvg('right')}
        </button>
      </header>
      <div class="pop-data-semana" aria-hidden="true">
        ${NOMES_DIA_SEM.map(d => `<span>${d}</span>`).join('')}
      </div>
      <div class="pop-data-grid" role="grid">
        ${gerarDiasGrid()}
      </div>
      ${ehDateTime ? `
        <div class="pop-data-hora">
          <span class="h-eyebrow" style="flex:1">Hora</span>
          <input type="number" min="0" max="23" maxlength="2"
                 value="${String(estado.hora).padStart(2,'0')}"
                 data-h class="pop-data-hora-input" aria-label="Hora">
          <span class="pop-data-hora-sep">:</span>
          <input type="number" min="0" max="59" maxlength="2"
                 value="${String(estado.minuto).padStart(2,'0')}"
                 data-m class="pop-data-hora-input" aria-label="Minuto">
        </div>
      ` : ''}
      <footer class="pop-data-rodape">
        <button type="button" class="btn-link" data-acao="hoje">Hoje</button>
        <button type="button" class="btn-link" data-acao="limpar">Limpar</button>
        <button type="button" class="btn-primary" data-acao="confirmar">Confirmar</button>
      </footer>
    `;
    ligarEventosInternos();
  }

  function ligarEventosInternos() {
    popover.querySelectorAll('[data-nav]').forEach(b => {
      b.addEventListener('click', () => {
        const delta = parseInt(b.dataset.nav, 10);
        estado.mes += delta;
        if (estado.mes < 0)  { estado.mes = 11; estado.ano--; }
        if (estado.mes > 11) { estado.mes = 0;  estado.ano++; }
        renderPopover();
      });
    });

    popover.querySelectorAll('[data-dia]').forEach(b => {
      b.addEventListener('click', () => {
        const [a, m, d] = b.dataset.dia.split('-').map(Number);
        estado.anoSel = a;
        estado.mesSel = m - 1;
        estado.diaSel = d;
        // Atualiza apenas a marca de seleção sem re-renderizar tudo
        popover.querySelectorAll('.pop-data-dia.is-sel')
               .forEach(el => el.classList.remove('is-sel'));
        b.classList.add('is-sel');
      });
    });

    if (ehDateTime) {
      const inH = popover.querySelector('[data-h]');
      const inM = popover.querySelector('[data-m]');
      inH?.addEventListener('input', () => {
        const v = clamp(parseInt(inH.value, 10) || 0, 0, 23);
        estado.hora = v;
      });
      inM?.addEventListener('input', () => {
        const v = clamp(parseInt(inM.value, 10) || 0, 0, 59);
        estado.minuto = v;
      });
      inH?.addEventListener('blur', () => {
        inH.value = String(estado.hora).padStart(2,'0');
      });
      inM?.addEventListener('blur', () => {
        inM.value = String(estado.minuto).padStart(2,'0');
      });
    }

    popover.querySelector('[data-acao="hoje"]')?.addEventListener('click', () => {
      const h = datasHoje();
      Object.assign(estado, { mes: h.mes, ano: h.ano, mesSel: h.mes, anoSel: h.ano, diaSel: h.dia });
      renderPopover();
    });

    popover.querySelector('[data-acao="limpar"]')?.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      atualizarTrigger();
      fechar();
      trigger.focus();
    });

    popover.querySelector('[data-acao="confirmar"]')?.addEventListener('click', () => {
      const a = estado.anoSel;
      const m = String(estado.mesSel + 1).padStart(2, '0');
      const d = String(estado.diaSel).padStart(2, '0');
      let valor = `${a}-${m}-${d}`;
      if (ehDateTime) {
        const h  = String(estado.hora).padStart(2, '0');
        const mi = String(estado.minuto).padStart(2, '0');
        valor += `T${h}:${mi}`;
      }
      input.value = valor;
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      atualizarTrigger();
      fechar();
      trigger.focus();
    });
  }

  function gerarDiasGrid() {
    const primDoMes  = new Date(estado.ano, estado.mes, 1);
    const diaSemPrim = primDoMes.getDay();
    const diasNoMes  = new Date(estado.ano, estado.mes + 1, 0).getDate();
    const prevUlt    = new Date(estado.ano, estado.mes, 0).getDate();

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let html = '';

    // Padding do mês anterior
    for (let i = diaSemPrim - 1; i >= 0; i--) {
      html += `<button type="button" class="pop-data-dia is-fora" disabled>${prevUlt - i}</button>`;
    }
    // Dias do mês
    for (let d = 1; d <= diasNoMes; d++) {
      const data = new Date(estado.ano, estado.mes, d);
      const ehHoje = data.getTime() === hoje.getTime();
      const ehSel  = (d === estado.diaSel && estado.mes === estado.mesSel && estado.ano === estado.anoSel);
      const iso = `${estado.ano}-${String(estado.mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const cls = ['pop-data-dia',
                   ehHoje && 'is-hoje',
                   ehSel  && 'is-sel'].filter(Boolean).join(' ');
      html += `<button type="button" class="${cls}" data-dia="${iso}">${d}</button>`;
    }
    // Padding do mês seguinte para completar a grade (max 6 semanas = 42)
    const total  = diaSemPrim + diasNoMes;
    const restam = (7 - (total % 7)) % 7;
    for (let i = 1; i <= restam; i++) {
      html += `<button type="button" class="pop-data-dia is-fora" disabled>${i}</button>`;
    }
    return html;
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    trigger.setAttribute('aria-expanded', 'false');
    if (popover) {
      popover.classList.remove('is-aberto');
      popover.classList.add('is-fechando');
      const p = popover;
      popover = null;
      setTimeout(() => p.remove(), 200);
    }
    window.removeEventListener('mousedown', clickFora);
    window.removeEventListener('keydown',  tecla);
    window.removeEventListener('resize',   fechar);
    window.removeEventListener('scroll',   fechar, true);
  }

  function clickFora(e) {
    if (!popover) return;
    if (!popover.contains(e.target) && !trigger.contains(e.target)) fechar();
  }

  function tecla(e) {
    if (!popover) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
      trigger.focus();
      return;
    }
    // Setas navegam dia a dia
    const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in passos) {
      e.preventDefault();
      const data = new Date(estado.anoSel, estado.mesSel, estado.diaSel);
      data.setDate(data.getDate() + passos[e.key]);
      estado.anoSel = data.getFullYear();
      estado.mesSel = data.getMonth();
      estado.diaSel = data.getDate();
      // Se navegou pra fora do mes visivel, troca tambem
      if (data.getMonth() !== estado.mes || data.getFullYear() !== estado.ano) {
        estado.ano = data.getFullYear();
        estado.mes = data.getMonth();
      }
      renderPopover();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      popover.querySelector('[data-acao="confirmar"]')?.click();
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      estado.mes--;
      if (estado.mes < 0) { estado.mes = 11; estado.ano--; }
      renderPopover();
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      estado.mes++;
      if (estado.mes > 11) { estado.mes = 0; estado.ano++; }
      renderPopover();
    }
  }

  function posicionar() {
    if (!popover) return;
    const r = trigger.getBoundingClientRect();
    const altPopover = ehDateTime ? 388 : 332;
    const espacoBaixo = window.innerHeight - r.bottom;
    const espacoAlto  = r.top;
    const acima = espacoBaixo < altPopover && espacoAlto > espacoBaixo;

    popover.style.position = 'fixed';
    // Largura fixa do popover, alinha pela esquerda do trigger sem
    // estourar a viewport
    const larguraPop = 308;
    let leftAlvo = r.left;
    if (leftAlvo + larguraPop > window.innerWidth - 12) {
      leftAlvo = Math.max(12, window.innerWidth - larguraPop - 12);
    }
    popover.style.left = `${leftAlvo}px`;

    if (acima) {
      popover.style.bottom = `${window.innerHeight - r.top + 6}px`;
      popover.style.top    = '';
      popover.classList.add('pop-data-popover--acima');
    } else {
      popover.style.top    = `${r.bottom + 6}px`;
      popover.style.bottom = '';
    }
  }
}

export function instalarPopDatasEm(container) {
  if (!container) return;
  container.querySelectorAll('input[type="date"], input[type="datetime-local"], input[type="time"]')
    .forEach(instalarPopData);
}

// ─── helpers ──────────────────────────────────────────────────────────
function parseValor(v, ehDateTime) {
  if (!v) return null;
  if (ehDateTime) {
    // "YYYY-MM-DDTHH:MM"
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    return {
      ano: +m[1], mes: +m[2] - 1, dia: +m[3],
      hora: +m[4], minuto: +m[5],
    };
  } else {
    // "YYYY-MM-DD"
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { ano: +m[1], mes: +m[2] - 1, dia: +m[3] };
  }
}
function datasHoje() {
  const d = new Date();
  return {
    ano: d.getFullYear(), mes: d.getMonth(), dia: d.getDate(),
    hora: d.getHours(), minuto: d.getMinutes(),
  };
}
function formatarDisplay(v, ehDateTime) {
  const p = parseValor(v, ehDateTime);
  if (!p) return v;
  const d = String(p.dia).padStart(2, '0');
  const m = String(p.mes + 1).padStart(2, '0');
  const a = p.ano;
  if (ehDateTime) {
    const h  = String(p.hora).padStart(2, '0');
    const mi = String(p.minuto).padStart(2, '0');
    return `${d}/${m}/${a} · ${h}:${mi}`;
  }
  return `${d}/${m}/${a}`;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function calendarSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
    <path d="M2 6 H14" stroke="currentColor" stroke-width="1.4"/>
    <path d="M5 1.5 V4 M11 1.5 V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}
function chevronSvg(dir) {
  const d = dir === 'left' ? 'M9 3 L4 8 L9 13' : 'M7 3 L12 8 L7 13';
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="${d}" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}
