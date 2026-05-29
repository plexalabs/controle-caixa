# Ledo

Sistema SaaS de auditoria diária de caixa para pequenos negócios.

**Produção**: https://caixa-boti.plexalabs.com  
*(URL será migrada para `ledo.app` ou similar em fase futura)*

## Stack

- Frontend: HTML + JS vanilla + Tailwind CSS (via PostCSS)
- Build: Vite
- Backend: Supabase Pro (PostgreSQL + RLS + Realtime + Storage + Auth)
- Hosting: Cloudflare Pages
- Email: Resend
- Observabilidade: Sentry

## Funcionalidades

- Abertura e fechamento de caixa diário
- Registro de lançamentos com categorização
- Linha do tempo de observações por lançamento
- Pendências automáticas para itens não categorizados
- Sistema RBAC granular (perfis + permissões pontuais)
- Relatórios em PDF e XLSX
- Audit log imutável

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build de produção

```bash
npm run build
```

## Identidade visual

Ver `brand/BRAND_GUIDE.md` para paleta, tipografia e regras de uso da marca Ledo.

## Documentação interna

- `docs/PROGRESSO.md` — log operacional
- `brand/BRAND_GUIDE.md` — guia visual da marca Ledo
- `docs/STACK.md` — stack técnico detalhado
- `docs/RELATORIO_AUDITORIA.md` — auditoria externa do sistema
