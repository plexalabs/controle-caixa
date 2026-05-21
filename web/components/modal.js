// modal.js — modal central, drawer lateral, com empilhamento opcional.
//   abrirModal({ lateral: true })  → painel desliza da direita.
//   abrirModal({ amplo: true })    → modal central largo.
//   abrirModal({ empilhar: true }) → abre POR CIMA do modal atual (sub-modal);
//     ao fechar, volta pro de baixo. Sem empilhar (padrão), substitui
//     qualquer modal que estiver aberto.
// ESC e clique fora fecham o modal do TOPO. onConfirmarFechar() pode bloquear.

let pilha = [];   // [{ overlay, confirmaSaida }] — base → topo

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
  empilhar = false,       // true = abre por cima sem fechar o anterior
} = {}) {
  // Sem empilhar: fecha tudo que estiver aberto, sem confirmar.
  if (!empilhar) {
    while (pilha.length) removerTopo();
  }

  const confirmaSaida = onConfirmarFechar || (() => true);

  const overlay = document.createElement('div');
  overlay.className = 'overlay-fundo' + (lateral ? ' overlay-fundo--drawer' : '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (titulo) overlay.setAttribute('aria-labelledby', 'modal-titulo');
  // Sub-modal sobe o z-index pra ficar acima do anterior (base CSS = 50).
  if (pilha.length > 0) overlay.style.zIndex = String(50 + pilha.length * 10);

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
  pilha.push({ overlay, confirmaSaida });

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
  // Um único listener de ESC global — fecha sempre o topo da pilha.
  if (pilha.length === 1) document.addEventListener('keydown', onEsc);

  return { elemento: overlay, fechar: () => fecharModal(true) };
}

function onEsc(e) {
  if (e.key === 'Escape') fecharModal(false);
}

// Fecha o modal do TOPO da pilha (revela o de baixo, se houver).
export function fecharModal(forcado = false) {
  const topo = pilha[pilha.length - 1];
  if (!topo) return;
  if (!forcado && !topo.confirmaSaida()) return;
  removerTopo();
}

function removerTopo() {
  const topo = pilha.pop();
  if (!topo) return;

  // Anima saída antes de remover do DOM.
  const el = topo.overlay;
  el.classList.remove('is-aberto');
  el.classList.add('is-fechando');
  setTimeout(() => el.remove(), 240);

  if (pilha.length === 0) {
    document.removeEventListener('keydown', onEsc);
    document.body.style.overflow = '';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
