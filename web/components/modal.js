// modal.js — modal genérico com overlay, foco-trap básico, ESC + click-outside.
// Retorna helpers { abrir(html, opcoes), fechar(forcado), elemento }.
// Não toca DOM enquanto não chamado.

let aberto = null;
let confirmaSaida = () => true;

export function abrirModal({ titulo = '', eyebrow = '', conteudo = '', onConfirmarFechar = null } = {}) {
  fecharModal(true);  // fecha qualquer um existente sem confirmar
  confirmaSaida = onConfirmarFechar || (() => true);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (titulo) overlay.setAttribute('aria-labelledby', 'modal-titulo');

  overlay.innerHTML = `
    <div class="modal-card">
      <header class="modal-header">
        <div>
          ${eyebrow ? `<p class="modal-eyebrow">${esc(eyebrow)}</p>` : ''}
          ${titulo  ? `<h2 id="modal-titulo" class="modal-titulo">${esc(titulo)}</h2>` : ''}
        </div>
        <button class="modal-fechar" type="button" aria-label="Fechar" data-fechar>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </header>
      <div class="modal-corpo">${conteudo}</div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  aberto = overlay;

  // Click no botão X.
  overlay.querySelector('[data-fechar]').addEventListener('click', () => fecharModal(false));
  // Click fora do card.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal(false);
  });
  // ESC.
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
  aberto.remove();
  aberto = null;
  document.body.style.overflow = '';
  confirmaSaida = () => true;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
