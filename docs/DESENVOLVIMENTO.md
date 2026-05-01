# Desenvolvimento local

Este projeto é **HTML+JS vanilla**, **sem framework no runtime** (nem React, nem Vue). O Vite cuida de:

- Servidor de desenvolvimento com **SPA fallback** (F5 em `/dashboard` ou `/caixa/:data` não cai em 404).
- **Cache desativado em dev** — mudanças no CSS/JS aparecem na hora.
- **Hot module reload (HMR)** — editar arquivo, ver atualizar sem perder estado.
- **Bundle de produção** otimizado (Tailwind purga não usado, CSS minificado, hash dos assets para cache busting).

## Setup inicial

Pré-requisito: **Node 18+** (testado com 24).

```bash
# Na raiz do projeto:
npm install                 # baixa Vite, Tailwind, supabase-js, etc.
cp .env.example .env.local  # depois preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

`.env.local` é gitignored — credenciais reais não vão pro repo.

## Subir em desenvolvimento

```bash
npm run dev          # http://localhost:5173/login (abre auto)
npm run dev -- --host  # acessível em outros devices da rede
```

## Build de produção

```bash
npm run build      # gera /dist com bundle otimizado e hashed
npm run preview    # serve /dist localmente em http://localhost:4173 para conferir
```

Tamanho típico do bundle: **~92 KB gzip** (HTML+CSS+JS), bem dentro do limite < 300 KB.

## Estrutura

```
caixa/
├── package.json           — Vite, Tailwind, PostCSS, supabase-js
├── vite.config.js         — root: 'web', appType: 'spa', publicDir: 'public'
├── tailwind.config.js     — paleta papel/musgo/âmbar + Fraunces+Manrope
├── postcss.config.js      — tailwindcss + autoprefixer
├── .env.local             — credenciais Supabase (gitignored)
├── .env.example           — template documentado
└── web/
    ├── index.html         — entry; Vite injeta CSS/JS hashed no build
    ├── public/            — copiado 1:1 para /dist (assets, manifest, sw.js)
    │   ├── assets/        —   logo.svg, favicon
    │   ├── manifest.webmanifest
    │   ├── sw.js
    │   ├── _headers       — cabeçalhos do Cloudflare Pages
    │   └── _redirects     — SPA fallback do Cloudflare
    ├── styles/            — tokens.css, components.css, tailwind.css
    ├── app/               — main.js, router.js, supabase.js, pages/
    └── components/        — header, modal, drawer, pop-select, pop-data, ...
```

## Decisões da migração

- **Permanece**: HTML+JS vanilla, sem framework. Imports absolutos (`/components/...`, `/styles/...`) seguem funcionando porque o Vite usa `root: 'web'`.
- **Mudou**: Tailwind sai do CDN para build via PostCSS (purge real, sem dependência de cdn.tailwindcss.com em runtime). supabase-js sai do `esm.sh` para `npm`. Credenciais hardcoded em `app/supabase.js` migram para `import.meta.env.VITE_*`.
- **Não vira**: React/Vue/Next/qualquer framework. Vite é dev server + bundler, nada mais.
- **Deploy Fase 4**: `npm run build` gera `/dist`, que sobe pro Cloudflare Pages.

## Por que sair do CDN

`python -m http.server` não tinha fallback SPA — F5 em `/dashboard` retornava 404. Tailwind via CDN obrigava o navegador a baixar a lib inteira em runtime e injetar todas as classes (sem purge). supabase-js via `esm.sh` dependia de servidor externo. A migração resolve todos os três num único toolchain enxuto, sem trazer framework.
