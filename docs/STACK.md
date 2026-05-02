# Stack — Caixa Boti

Snapshot canônico do toolchain após CP3.15 (migração para Vite).

## Versões canônicas

- **Vite** 5.4.x — dev server + bundler de produção
- **Tailwind** 3.4.x via PostCSS 8 + Autoprefixer
- **@supabase/supabase-js** 2.105.x
- **Node** 20+ recomendado (testado em 24)
- **HTML + JS vanilla** (ESM, sem TypeScript), sem framework SPA
- **Roteador próprio** (`web/app/router.js`, History API)
- **Fontes**: Fraunces + Manrope via Google Fonts (CDN)

## Comandos

```bash
# Setup inicial
npm install
cp .env.example .env.local   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# Dev
npm run dev                  # http://localhost:5173/
npm run dev -- --host        # acessível em outros devices da rede

# Build
npm run build                # gera /dist (~92 KB gzip)
npm run preview              # confere build em http://localhost:4173 (com CSP)
```

## Variáveis de ambiente

| Variável                      | Onde é lida                     | Exposta no bundle? |
|-------------------------------|---------------------------------|--------------------|
| `VITE_SUPABASE_URL`           | `web/app/supabase.js`           | sim (intencional)  |
| `VITE_SUPABASE_ANON_KEY`      | `web/app/supabase.js`           | sim (intencional)  |
| `WEB_URL_LOCAL`               | docs / scripts (não código)     | não                |
| `SUPABASE_SERVICE_ROLE_KEY`   | NUNCA no frontend               | não                |
| `RESEND_API_KEY`              | Edge Functions (vault)          | não                |
| `MASTER_ENCRYPTION_KEY`       | Edge Functions (vault)          | não                |

Regra do prefixo `VITE_`: o Vite só embute no bundle do cliente variáveis com esse prefixo. Qualquer segredo (service_role, SMTP, encryption) **nunca** com `VITE_*`.

## Estrutura

```
caixa-boti/
├── package.json              # vite, tailwind, postcss, autoprefixer, supabase-js
├── vite.config.js            # root: web/, envDir: .., publicDir: public, appType: spa
├── tailwind.config.js        # paleta editorial + Fraunces/Manrope, content scaneando web/**
├── postcss.config.js         # tailwindcss + autoprefixer
├── .env.example              # template documentado
├── .env.local                # credenciais reais (gitignored)
├── docs/                     # 5 docs canônicos + auxiliares
├── supabase/
│   ├── migrations/           # 23 migrations Fase 1 + F1B
│   └── functions/            # 4 edge functions Deno
└── web/
    ├── index.html            # entry; Vite injeta CSS/JS hashed no build
    ├── app/
    │   ├── main.js           # entrypoint (importa CSS + dispara router)
    │   ├── router.js         # rotas + History API + auth guard
    │   ├── supabase.js       # cliente Supabase + sessão + helpers
    │   ├── auth.js           # login/cadastro/recuperação/redefinição
    │   ├── dominio.js        # vocabulário pt-BR (CATEGORIAS, ESTADO_CAIXA, ...)
    │   ├── notifications.js  # toast container
    │   ├── utils.js          # debounce, formatBRL, validarEmail, ...
    │   ├── i18n.js           # placeholder
    │   ├── store.js          # placeholder
    │   └── pages/            # login, cadastro, confirmar, recuperar, redefinir,
    │                         #  dashboard, caixas, caixa
    ├── components/
    │   ├── header.js         # barra superior (Caixas · Pendências · Configurações)
    │   ├── logo.js           # SVG mask, colorível por CSS var
    │   ├── modal.js          # drawer/modal genérico (lateral ou centralizado)
    │   ├── modal-adicionar-nf.js       # NF + valor + cliente (em análise)
    │   ├── modal-editar-lancamento.js  # 3 modos: categorizar, gerenciar, finalizado
    │   ├── pop-select.js     # listbox custom (substitui <select> nativo)
    │   └── pop-data.js       # date picker custom (substitui input[type=date])
    ├── styles/
    │   ├── tailwind.css      # @tailwind base/components/utilities
    │   ├── tokens.css        # variáveis (paleta, raios, sombras, ease)
    │   └── components.css    # classes editoriais (.lanc-row, .caixa-row, etc.)
    └── public/               # statics copiados 1:1 para o build
        ├── assets/           #   logo.svg + img/
        ├── favicon.svg       #   adaptativo light/dark
        ├── _headers          #   CSP + headers de segurança (Cloudflare Pages)
        └── _redirects        #   SPA fallback (Cloudflare Pages)
```

## Decisões arquiteturais relevantes

- **Sem build de TypeScript**: ESM nativo do navegador via Vite, sem etapa de transpilação de tipos.
- **Sem framework**: cada tela é um módulo que renderiza HTML em `#app` e ata listeners.
- **Sem state manager**: estado vive no DOM ou em variáveis de módulo (cleanup em `renderXxx()`).
- **Anon key exposta no bundle é design pretendido** — Supabase RLS protege os dados, e a key é JWT pré-assinado com `role=anon`. Smoke tests F1 e F1B confirmaram que sem RLS-permission nada vaza.
- **Tailwind purgado no build** mantém apenas classes efetivamente usadas. Bundle CSS final ~12KB gzip.
- **CSS imports via `main.js`** (não via `<link>` no HTML) — Vite garante ordem (Tailwind → tokens → components) e bundla tudo num único `index-[hash].css`.
- **CSP estrita em produção** — `script-src 'self'` sem `unsafe-inline` (HTML produzido pelo Vite tem só `<script src=>`), `connect-src` restrito ao project-ref específico do Supabase. Replicada em `vite.config.js` preview.headers para validação local antes do deploy.
- **Sem PWA** — o sistema é um site web responsivo padrão, acessado via navegador (PC e celular). PWA foi avaliado e descartado para evitar complexidade desnecessária: sem service worker, sem manifest, sem fila offline, sem instalação como app. Decisão tomada após CP7 (2026-05-02).

## Segurança

- `.env.local` nunca vai pro git (`.gitignore`: `.env.*`)
- Anon key é JWT público; service_role nunca aparece em `web/`
- HSTS preload, X-Frame-Options DENY, frame-ancestors 'none' em produção
- Auth: PKCE flow + storage em memória (NÃO usa localStorage/sessionStorage por regra do projeto)

## Não está aqui (pendente)

- **Self-host de fontes** — Fraunces + Manrope ainda via Google CDN. Trade-off: dependência de network vs. ~200KB extras no bundle. Decisão de produto.
- **Deploy Cloudflare Pages** — automação via wrangler/MCP entra na Fase 4.
- **Backend "em análise"** — RPCs `categorizar_lancamento`, `marcar_finalizado`, `marcar_cancelado_pos`, `adicionar_observacao` + tabela `lancamento_observacao`. Documentado em `docs/PROXIMA_RODADA_BACKEND.md`.
