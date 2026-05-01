// logo.js — marca da casa Caixa Boti.
// Carrega web/assets/logo.svg via CSS mask-image para que a cor seja
// totalmente controlavel via "background" — assim o mesmo arquivo SVG
// renderiza em musgo, papel, ambar, ou qualquer cor da paleta sem
// precisar editar o SVG ou ter multiplos arquivos.

const URL_LOGO = '/assets/logo.svg';

export function renderLogo({ size = 32, cor = 'var(--c-musgo)', titulo = '' } = {}) {
  const px = typeof size === 'number' ? `${size}px` : size;
  // Usa mask-image: o SVG vira uma silhueta colorivel pela propriedade
  // background. Funciona em todos os browsers modernos (Chrome, Firefox,
  // Safari) e nao depende de cores embutidas no SVG.
  return `
    <span class="brand-logo" role="${titulo ? 'img' : 'presentation'}"
          ${titulo ? `aria-label="${escAttr(titulo)}"` : 'aria-hidden="true"'}
          style="
            display:inline-block;
            width:${px}; height:${px};
            background:${cor};
            -webkit-mask: url(${URL_LOGO}) no-repeat center / contain;
                    mask: url(${URL_LOGO}) no-repeat center / contain;
            flex-shrink:0;
          "></span>`;
}

function escAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
