// pop-select.js — Listbox custom papel/musgo que substitui o popup
// nativo do <select>. O <select> original permanece no DOM (escondido
// visualmente, mas funcional para form submission e a11y), enquanto um
// <button class="pop-select-trigger"> e um menu portado para o <body>
// cuidam da apresentacao.
//
// Uso direto:   instalarPopSelect(selectEl)
// Uso em massa: instalarPopSelectsEm(containerEl)

export function instalarPopSelect(select) {
  if (select.dataset.popInstalled === '1') return;
  select.dataset.popInstalled = '1';

  // ── Esconde o select original visualmente sem remover do DOM. ──
  select.style.position = 'absolute';
  select.style.opacity  = '0';
  select.style.height   = '0';
  select.style.width    = '0';
  select.style.padding  = '0';
  select.style.margin   = '0';
  select.style.pointerEvents = 'none';
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  // Bloqueia abertura do popup nativo via for="" do label, atalho
  // de teclado ou click programatico.
  select.addEventListener('focus', (e) => { e.preventDefault(); e.target.blur(); });
  select.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

  // ── Cria o trigger custom no lugar do select. ──
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pop-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (select.required) trigger.dataset.required = '1';
  if (select.disabled) trigger.disabled = true;

  // Reaproveita o <label> da .field para a11y, se houver, mas
  // DESPAREIA o for="" — senao o navegador foca o select original e
  // pode abrir o popup nativo em alguns browsers.
  const labelEl = select.closest('.field')?.querySelector('label.field-label');
  if (labelEl) {
    if (!labelEl.id) labelEl.id = 'lbl-' + (select.id || cryptoRandom());
    trigger.setAttribute('aria-labelledby', labelEl.id);
    labelEl.removeAttribute('for');
    labelEl.style.cursor = 'pointer';
    labelEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      trigger.focus();
    });
  }

  select.parentElement.insertBefore(trigger, select);
  atualizarTrigger();

  // ── Estado do menu aberto ──
  let menu = null;
  let aberto = false;
  let indiceFoco = -1;
  let opcoes = [];

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    aberto ? fechar() : abrir();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!aberto) abrir();
    } else if (e.key === 'ArrowUp' && !aberto) {
      e.preventDefault();
      abrir();
    }
  });

  // Sincroniza trigger se valor for alterado externamente
  select.addEventListener('change', atualizarTrigger);

  function atualizarTrigger() {
    const opt = select.options[select.selectedIndex];
    const semValor = !opt || !opt.value;
    const txt = opt?.text || (select.querySelector('option[value=""]')?.text || '— selecionar —');
    trigger.innerHTML = `
      <span class="pop-select-trigger-texto ${semValor ? 'is-placeholder' : ''}">${esc(txt)}</span>
      <span class="pop-select-trigger-caret" aria-hidden="true">${caretSvg()}</span>
    `;
  }

  function abrir() {
    aberto = true;
    trigger.setAttribute('aria-expanded', 'true');

    // Filtra opcoes nao-vazias (placeholder fica fora do menu).
    opcoes = Array.from(select.options).filter(o => o.value !== '');

    menu = document.createElement('div');
    menu.className = 'pop-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.innerHTML = opcoes.map((o, i) => `
      <button type="button" class="pop-select-item" role="option"
              data-valor="${esc(o.value)}" data-indice="${i}"
              aria-selected="${o.selected ? 'true' : 'false'}">
        ${esc(o.text)}
      </button>
    `).join('');

    document.body.appendChild(menu);
    posicionar();
    requestAnimationFrame(() => menu.classList.add('is-aberto'));

    // Foca o item selecionado, ou o primeiro
    const idxAtual = opcoes.findIndex(o => o.selected);
    indiceFoco = idxAtual >= 0 ? idxAtual : 0;
    focarItem(indiceFoco);

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.pop-select-item');
      if (!item) return;
      selecionar(item.dataset.valor);
    });
    menu.querySelectorAll('.pop-select-item').forEach((el, i) => {
      el.addEventListener('mouseenter', () => focarItem(i));
    });

    // Fechamentos automaticos
    setTimeout(() => {
      window.addEventListener('mousedown', clickFora);
      window.addEventListener('keydown',  tecla);
      window.addEventListener('resize',   fechar);
      // Captura scroll em qualquer ancestral (drawer, body, etc).
      window.addEventListener('scroll', fechar, true);
    }, 0);
  }

  function focarItem(i) {
    if (!menu) return;
    const itens = menu.querySelectorAll('.pop-select-item');
    if (!itens.length) return;
    indiceFoco = ((i % itens.length) + itens.length) % itens.length;
    itens.forEach((el, j) => el.classList.toggle('is-foco', j === indiceFoco));
    itens[indiceFoco].scrollIntoView({ block: 'nearest' });
  }

  function selecionar(valor) {
    select.value = valor;
    select.dispatchEvent(new Event('input',  { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    atualizarTrigger();
    fechar();
    trigger.focus();
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    trigger.setAttribute('aria-expanded', 'false');
    if (menu) {
      menu.classList.remove('is-aberto');
      menu.classList.add('is-fechando');
      const m = menu;
      menu = null;
      setTimeout(() => m.remove(), 200);
    }
    window.removeEventListener('mousedown', clickFora);
    window.removeEventListener('keydown',  tecla);
    window.removeEventListener('resize',   fechar);
    window.removeEventListener('scroll',   fechar, true);
  }

  function clickFora(e) {
    if (!menu) return;
    if (!menu.contains(e.target) && !trigger.contains(e.target)) fechar();
  }

  function tecla(e) {
    if (!menu) return;
    const itens = menu.querySelectorAll('.pop-select-item');
    if (!itens.length) return;

    if (e.key === 'Escape') { e.preventDefault(); fechar(); trigger.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focarItem(indiceFoco + 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); focarItem(indiceFoco - 1); }
    else if (e.key === 'Home')      { e.preventDefault(); focarItem(0); }
    else if (e.key === 'End')       { e.preventDefault(); focarItem(itens.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = itens[indiceFoco];
      if (item) selecionar(item.dataset.valor);
    } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
      // Type-ahead: primeira opcao que comeca com a letra
      const k = e.key.toLowerCase();
      const idx = opcoes.findIndex(o => (o.text || '').toLowerCase().startsWith(k));
      if (idx >= 0) focarItem(idx);
    }
  }

  function posicionar() {
    if (!menu) return;
    const r = trigger.getBoundingClientRect();
    const espacoBaixo = window.innerHeight - r.bottom;
    const espacoAlto  = r.top;
    const altMaxAlvo  = 280;
    const acima = espacoBaixo < 220 && espacoAlto > espacoBaixo;

    menu.style.position = 'fixed';
    menu.style.left  = `${r.left}px`;
    menu.style.width = `${r.width}px`;
    if (acima) {
      menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
      menu.style.top    = '';
      menu.classList.add('pop-select-menu--acima');
    } else {
      menu.style.top    = `${r.bottom + 6}px`;
      menu.style.bottom = '';
    }
    menu.style.maxHeight = `${Math.min(altMaxAlvo, (acima ? espacoAlto : espacoBaixo) - 16)}px`;
  }
}

export function instalarPopSelectsEm(container) {
  if (!container) return;
  container.querySelectorAll('select.field-input').forEach(instalarPopSelect);
}

// ─── helpers ──────────────────────────────────────────────────────────
function caretSvg() {
  return `<svg width="12" height="8" viewBox="0 0 12 8" fill="none">
    <path d="M1 1.5 L6 6.5 L11 1.5" stroke="currentColor" stroke-width="1.6"
          fill="none" stroke-linecap="round" stroke-linejoin="round"/>
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
