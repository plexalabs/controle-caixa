// logo.js — marca Ledo (símbolo de pétala dupla).
// SVG INLINE — pra preservar as 2 cores da marca (pétala externa
// verde-musgo + pétala interna verde-pálido). Mask-image perde a
// segunda cor (vira silhueta única), por isso inline aqui.
//
// 3 variações disponíveis (BRAND_GUIDE seção 4):
//   padrao  — 2 cores sobre fundo claro (default)
//   mono    — 1 cor para impressão/favicon
//   branco  — negativa (símbolo branco sobre fundo escuro)

const CORES = {
  padrao: { externa: '#2D4A2E', interna: '#E8F0E5' },
  mono:   { externa: '#2D4A2E', interna: 'transparent' },
  branco: { externa: '#FFFFFF', interna: '#2D4A2E' },
};

export function renderLogo({ size = 32, variante = 'padrao', titulo = '' } = {}) {
  const px = typeof size === 'number' ? `${size}px` : size;
  const { externa, interna } = CORES[variante] || CORES.padrao;
  const role = titulo ? 'img' : 'presentation';
  const ariaAttr = titulo ? `aria-label="${escAttr(titulo)}"` : 'aria-hidden="true"';
  // ViewBox 256x256 espelha brand/simbolo-ledo.svg
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"
         width="${px}" height="${px}"
         role="${role}" ${ariaAttr}
         style="display:inline-block;flex-shrink:0;">
      <path d="M128,40 L180,40 C180,40 210,70 210,130 C210,190 180,220 128,220 L76,220 C76,220 50,190 50,130 C50,70 80,40 128,40 Z" fill="${externa}"/>
      ${variante !== 'mono' ? `<path d="M128,40 L160,40 C160,40 175,55 175,85 C175,115 160,130 128,130 C100,130 85,115 85,85 C85,55 100,40 128,40 Z" fill="${interna}"/>` : ''}
    </svg>`;
}

function escAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
