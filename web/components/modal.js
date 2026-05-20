// modal.js — modal genérico ou drawer lateral.
// abrirModal({ ..., lateral: true }) → painel desliza da direita.
// abrirModal({ ..., lateral: false (padrão) }) → modal centralizado.
// Em ambos: ESC fecha, click fora fecha, onConfirmarFechar() pode bloquear.

let aberto = null;
let confirmaSaida = () => true;

export function abrirModal({
  titulo = '',
  eyebrow = '',
  conteudo = '',
  lateral = false,
  amplo = false,          // modal largo (layout split 1/3 + 2/3)
  headerBadge = '',       // HTML cru do badge ao lado do botão fechar
  rodape = '',
  onConfirmarFechar = null,
  origemEvento = null,    // event do click pra animar 'nascendo' do elemento
} = {}) {
  fecharModal(true);  // fecha qualquer um existente sem confirmar
  confirmaSaida = onConfirmarFechar || (() => true);

  const overlay = document.createElement('div');
  overlay.className = 'overlay-fundo' + (lateral ? ' overlay-fundo--drawer' : '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (titulo) overlay.setAttribute('aria-labelledby', 'modal-titulo');

  const cardClass = lateral
    ? 'painel-lateral'
    : ('modal-card' + (amplo ? ' modal-card--amplo' : ''));

  overlay.innerHTML = `
    <div class="${cardClass}">
      <header class="painel-header">
        <div class="painel-header-texto">
          ${eyebrow ? `<p class="painel-eyebrow">${esc(eyebrow)}</p>` : ''}
          ${titulo  ? `<h2 id="modal-titulo" class="painel-titulo">${esc(titulo)}</h2>` : ''}
        </div>
        <div class="painel-header-acoes">
          ${headerBadge || ''}
          <button class="painel-fechar" type="button" aria-label="Fechar" data-fechar>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="painel-corpo">${conteudo}</div>
      ${rodape ? `<footer class="painel-rodape">${rodape}</footer>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  aberto = overlay;

  // Captura ponto de origem do clique pra animar 'nascendo' do
  // elemento clicado. Funciona so com modal centralizado (.modal-card),
  // nao com drawer lateral. Pega no proximo frame pra ter as dimensoes
  // do modal ja calculadas.
  if (!lateral && origemEvento) {
    const el = origemEvento.currentTarget || origemEvento.target;
    const r = el?.getBoundingClientRect?.();
    if (r) {
      const cx = r.left + r.width / 2;   // viewport
      const cy = r.top + r.height / 2;
      requestAnimationFrame(() => {
        const card = overlay.querySelector('.modal-card');
        const cardR = card?.getBoundingClientRect();
        if (cardR) {
          // Posicao do click relativa ao canto sup-esq do modal
          const localX = Math.max(0, Math.min(cardR.width,  cx - cardR.left));
          const localY = Math.max(0, Math.min(cardR.height, cy - cardR.top));
          card.style.setProperty('--origin-x', `${localX}px`);
          card.style.setProperty('--origin-y', `${localY}px`);
          overlay.dataset.origem = '1';
        }
        overlay.classList.add('is-aberto');
      });
    } else {
      requestAnimationFrame(() => overlay.classList.add('is-aberto'));
    }
  } else {
    // Anima entrada no próximo frame para garantir transição.
    requestAnimationFrame(() => overlay.classList.add('is-aberto'));
  }

  overlay.querySelector('[data-fechar]').addEventListener('click', () => fecharModal(false));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal(false);
  });
  document.addEventListener('keydown', onEsc);

  return { elemento: overlay, fechar: () => fecharModal(true) };
}

function onEsc(e) {
  if (e.key === 'Escape') fecharModal(false);
}

export function fecharModal(forcado = false) {
  if (!aberto) return;
  if (!forcado && !confirmaSaida()) return;
  document.removeEventListener('keydown', onEsc);

  // Anima saída antes de remover do DOM.
  const el = aberto;
  el.classList.remove('is-aberto');
  el.classList.add('is-fechando');
  aberto = null;
  document.body.style.overflow = '';
  confirmaSaida = () => true;

  const dur = 240;
  setTimeout(() => el.remove(), dur);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
