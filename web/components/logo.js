// logo.js — marca Ledo (símbolo de pétala dupla).
// SVG INLINE com prefers-color-scheme dentro do <style> — adapta
// automaticamente light/dark sem JS, sem precisar trocar atributos.
//
// 3 variações disponíveis (BRAND_GUIDE secao 4):
//   adaptativo  — light: musgo+pálido / dark: pálido+musgo (default)
//   padrao      — fixo 2 cores claras (musgo externo + pálido interno)
//   mono        — 1 cor (sem pétala interna) — pra impressão / favicon
//   branco      — negativa (símbolo branco com fundo musgo)

const PALETA = {
  musgo:   '#2D4A2E',
  palido:  '#E8F0E5',
  branco:  '#FFFFFF',
};

export function renderLogo({ size = 32, variante = 'adaptativo', titulo = '' } = {}) {
  const px = typeof size === 'number' ? `${size}px` : size;
  const role = titulo ? 'img' : 'presentation';
  const ariaAttr = titulo ? `aria-label="${escAttr(titulo)}"` : 'aria-hidden="true"';

  let estilo, mostraInterna = true;
  switch (variante) {
    case 'padrao':
      estilo = `.ext{fill:${PALETA.musgo}}.int{fill:${PALETA.palido}}`;
      break;
    case 'mono':
      estilo = `.ext{fill:${PALETA.musgo}}`;
      mostraInterna = false;
      break;
    case 'branco':
      estilo = `.ext{fill:${PALETA.branco}}.int{fill:${PALETA.musgo}}`;
      break;
    case 'adaptativo':
    default:
      // light mode default + dark mode inverte
      estilo = `.ext{fill:${PALETA.musgo}}.int{fill:${PALETA.palido}}` +
               `@media (prefers-color-scheme:dark){` +
               `.ext{fill:${PALETA.palido}}.int{fill:${PALETA.musgo}}}`;
      break;
  }

  const petalaInterna = mostraInterna
    ? `<path class="int" d="M128,40 L160,40 C160,40 175,55 175,85 C175,115 160,130 128,130 C100,130 85,115 85,85 C85,55 100,40 128,40 Z"/>`
    : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"
         width="${px}" height="${px}"
         role="${role}" ${ariaAttr}
         style="display:inline-block;flex-shrink:0;">
      <style>${estilo}</style>
      <path class="ext" d="M128,40 L180,40 C180,40 210,70 210,130 C210,190 180,220 128,220 L76,220 C76,220 50,190 50,130 C50,70 80,40 128,40 Z"/>
      ${petalaInterna}
    </svg>`;
}

function escAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
