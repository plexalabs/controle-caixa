// vite.config.js — dev server e build do frontend do Caixa Boti.
//
// Vite serve o app SPA a partir de web/, le .env de .. (raiz do repo),
// e gera o build em ../dist (pronto para Cloudflare Pages na Fase 4).
//
// Toolchain:
//   - Tailwind: PostCSS plugin (tailwind.config.js, postcss.config.js).
//   - supabase-js: pacote npm @supabase/supabase-js, importado em
//     web/app/supabase.js — credenciais via import.meta.env.VITE_*.
//   - SPA fallback: rotas como /caixa/2026-04-30 voltam o index.html
//     (appType: 'spa').
//
// HMR + Cache-Control: no-store em dev garantem que mudancas aparecem
// na hora, sem Ctrl+Shift+R.

import { defineConfig } from 'vite';

export default defineConfig({
  // A raiz do servidor de dev e a pasta web/ — assim caminhos que comecam
  // com "/" (ex.: <link href="/styles/tokens.css">) resolvem para web/.
  root: 'web',

  // Onde o Vite procura .env* — por padrao seria o root (web/), mas
  // queremos manter os arquivos .env na raiz do repositorio (junto
  // com .env.example). Caminho relativo ao root.
  envDir: '..',

  // public/ contem statics que sao copiados 1:1 para o build sem
  // processamento (manifest.webmanifest, sw.js, _headers, _redirects,
  // assets/ com logo.svg e favicon). URLs absolutas como /manifest.json
  // ou /assets/logo.svg continuam funcionando em dev e em build.
  publicDir: 'public',

  // Modo SPA: qualquer rota desconhecida cai no index.html.
  appType: 'spa',

  server: {
    port: 5173,
    host: 'localhost',
    open: '/login',
    strictPort: false,
    // No-cache em dev — garante que recarregamentos sempre pegam a
    // versao mais recente do disco. (Vite ja faz isso por padrao
    // para modulos JS, mas reforcamos para CSS/assets.)
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },

  // Build de producao — gera artefatos otimizados em dist/. So sera
  // usado quando publicarmos no Cloudflare Pages (Fase 4).
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
  },

  // npm run preview replica os mesmos cabecalhos que web/public/_headers
  // entrega no Cloudflare Pages. Permite validar a CSP antes do deploy.
  preview: {
    headers: {
      'Strict-Transport-Security':
        'max-age=31536000; includeSubDomains; preload',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy':
        'geolocation=(), camera=(), microphone=(), interest-cohort=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://shjtwrojdgotmxdbpbta.supabase.co wss://shjtwrojdgotmxdbpbta.supabase.co",
        "manifest-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },
});
