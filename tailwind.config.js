/** @type {import('tailwindcss').Config} */
// Configuracao migrada do <script>tailwind.config={...}</script> que vivia
// inline no index.html quando usavamos o Play CDN. As cores canonicas e as
// fontes editoriais Fraunces+Manrope sao do projeto Caixa Boti.

export default {
  content: [
    './web/index.html',
    './web/**/*.{js,html}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta editorial — papel quente + verde-petroleo + ambar.
        papel:   '#F5EFE6',
        papel2:  '#EDE5D6',
        tinta:   '#1A1A1A',
        tinta2:  '#3F3F3F',
        musgo:   '#0F4C3A',
        musgo2:  '#1F6A55',
        ambar:   '#C77A3F',
        alerta:  '#9A2A1F',
      },
      fontFamily: {
        // Display nao-padrao com personalidade — evita "AI slop".
        display: ['Fraunces', 'serif'],
        sans:    ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
