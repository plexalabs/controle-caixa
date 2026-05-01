# Desenvolvimento local

Este projeto continua sendo **HTML+JS vanilla com Tailwind via CDN** (zero framework no runtime). A única ferramenta de build é o **Vite**, usado apenas como **servidor de desenvolvimento**:

- Dá fallback SPA (F5 em `/dashboard` ou `/caixa/:data` não cai mais em 404).
- Desativa cache em dev — mudanças no CSS/JS aparecem na hora.
- Faz hot module reload (HMR) — editar arquivo, ver atualizar.

## Subir o site localmente

Pré-requisito: **Node 18+** instalado.

```bash
# Da raiz do projeto:
npm install        # roda só na primeira vez
npm run dev        # sobe o servidor em http://localhost:5173/login
```

A flag `--host` pode ser adicionada para acessar de outro device da rede:

```bash
npm run dev -- --host
```

## Build de produção

```bash
npm run build      # gera /dist com tudo otimizado
npm run preview    # serve o /dist localmente para conferir
```

## Decisões da migração

- **Mantemos**: HTML+JS vanilla, Tailwind CDN, supabase-js via esm.sh, estrutura de pastas em `web/`. Os imports absolutos (`/components/...`, `/styles/...`) continuam funcionando porque o Vite usa `root: 'web'`.
- **Não vira**: React/Vue/Next.js. O Vite aqui é só dev server + SPA router fallback. Sem refactor de componentes.
- **Deploy** (Fase 4): `npm run build` gera artefato estático em `/dist`, que vai pro Cloudflare Pages igual ao plano original.

## Por que não mais `python -m http.server`

`http.server` não tem fallback para SPA — quando o usuário recarrega `/caixa/2026-04-30`, ele procura o arquivo literal e retorna 404. Vite resolve isso com `appType: 'spa'`.
