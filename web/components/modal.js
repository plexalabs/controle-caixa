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
  rodape = '',
  onConfirmarFechar = null,
} = {}) {
  fecharModal(true);  // fecha qualquer um existente sem confirmar
  confirmaSaida = onConfirmarFechar || (() => true);

  const overlay = document.createElement('div');
  overlay.className = 'overlay-fundo' + (lateral ? ' overlay-fundo--drawer' : '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (titulo) overlay.setAttribute('aria-labelledby', 'modal-titulo');

  const cardClass = lateral ? 'painel-lateral' : 'modal-card';

  overlay.innerHTML = `
    <div class="${cardClass}">
      <header class="painel-header">
        <div class="painel-header-texto">
          ${eyebrow ? `<p class="painel-eyebrow">${esc(eyebrow)}</p>` : ''}
          ${titulo  ? `<h2 id="modal-titulo" class="painel-titulo">${esc(titulo)}</h2>` : ''}
        </div>
        <button class="painel-fechar" type="button" aria-label="Fechar" data-fechar>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </header>
      <div class="painel-corpo">${conteudo}</div>
      ${rodape ? `<footer class="painel-rodape">${rodape}</footer>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  aberto = overlay;

  // Anima entrada no próximo frame para garantir transição.
  requestAnimationFrame(() => overlay.classList.add('is-aberto'));

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
