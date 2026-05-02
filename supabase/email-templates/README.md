# Templates de email — Caixa Boti

Fonte da verdade dos 3 emails de auth do projeto. Versionados no git;
**aplicados manualmente no Dashboard Supabase** porque o MCP/Management
API não expõe Email Templates.

## Os 3 templates

| Arquivo | Template Supabase | Quando dispara | Variáveis usadas |
|---|---|---|---|
| `confirmation.html` | **Confirm signup** | Cadastro novo (ConfirmationURL clicável) | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `recovery.html` | **Reset Password** | Operador clicou em "Esqueci a senha" | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `magic_link.html` | **Magic Link** | Login OTP de 8 dígitos (`signInWithOtp`) | `{{ .Token }}`, `{{ .Email }}` |

> **Atenção sobre o template Magic Link:** o app usa OTP de 8 dígitos
> (configurado em Auth → Providers → Email → Email OTP Length = 8). O
> template `magic_link.html` mostra o código `{{ .Token }}` em destaque
> Courier 38px. Se um dia migrar pra link mágico de verdade, trocar
> `{{ .Token }}` por `{{ .ConfirmationURL }}`.

## Como aplicar no Dashboard

1. Abrir https://supabase.com/dashboard/project/shjtwrojdgotmxdbpbta/auth/templates
2. Pra cada um dos 3 templates:
   - **Confirm signup** ← copiar `confirmation.html`
   - **Reset Password** ← copiar `recovery.html`
   - **Magic Link** ← copiar `magic_link.html`
3. Em cada um:
   - Colar o **HTML inteiro** no campo "Email body" (sobrescreve o default Supabase)
   - Atualizar o **Subject** conforme tabela abaixo
   - Clicar em **Save changes**

### Subjects (campo separado, não está no HTML)

| Template | Subject |
|---|---|
| Confirm signup | `Caixa Boti · Bem-vindo ao caderno` |
| Reset Password | `Caixa Boti · Vamos refazer sua senha` |
| Magic Link | `Caixa Boti · Sua chave de confirmação` |

### Sender (já configurado em Auth → SMTP Settings)

- **From email**: `noreply@plexalabs.com`
- **From name**: `Caixa Boti`

(Setup completo em `docs/SETUP_RESEND_SMTP.md`.)

## Decisões de design

### Por que sem logo SVG inline

`web/public/assets/logo.svg` tem ~13 KB de paths densos. Inline em email:
- Aumenta tamanho do email (alguns provedores cortam acima de 100 KB)
- Outlook desktop e versões antigas do Gmail Android não suportam SVG
- Provedores corporativos podem strip por filtros de segurança

**Solução**: ornamento geométrico CSS (3 caixas empilhadas em âmbar/musgo/cinza
via `box-shadow`) + wordmark "Caixa Boti" em Fraunces italic. Identidade
visual mantida sem nenhum asset binário/vetor — funciona em 100% dos clientes.

### Por que tabelas e inline styles

CSS moderno (flex, grid, custom properties) é stripado ou ignorado por
Gmail/Outlook. A alternativa robusta é HTML estilo 1998: tabelas para
layout, inline styles em todo elemento. Cada template segue esse padrão.

### Fontes com fallback

```
Títulos: 'Fraunces', Georgia, 'Times New Roman', serif
Corpo:   'Manrope', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif
Código:  'Courier New', 'Roboto Mono', monospace
```

Fraunces e Manrope só renderizam em clientes que carregam fontes web (Apple
Mail, Outlook for Mac). Em Gmail/Outlook web vão pro fallback (Georgia/Helvetica)
— ainda fica editorial e legível.

### Dark mode

Sem media query `prefers-color-scheme` específica. Cores fixas na paleta
papel/musgo/âmbar funcionam em ambos os temas. Apple Mail pode inverter
sozinho — mas o resultado fica aceitável (texto escuro vira claro, fundo
papel claro vira escuro). Não testar em dark mode é decisão consciente.

## Pendências

- **Aplicar os 3 templates no Dashboard** (passo 2 acima) — operador, manual
- **Atualizar os 3 subjects no Dashboard** — operador, manual
- Validar visualmente em **Gmail web**, **Outlook web** e **Apple Mail** após aplicação
