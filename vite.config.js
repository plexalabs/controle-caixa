// vite.config.js — dev server para o frontend do Caixa Boti.
//
// Por que Vite e nao mais "python -m http.server":
//   1. SPA fallback: dar F5 em /dashboard ou /caixa/2026-04-30 ja nao
//      retorna 404. Vite serve index.html para qualquer rota nao-arquivo.
//   2. Cache desativado em dev: mudancas no CSS/JS aparecem na hora,
//      sem Ctrl+Shift+R.
//   3. HMR (hot module reload): editar e ver atualizar sem perder estado.
//
// O que NAO mudou:
//   - HTML+JS vanilla (sem framework).
//   - Tailwind via CDN (script src=cdn.tailwindcss.com no index.html).
//   - supabase-js carregado via esm.sh dentro do JS.
//   - Estrutura de pastas web/ com imports absolutos /components/...,
//     /styles/..., /app/... — Vite resolve naturalmente porque root='web'.

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
});
