# PROGRESSO — Sistema de Controle de Caixa

> Sistema em produção em https://caixa-boti.plexalabs.com via Cloudflare Pages (2026-05-03).
> Banco zerado e Operador re-cadastrado como admin via trigger `trg_primeiro_admin`.
> Stack canônica documentada em `docs/STACK.md`.

## Status — Reset operacional (2026-05-03)

### Concluído

- [x] **Reset de banco em produção** após validação do deploy
  - Apagados: 4 users, 5 papéis, 1 caixa, 1 lançamento, 1 notificação
  - Mantidos: 9 configs, 15 feriados ativos
  - Vendedora "Vendedora Teste" do CP3 também removida

- [x] **Trigger `trg_primeiro_admin`** em `auth.users`
  - Primeiro cadastro com sistema vazio vira admin automaticamente
  - Demais cadastros viram operador
  - Risco aceito conscientemente: "primeiro a chegar = admin"
  - Operador cadastrou-se imediatamente após reset e validou
    (6 cards visíveis em `/configuracoes`)

### Pendências

- **Trigger `trg_primeiro_admin` deve ser revisado**: enquanto sistema for
  privado e baixa exposição, mantém. Se virar público multi-tenant, trocar
  por whitelist explícita ou remover.
- **Sistema agora está em estado de produção real** com 1 admin (Operador)
  e zero dados operacionais. Pronto para uso.

## Status — Fix do redefinir senha (2026-05-03)

### Concluído

- [x] **Bug do redefinir senha corrigido**
  - Causa raiz: `flowType='pkce'` em `web/app/supabase.js` + click tracking
    do Resend e SafeLinks do Gmail consumiam o `?code=XXX` (one-time-use)
    antes do Operador clicar — sintoma: link sempre "expirado" mesmo em <30s
  - Solução: trocar flow de link por OTP de 8 dígitos no email
  - Visual editorial mantido (mesmo padrão do `/confirmar` de signup —
    Courier 38px com filete âmbar)
  - Boot defensivo em `main.js` captura URLs com `error=otp_expired` (links
    antigos no inbox) e redireciona para `/recuperar?expirado=1` com aviso

### Pendência

- **Template `recovery.html` reaplicado manualmente** no Dashboard Supabase
  pelo Operador (Supabase não expõe API pra atualizar templates)

## Status — RBAC Sessão 4 (2026-05-04)

### Concluído (Sessão 4 de 5)

- [x] 5 RPCs novas: `criar_perfil`, `atualizar_permissoes_perfil`,
      `deletar_perfil`, `listar_perfis_com_detalhes`,
      `listar_usuarios_afetados_por_perfil`
- [x] Tela `/configuracoes/permissoes` com identidade editorial
- [x] Listagem de perfis (badge "sistema" nos 5 pré-definidos)
- [x] Drawer de edição com permissões agrupadas por 9 módulos
- [x] Drawer de criação de perfis customizados
- [x] Modal de confirmação listando usuários afetados antes de salvar
- [x] Modal de delete por digitação do nome (case-sensitive)
- [x] Bloqueios: `e_sistema=true` não pode ser deletado;
      `total_usuarios>0` bloqueia delete
- [x] `papeis.js`: `listarTodasPermissoes()` utilitário
- [x] Card "Perfis e permissões" em `/configuracoes` gated por
      `perfil.visualizar`

### Decisões registradas

- **Operador editou perfil "operador"** durante o smoke (adicionou
  `relatorio.diario`). Operador (super_admin) tem perfil 'operador'
  atribuído, então essa edição afeta operadores futuros que receberem
  esse perfil. Operador ciente.
- **Validação por digitação** é case-sensitive — protege contra
  cliques acidentais

### Pendências do projeto RBAC

- **Sessão 5 (~1-2h)**: Tela `/configuracoes/usuarios` reescrita.
  Atribuição de perfis em vez de papéis. Concessão de permissões
  extras pontuais via UI. Após Sessão 5 estável, remover o filtro
  `AND papel != 'super_admin'` no `definir_papeis_usuario`
  (workaround temporário da Sessão 2-FIX)

### Estado do sistema RBAC

- Tabelas RBAC: populadas
- 39 permissões catalogadas em 9 módulos
- 5 perfis pré-definidos + capacidade de criar customizados via UI
- 5 RPCs servidor + 7 call sites client + 1 nova tela CRUD
- Cache de permissões ativo (TTL 1 min)
- super_admin: bypass total em servidor + wildcard no client
- super_admin pode editar qualquer perfil (incluindo de sistema)
  exceto o e_sistema (não pode deletar)

## Status — RBAC Sessão 3 (2026-05-04)

### Concluído (Sessão 3 de 5)

- [x] `papeis.js` refatorado com cache de permissões (TTL 1 minuto)
- [x] `temPermissao()` async + `temPermissaoSync()` para uso em loop
- [x] Bypass super_admin via wildcard `*` no cache
- [x] Invalidação automática via `onAuthStateChange` + manual em mudanças
- [x] 7 call sites migrados para `temPermissaoSync(<permissao_granular>)`
- [x] Backward-compat da Sessão 1 REMOVIDO

### Pendências do projeto RBAC

- **Sessão 4 (~3-4h)**: Tela `/configuracoes/permissoes` com CRUD de
  perfis e edição granular de permissões
- **Sessão 5 (~1-2h)**: Tela `/configuracoes/usuarios` reescrita;
  remover workaround `papel != 'super_admin'` após estabilizar

### Estado do sistema RBAC

- Tabelas RBAC: populadas
- 39 permissões catalogadas em 9 módulos
- 5 perfis pré-definidos
- 5 RPCs servidor + 7 call sites client migrados
- Cache de permissões ativo
- super_admin: bypass total em servidor + wildcard no client

## Status — RBAC Sessão 2 (2026-05-04)

### Concluído (Sessão 2 de 5)

- [x] Catálogo: `lancamento.revelar_pii` adicionada (39 permissões total)
- [x] 5 RPCs migradas para `tem_permissao()`:
  - `atualizar_config` → `config.editar_sistema`
  - `definir_papeis_usuario` → `usuario.atribuir_perfil`
  - `gerar_relatorio_periodo` → `relatorio.diario`
  - `listar_usuarios_papeis` → `usuario.visualizar`
  - `revelar_pii` → `lancamento.revelar_pii`
- [x] 5 funções preservadas com COMMENT registrando razão (NÃO MIGRADAS)
- [x] FIX: `definir_papeis_usuario` preserva `super_admin` no UPDATE
  (workaround pro bug do demote silencioso pela UI antiga)

### Decisão arquitetural (Caminho A do conflito declarado)

3 RPCs ficam mais restritivas vs sistema antigo (admin perde acesso a
`config.editar_sistema`, `usuario.atribuir_perfil`; operador perde
`relatorio.diario`). Operador atual (super_admin) bypassa via
`tem_permissao()`. Admins futuros precisarão de permissões extras
pontuais ou perfil customizado (Sessão 4) para recuperar essas
capacidades.

## Status — RBAC Sessão 1 (2026-05-03)

### Decisão arquitetural

Sistema de permissões granulares (RBAC) sobre o sistema de papéis simples.
Decisão de modelagem do Operador:
- **Hierarquia**: super_admin > admin > gerente > operador > vendedor > contador
- **Multiplicidade**: 1 perfil principal + permissões extras pontuais (híbrido)
- **Editável via UI**: super_admin edita perfis e permissões na Sessão 4
- **Catalogo upfront**: 38 permissões catalogadas em 9 módulos
- **Super-admin**: 3º valor no enum de papel; bypass total nas checagens

### Concluído (Sessão 1 de 5)

- [x] Tabelas RBAC criadas e populadas
- [x] Catalogo de 38 permissões em 9 módulos
- [x] 5 perfis pré-definidos (e_sistema=true, não-deletáveis)
- [x] Função `tem_permissao(uuid, text)` com bypass super_admin
- [x] RLS estrita: leitura authenticated, escrita super_admin
- [x] `temPermissao()` no client em paralelo (não adotada ainda)
- [x] Backward-compat: super_admin satisfaz `temPapel('admin')` em todos
      os 8 call sites antigos

### Pendências do projeto RBAC

- **Sessão 2 (~3-4h)**: Reescrita das ~15 RPCs do banco para checar
  permissões em vez de papel (mantendo super_admin bypass). É a sessão
  mais arriscada porque mexe em código que está rodando em produção.
- **Sessão 3 (~2-3h)**: Reescrita do `papeis.js` no client + guards
  das telas migrando de `temPapel()` para `temPermissao()`
- **Sessão 4 (~3-4h)**: Tela `/configuracoes/permissoes` com CRUD
  de perfis e edição de permissões
- **Sessão 5 (~1-2h)**: Tela `/configuracoes/usuarios` reescrita para
  atribuir perfis em vez de papéis

### Decisão pendente (revisitar)

- **Operador tem 2 papéis ativos**: `operador` E `super_admin`. Não é bug,
  mas é estado que vale corrigir antes da Sessão 2. Após Sessão 2 e 3
  estarem estáveis, considerar desativar `operador` extra:
  ```sql
  UPDATE public.usuario_papel
  SET ativo = false
  WHERE usuario_id = (SELECT id FROM auth.users WHERE email = 'joaopedro.botucatu@vdboti.com.br')
    AND papel = 'operador';
  ```
- **Trigger `fn_promove_primeiro_admin`** não seta `ativo=true` no INSERT
  (depende do default da coluna). Hoje funciona porque default é true,
  mas vale revisar em sessão futura.

## Status — Sistema em produção (2026-05-03)

### Deploy realizado

Sistema rodando em `https://caixa-boti.plexalabs.com` via:
- **Cloudflare Pages** servindo o build estático (`dist/`)
- **Custom domain** em zona Cloudflare com SSL automático
- **Supabase** continua hospedado em `shjtwrojdgotmxdbpbta.supabase.co`
- **Variáveis de ambiente** em prod: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`, `NODE_VERSION=20`

### Decisões arquiteturais finais

- **Cloudflare Pages como host** (não localhost via Tunnel) — escolha consciente após avaliar trade-offs
- **Web Analytics do Cloudflare desabilitado** no Dashboard para evitar conflito com CSP estrita
- **CSP do `_headers`** permite explicitamente `static.cloudflareinsights.com` (script-src + hash sha256) e `cloudflareinsights.com` (connect-src) como fallback
- **Build automático**: cada push em `main` dispara deploy automático via integração Cloudflare-GitHub

### Pendências pós-deploy

- **Sentry DSN configurado**: erros de produção começam a ser capturados a partir deste deploy
- **Cron mensal arquivamento**: ainda manual no Dashboard Supabase (Operador descartou no momento)
- **PITR Supabase**: pendente de ativação manual
- **Onboarding (CP-PRE-DEPLOY-3)**: tutorial guiado in-app + revisão final de copy ainda não foi feito
- **Tela `/caderno-do-dia`**: notificação `bom_dia_resumo` ainda redireciona para `/dashboard` como solução temporária

### Lições aprendidas

- **CSP estrita conflita com Web Analytics injection**: descoberto durante deploy. Resolvido por desabilitar Analytics no Dashboard + permitir `static.cloudflareinsights.com` no CSP.
- **Tunnel + localhost descartado**: foi avaliado como alternativa (CP-DEPLOY-LOCAL Sessões 1-3) mas trade-offs operacionais (PC ligado 24/7, internet do trabalho como SLA, manutenção contínua) não compensaram. Toda a infra `infra/instalador/` + `infra/tunnel/` + `docs/DEPLOY_LOCAL.md` foi removida da `main` no deploy final.
- **Validação real só no ambiente real**: agente headless não consegue testar `.bat` Windows. Validação visual deve ser sempre feita pelo Operador.

## Status — fim do CP-DEPLOY-LOCAL (2026-05-03) [HISTÓRICO — abordagem descartada]

### Decisão arquitetural

Cloudflare Pages descartado em favor de execução local + Cloudflare Tunnel.
Razão registrada: Operador preferiu controle total do servidor sobre conveniência
de SaaS estático. Trade-offs aceitos: dependência de PC do trabalho ligado,
manutenção mais frequente, internet do trabalho como SLA.

### Concluído (adições)

- [x] **Sessão 1: Configuração para deploy local**
  - `_headers` ajustada com CSP para Sentry e Cloudflare Insights
  - Script `npm run start:local` com `vite preview --host 127.0.0.1 --port 4173`
  - `infra/tunnel/config.yml` template para tunnel `caixa-boti`
  - `docs/DEPLOY_LOCAL.md` com passo-a-passo manual completo
  - `docs/INFRA.md` documenta arquitetura local

- [x] **Sessão 2: Instalador empacotado**
  - `infra/instalador/instalar-caixa-boti.bat` orquestrador
  - 9 etapas `.bat` granulares (verificar, Node, Git, cloudflared, clone, env, build, tunnel, PM2)
  - Download dinâmico via PowerShell (sem MSIs no repo)
  - Substituição automática de TUNNEL_ID no config.yml via PowerShell
  - PM2 + pm2-windows-startup para autostart do app (depois substituído pela Sessão 3)
  - Idempotência verificada por inspeção em todas as etapas
  - README com troubleshooting (antivírus, repo privado, reinstalação)

- [x] **Sessão 2-FIX: encoding dos `.bat`**
  - Operador rodou no PC do trabalho e o instalador parou logo no boot
    com mensagens "'o' não é reconhecido como comando interno". Causa:
    conteúdo multi-byte UTF-8 (em-dash `—`, box-drawing `═`) lido pelo
    `cmd.exe` no codepage nativo (CP-850/1252) **antes** do `chcp 65001`
    virar efetivo
  - Fix: todos os 10 `.bat` reescritos em ASCII puro (`—` → `--`,
    `═══` → `===`). Lógica intocada — só encoding
  - README ganhou subseção explicando sintoma + procedimento de
    reinstalação após falha parcial

- [x] **Sessão 3: app como serviço Windows nativo via NSSM**
  - `infra/instalador/instalar-servico-windows.bat` standalone, idempotente
  - Substitui PM2 por NSSM 2.24 (Non-Sucking Service Manager)
  - Razão: PM2 mostra janela cmd, daemon flaky no boot, não roda em
    Session 0. NSSM é o jeito canônico de wrappar processo como serviço
    Windows nativo (mesma arquitetura do `cloudflared`)
  - Serviço chama `node.exe` direto rodando `vite.js preview` — evita o
    cmd.exe extra que `npm.cmd` traria (mais robusto em serviço Windows)
  - Configurações: auto-start no boot, restart automático em crash
    (delay 5s, throttle 10s), logs rotacionados em `C:\caixa-boti\logs\`
    a cada 1MB, mata árvore de processos no stop
  - Resultado: liga o PC → 2 serviços sobem (`caixa-boti-app` +
    `cloudflared`) → site disponível sem janela alguma na tela do operador

### Pendências CP-DEPLOY-LOCAL

- **Validação real**: instalador não testado em ambiente Windows.
  Primeira execução no PC do trabalho é o teste de fato.
- **Repo privado**: se virar privado, clone via HTTPS no `.bat` precisa
  de Personal Access Token. README documenta procedimento.
- **Versão do Node hardcoded**: v20.18.0 em `02-instalar-nodejs.bat`.
  Atualizar URL ao longo do tempo.
- **Antivírus**: Windows Defender pode quarentinar cloudflared.exe.
  README orienta adicionar exceção.
- **Modo offline**: instalador requer internet (downloads PowerShell).
  Se trabalho tiver internet ruim, considerar empacotar MSIs em `recursos/`.
- **Sentry DSN**: configurado no `.env.local` mas Allowed Domains do Sentry
  precisa ser atualizado pra `caixa-boti.plexalabs.com` no Dashboard Sentry.
- **Supabase Site URL**: ainda apontando pra URL provisória de teste anterior.
  Atualizar pra `https://caixa-boti.plexalabs.com` quando tunnel estiver ativo.
- **PITR Supabase**: ainda não ativado. Recomendado antes de uso real.

## Status — fim do CP-PRE-DEPLOY-2 (2026-05-02)

### Concluído (adições)

- [x] **Pré-Deploy 2: Emails customizados pt-BR com identidade editorial**
  - 3 templates HTML editoriais em `supabase/email-templates/`:
    - `confirmation.html` (Confirm signup) — usa `{{ .Token }}`,
      mostra código OTP de 8 dígitos em destaque Courier 38px
    - `recovery.html` (Reset Password) — usa `{{ .ConfirmationURL }}`,
      botão pra `/redefinir`, validade 1 hora
    - `magic_link.html` (Magic Link) — pronto pra futuro `signInWithOtp()`,
      **não usado pelo app hoje** (pular no Dashboard)
  - Subjects editoriais pt-BR (aplicados manualmente no Dashboard):
    - "Caixa Boti · Bem-vindo ao caderno"
    - "Caixa Boti · Vamos refazer sua senha"
    - "Caixa Boti · Sua chave de confirmação"
  - Identidade editorial preservada com fallbacks email-safe:
    - `font-family: 'Fraunces', Georgia, 'Times New Roman', serif` (títulos)
    - `font-family: 'Manrope', -apple-system, 'Segoe UI', sans-serif` (corpo)
    - `font-family: 'Courier New', 'Roboto Mono', monospace` (código OTP)
    - Paleta papel/musgo/âmbar inline (sem CSS variables — Gmail strippa)
  - Logo SVG real (`web/public/assets/logo.svg`) inline com `fill="#2A3D2C"`
    42×42 px no topo esquerdo + wordmark Fraunces italic 24px ao lado.
    Outlook desktop strippa SVG (fallback: wordmark sozinho mantém marca).
  - Filete âmbar 4px à esquerda na caixa do código OTP (acento focal)
  - `border-radius: 18px` total no card (não flat-left/round-right):
    decisão contextual — emails são objetos isolados, não componentes do app
  - README.md em `supabase/email-templates/` com instruções de aplicação
    manual no Dashboard + pré-requisitos (Email OTP Length=8)

### Decisões arquiteturais documentadas

- **OTP via SMTP nativo, não edge function**: descobriu-se durante a
  implementação que não existe edge function `enviar_otp_resend` — o
  Supabase Auth dispara emails direto pelo SMTP do Resend (configurado
  no Dashboard). Os 3 templates são todos aplicados via Auth → Email
  Templates.
- **Versionamento dos templates**: HTMLs ficam em git como fonte da
  verdade. Aplicação no Dashboard é manual (documentada no README).
  Trade-off aceito porque MCP/Management API do Supabase não expõe
  Email Templates programaticamente.

### Pendências CP-PRE-DEPLOY-2

- Validação cross-cliente pendente: validado no cliente do operador,
  mas Outlook desktop e Apple Mail não foram exercitados em escala.
  Possíveis ajustes futuros: SVG inline pode não renderizar em Outlook
  desktop (wordmark Fraunces ao lado mantém legibilidade); fonte
  Fraunces vai pro fallback Georgia em Gmail web.
- Pré-requisito do Dashboard: Auth → Providers → Email → "Email OTP
  Length" deve ser `8` e "Confirm email" habilitado, senão `{{ .Token }}`
  vem vazio no template Confirm signup.

## Status — fim do CP-PRE-DEPLOY-1 (2026-05-02)

### Concluído (adições)

- [x] **Pré-Deploy 1: Bugs críticos e infraestrutura de produção**
  - Bug do F5 corrigido: sessão persiste em IndexedDB + boot aguarda
    `getSession()` antes de redirecionar; restore de rota via query `?next=`
  - Tela 404 editorial com etiqueta lateral âmbar e shell respirado
  - Tela "Lançamento não encontrado" contextual (etiqueta "NF", mesmo shell)
  - Catch-all no router para qualquer rota inexistente
  - `supabase-wrapper.js` com `comRetry` (backoff 1s/2s/4s, 3 tentativas)
    distinguindo erros de rede (retry) de validação (falha imediata)
  - `saude-supabase.js`: detector global + banner instabilidade + ping de
    recuperação a cada 5s
  - `log.js`: console.error sempre em dev, Sentry só em prod com DSN setado
  - Migrations: `dias_retencao_arquivamento` (1 ano padrão) + tabela
    `lancamento_arquivado` com RLS read-only
  - RPC `arquivar_antigos` move lançamentos finalizados/cancelados antigos
    preservando observações vivas (auditoria intacta)
  - Edge function `arquivar-mensal` (cron `0 3 1 * *` pendente de configuração)
  - `notificacao-router.js`: mapeamento tipo → destino correto
    - `pendencia_aberta` → `/caixa/:data?nf=NUMERO` com destaque visual
    - `caixa_nao_fechado` → `/caixa/:data`
    - `bom_dia_resumo` → `/dashboard` (TODO: `/caderno-do-dia`)
  - Enriquecedor batch: 2 queries paralelas resolvem `caixa_id → data`
    e `lancamento_id → numero_nf` antes de renderizar lista
  - Destaque visual de NF com animação `pulso-destaque` 4s + scrollIntoView
    (respeita `prefers-reduced-motion`)
  - Hotfix de seeds: migration `restore_seeds_pos_limpeza.sql` repopula
    `config` (9 chaves) e mantém os 15 feriados após limpeza acidental
  - `docs/INFRA.md` documenta setup Sentry + cron Supabase + backup PITR

### Pendências CP-PRE-DEPLOY-1 (registradas)

- Sentry: DSN configurado localmente em `.env.production` (gitignored).
  Pendente apenas setar `VITE_SENTRY_DSN` no painel Cloudflare Pages
  antes do deploy de produção. Detalhes em `docs/INFRA.md`.
- Cron mensal do arquivamento pendente: `0 3 1 * *` precisa ser configurado
  manualmente no Dashboard Supabase → Edge Functions → Schedules.
- Tela `/caderno-do-dia` (sub-rodada futura): substituirá o destino temporário
  `/dashboard` para notificação `bom_dia_resumo`.
- Backup Supabase Pro: confirmar manualmente no Dashboard que Daily Backups
  está ativo e considerar habilitar PITR antes do deploy.
- Lição aprendida sobre limpeza de banco: distinguir dados operacionais
  (truncáveis) de dados de seed (config, feriado — NÃO truncar).

## Status — Fase 2 concluída (2026-05-02)

A Fase 2 (frontend) está completa após CP1 a CP7 + saneamentos.

CP8 (PWA + offline-first) foi avaliado e descartado. Decisão de produto:
o sistema é um site web responsivo padrão. Operador acessa via navegador
em PC e celular sem necessidade de instalação como app. `manifest.webmanifest`
e `sw.js` (placeholder) foram removidos do repo; `index.html` perdeu as tags
`<link rel="manifest">` e `<meta name="theme-color">`; CSP perdeu a diretiva
`manifest-src`.

### Próximos passos

- Fase 3 — Excel/VBA + Apps Script (sincronia bidirecional, backup local,
  importação em massa, exportação para contação)
- Fase 4 — Integração e operação (deploy Cloudflare Pages, alias prod,
  UAT, manuais)

## Status — fim do CP7 (2026-05-02)

### Concluído (adições)

- [x] **Fase 2 — CP7: Admin e relatórios**
  - Migration: `usuario_papel.ativo` + `config.tipo`
  - `/configuracoes/usuarios` (admin) — listagem com último acesso,
    modal de promoção com confirmação por digitação ("promover"),
    auto-proteção contra remoção do próprio papel admin
  - `/configuracoes/feriados` (admin) — CRUD com filtro por ano,
    soft-delete preserva histórico para cálculos retroativos
  - `/configuracoes/sistema` (admin) — nomes amigáveis por chave,
    toggle inline para boolean, modal interativo (stepper + sugestões
    + slider) para number/time/date/text, validação client + backend
  - `/relatorios` (admin + operador) — filtros por período, categoria
    e estado, preview paginado, sumário no topo
  - Export CSV com BOM UTF-8 (Excel pt-BR sem caracteres bagunçados)
  - Export PDF lazy-loaded (jspdf + jspdf-autotable carregam só ao baixar)
  - Hub `/configuracoes` ativa cards admin reais (CP5 deixou placeholder)
  - Sidebar ganha link para `/relatorios`
  - 5 RPCs novas: `listar_usuarios_papeis`, `definir_papeis_usuario`,
    `atualizar_config`, `gerar_relatorio_periodo`, `exportar_relatorio_csv`

### Pendências CP7 (registradas)

- Trigger `trg_config_audit` removido (era pré-quebrado, assumia `id` UUID
  mas `config` usa `chave` varchar como PK). Auditoria via `atualizado_em`
  e `atualizado_por_email` é suficiente por ora.
- Papéis `supervisor` e `auditor` aceitos pelo CHECK do banco mas UI/RPC
  só expõem `admin` e `operador`. Reservados para futura expansão.
- PDF em mobile pode demorar 5-10s para >1000 linhas. Spinner cobre.
- Cache de papéis no client invalida em login/logout/user_updated mas
  não em mudança de papel feita por outro admin com sessão ativa.
  F5 corrige.

## Status — fim do CP6 (2026-05-02)

### Concluído (adições)

- [x] **Fase 2 — CP6: Fechamento e métricas**
  - `fn_recalcular_caixa` atualizado para Escola 1 + coluna auxiliar
    (cancelado_pos sai do total_valor e ganha registro próprio)
  - Migration: `caixa.total_cancelado_pos`, `valor_cancelado_pos`,
    `total_finalizado`, `valor_finalizado`, `observacao_fechamento`
  - Recálculo idempotente de todos os caixas históricos
  - `dashboard_resumo` com novos campos de auditoria
  - Tela `/caixa/:data/fechar` editorial com checklist 4 itens
  - Aviso musgo de fechamento retroativo + aviso âmbar de pendências
  - Justificativa obrigatória em retroativo (≥10 chars) e pendências (≥20 chars)
  - Banner read-only de caixa fechado com SVG cadeado outline
  - Tela `/lancamento/:id` com timeline editorial cronológica reversa
  - RPC `linha_do_tempo_lancamento` consolidando criação + observações
  - Charts CSS no Dashboard: barras horizontais por categoria + movimento 30d
  - RPCs `serie_diaria_caixa` e `distribuicao_categoria_mes`
  - Link "Ver histórico completo" no drawer (modos gerenciar/finalizado)
  - Auditoria de emojis: ✓ ✕ ○ mantidos (Unicode tipográfico),
    🔒 substituído por SVG outline

## Status — fim do CP5 (2026-05-01)

### Concluído

- [x] **Fase 0** — Estrutura do projeto, 5 docs canônicos, `.gitignore`, repo inicial
- [x] **Fase 1** — Backend Supabase
  - 23 migrations base (schema, RLS, triggers, RPCs, storage, pg_cron, seeds)
  - 4 edge functions Deno (cria_caixa_diario, disparar_notificacoes, etc.)
  - Smoke test integral 9/9 aprovado
- [x] **Fase 1B** — Refactor auth: email/senha + OTP via Resend SMTP, vault corrigido
- [x] **Fase 2 — CP1**: Login / Cadastro / Confirmar OTP / Recuperar / Redefinir
- [x] **Fase 2 — CP2**: validações inline, ajustes de UX nas telas de auth, router fechado
- [x] **Fase 2 — CP3.1–3.6**:
  - Dashboard editorial com cards de resumo + notificações realtime
  - Tela `/caixa/:data` (caixa do dia) com lista de lançamentos
  - Tela `/caixas` (arquivo cronológico de todos os caixas)
  - Modal "Adicionar NF" minimal (NF + valor + cliente opcional)
  - Drawer multi-modo (categorizar / gerenciar / finalizado)
  - Modal de novo lançamento dinâmico por categoria
- [x] **Fase 2 — CP3.7–3.13**: polimento editorial
  - Etiquetas verticais nas categorias com hover spring
  - Cabeçalho `/caixas` vira card com etiqueta lateral "ARQUIVO"
  - Logo unificado via mask-image (assets/logo.svg)
  - Pop-select e pop-data customizados (substituem popups nativos)
  - Resumo do dia refatorado com 3 blocos editoriais
- [x] **Fase 2 — CP3.14–3.15**: migração para Vite
  - Dev server com SPA fallback + cache desativado + HMR
  - Tailwind via PostCSS (não mais CDN)
  - supabase-js via npm (não mais esm.sh)
  - Statics em `web/public/` (manifest, sw, _headers, _redirects)
  - Credenciais em `.env.local` (gitignored), prefixo `VITE_*`
- [x] **Fase 2 — Saneamento pós-Vite**: porta `:5173` em docs/env, CSP estrita sem CDNs antigos, `docs/STACK.md` canônico
- [x] **Fase 2 — CP4 backend**: fluxo "em análise" no banco
  - Estados novos: `finalizado` e `cancelado_pos` (enum estado_lancamento)
  - Tabela `lancamento_observacao` imutável (triggers bloqueiam UPDATE/DELETE mesmo para `service_role`)
  - Trigger anti-mudança pós-categorização em `lancamento` (categoria/dados/numero_nf/valor_nf/cliente_nome travam)
  - 4 RPCs novas: `adicionar_observacao`, `categorizar_lancamento`, `marcar_finalizado`, `marcar_cancelado_pos`
  - `upsert_lancamento` aceita criação minimal e rejeita atualização em estado travado com mensagem útil
  - View `pendencia` inclui `completo` (sem desfecho); `dashboard_resumo` ganha 3 contagens novas
  - Realtime publication para `lancamento_observacao`
  - Frontend integrado com RPCs reais (sem mais placeholder JSON)
  - Visual `finalizado` (banner verde) e `cancelado_pos` (strikethrough) na lista
  - Script `tools/migrar_temporarios.sql` idempotente para dados ad-hoc do CP3
  - Smoke tests: backend 10/10, frontend 5/8 via SQL + 3/8 validados visualmente pelo Operador
- [x] **Fase 2 — CP5: Operação mínima viável**
  - Hub `/configuracoes` editorial com cards condicionais por papel
  - `/configuracoes/vendedoras` CRUD completo (insert/update/soft-delete)
  - `/pendencias` centralizadas com filter-bar reutilizável
  - `/perfil` (editar nome, trocar senha re-autenticada)
  - `/notificacoes` paginada
  - Componente `<filter-bar>` reusável (também aplicado em `/caixa/:data`)
  - View `pendencia` ganha `categoria` + `dados_categoria` para filtros do cliente
  - Migration: `vendedora` ganha email/telefone/observacoes
- [x] **Fase 2 — CP5-AJUSTES: Refactor sidebar + identidade visual**
  - Header horizontal substituído por sidebar lateral colapsável
  - Estado da sidebar persiste em IndexedDB (regra inviolável: zero localStorage)
  - User-menu popover editorial (substitui nav antigo) com posicionamento contextual: acima na expandida / lateral na colapsada
  - Logo: símbolo + wordmark no expandido, só símbolo no colapsado
  - Avatar: nome + email no rodapé expandido, só avatar 32px no colapsado
  - Tooltips no estado colapsado com 400ms delay e seta apontando ao ícone
  - Badge de notificações visível em ambos os estados (top-right do bell)
  - Largura expandida `--sidebar-w-expandida: 260px`
  - Hierarquia em 3 zonas (logo / nav / rodapé) com separadores `1px var(--c-papel-3)`
  - Identidade visual `border-radius: 0 X X 0` (esquerda reta, direita redonda) padronizada em:
    `.config-cabec`, `.caixas-cabec`, `.caixa-row`, `.lanc-row`, `.rd-chip`,
    `.vd-card`, `.notif-item`, `.alert`, `.toast`, `.lanc-obs-item`
  - Bug texto vertical "AJUSTES" corrigido (`writing-mode: vertical-rl` em vez de `transform translate+rotate`)
  - Bug `atualizado_em` na vendedora corrigido (renomeação da coluna `atualizada_em` → `atualizado_em` para alinhar com convenção)
  - Etiqueta vertical "EM ANÁLISE" legível (tracejado opacity 0.65 + halo papel-claro)
  - Favicon adaptativo via `prefers-color-scheme` (musgo no light, papel no dark)
  - `header.js` neutralizado (export vazio, deprecado)

### Em andamento

- [ ] **Fase 3** — Excel/VBA + Apps Script (sincronia bidirecional)
- [ ] **Fase 4** — Integração e operação (deploy Cloudflare Pages, UAT, alias prod)

### Pendências conhecidas (registradas, sem prioridade definida)

1. **`fn_recalcular_caixa`**: decisão alinhada (Escola 1 + coluna auxiliar) — `cancelado_pos` sai do `total_valor` e ganha coluna nova `total_cancelado_pos`. Sub-rodada do CP6.
2. **Triggers de auditoria/notificação**: `trg_lancamento_audit` e `trg_lancamento_notif_pendencia` tratam novos estados genericamente. Notificações específicas para `finalizado`/`cancelado_pos` ficam para evolução.
3. **Self-host de fontes**: Fraunces + Manrope ainda via Google Fonts CDN (decisão de produto — ver D5 da auditoria pós-Vite).
4. **Redirect URLs no Supabase Dashboard**: confirmar manualmente que `:8080` (porta antiga) foi removida e `:5173` (Vite) está na lista. MCP não expõe Auth config — manual no Dashboard.
5. **Ruído em `dados_categoria`**: itens migrados do CP3 ainda têm chaves `estado_final` etc. no JSON. Frontend ignora — limpar exigiria desabilitar trigger anti-mudança (privilégio indisponível em Supabase Cloud).
6. **`web/components/header.js`**: stub vazio para não quebrar imports legados. Deletar em rodada de polimento futura quando grep confirmar 0 referências.
7. **Bell drawer descontinuado**: o popover antigo do sino (com últimas 20 notificações) saiu junto com o refactor da sidebar. Click no item "Notificações" da sidebar leva direto a `/notificacoes` (tela paginada). Atalho `Alt+N` foi removido junto.
8. **Tela `/caderno-do-dia` (sub-rodada futura)**: tela editorial agrupando caixas em aberto + suas pendências, acessível via sidebar e via click em notificação `bom_dia_resumo`. Hoje a notificação roteia pra `/dashboard` como solução temporária (TODO no `web/app/notificacao-router.js`).
9. **DSN do Sentry pendente** (CP-PRE-DEPLOY-1): `VITE_SENTRY_DSN` precisa ser setado em `.env.production` antes do deploy. Sem isso, `Sentry.init()` é pulado e erros viram só `console.error`. Setup completo em `docs/INFRA.md`.
10. **Cron mensal do arquivamento pendente** (CP-PRE-DEPLOY-1): edge function `arquivar-mensal` precisa de cron `0 3 1 * *` configurado manualmente no Dashboard Supabase → Edge Functions → Schedules. Sem isso, RPC `arquivar_antigos` não roda automaticamente.
11. **Lição aprendida sobre limpeza de banco** (CP-PRE-DEPLOY-1, 2026-05-02): durante teste de "sistema limpo", o TRUNCATE pegou também a tabela `config` (que é seed, não dado operacional) e o app quebrou — `/configuracoes/sistema` ficou vazio, RPCs que leem chaves passaram a falhar. Restaurado via migration `20260502150000_restore_seeds_pos_limpeza.sql` (idempotente, ON CONFLICT DO NOTHING). **Para resets futuros, distinguir três categorias:**
    - **Dados operacionais** (`lancamento`, `caixa`, `lancamento_observacao`, `notificacao`, `audit_log`) → OK truncar pra começar do zero.
    - **Dados de seed** (`config`, `feriado`) → NÃO truncar; são parte do "esqueleto" do sistema. Sem eles, partes da UI quebram silenciosamente.
    - **Dados de identidade** (`usuario_papel`, `auth.users`, `vendedora`) → só truncar se explicitamente parte do reset de acesso.

## Como rodar

Comandos canônicos em `docs/STACK.md`. Resumo:

```bash
npm install
cp .env.example .env.local   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173/
npm run build                # /dist (~94 KB gzip)
npm run preview              # http://localhost:4173 (com CSP)
```

## Histórico de merges na main

```
f122c71  [F3-RBAC-4] merge: Sessao 4 do RBAC granular
         (5 RPCs CRUD perfis + tela /configuracoes/permissoes
          com drawer agrupado + modais de confirmacao e delete)
f2b30de  [F3-RBAC-3] merge: Sessao 3 do RBAC granular
         (papeis.js refator com cache + 7 call sites migrados pra
          temPermissaoSync + remove backward-compat super_admin)
fbe2ffb  [F3-RBAC-2] merge: Sessao 2 do RBAC + FIX super_admin
         (5 RPCs migradas pra tem_permissao + lancamento.revelar_pii
          ao catalogo + workaround preserva super_admin)
0d4bf07  [F3-RBAC-1] merge: Sessao 1 do RBAC granular
         (5 tabelas + 38 permissoes + 5 perfis + tem_permissao()
          com bypass super_admin + RLS + papeis.js backward-compat)
15a875e  [F3-FIX] merge: redefinir senha via OTP em vez de link
         (causa raiz PKCE+click-tracking; refator recuperar.js+
          redefinir.js, recovery.html usa {{ .Token }}, main.js
          defesa contra error=otp_expired)
802dbec  [F3-RESET] merge: reset operacional + flag primeiro-admin
         (apaga users + identidade + operacionais, mantem seeds;
          trigger trg_primeiro_admin em auth.users)
1fa699b  [F3-DL-3] merge: app como servico Windows nativo via NSSM
         (instalar-servico-windows.bat substitui PM2 por NSSM 2.24,
          Session 0 invisivel, restart automatico em crash)
445cfb7  [F3-DL-2-FIX] merge: instalador .bat em ASCII puro
         (em-dash e box-drawing trocados por ASCII; cmd.exe lia
          UTF-8 no codepage nativo e quebrava nos primeiros bytes)
67a8917  [F3-DL-2] merge: instalador empacotado para PC Windows
         (orquestrador + 9 etapas .bat + README, PM2 + cloudflared,
          download dinamico via PowerShell, idempotencia total)
30e1033  [F3-DL] merge: configuracao para deploy local com Cloudflare Tunnel
         (CSP+Sentry, npm start:local, infra/tunnel/config.yml,
          docs/DEPLOY_LOCAL.md, INFRA documentado)
d3fdc95  [F3-PRE-2] merge: emails customizados pt-BR com identidade editorial
         (3 templates HTML em supabase/email-templates/,
          subjects editoriais aplicados no Dashboard)
c33edb5  [F3-PRE-1] merge: bugs criticos e infra de producao
         (engloba CP-PRE-DEPLOY-1 + hotfix seeds: F5, 404,
          retry, Sentry, retencao, notificacao-router)
4665a3a  [F2-CP7] merge: admin e relatorios
         (engloba CP7 + CP7-FIX: telas admin /usuarios /feriados
          /sistema, relatorios com export CSV/PDF, RPCs novas)
8a2cd99  [F2-CP6] merge: fechamento e metricas
         (engloba CP6 + CP6-FIX: fn_recalcular_caixa Escola 1, tela de
          fechamento, justificativas, /lancamento/:id, charts CSS)
6a11814  [F2-CP5] merge: operacao minima viavel + ajustes pos-CP5
         (engloba CP5 + CP5-AJUSTES + CP5-FIX: telas de operação,
          refactor sidebar, identidade flat-left/round-right)
c9aa7f6  [F2BACK] merge: fluxo em analise + observacoes imutaveis + estados finais
         (engloba toda Fase 2: CP1, CP2, CP3.x, saneamento Vite e CP4 backend)
e69abca  Merge: fase-1b refactor auth (email + senha + OTP via Resend)
146cb31  Merge: hotfix Vault (migration 187 cloud-compatible)
87eb3e4  Merge: Fase 1 (backend Supabase) concluida
```

Branches `fase-2-cp5-operacao-minima` e `fase-2-cp5-ajustes` foram criadas como working branches sequenciais (a segunda cortada da primeira) e absorvidas pela linha principal — `fase-2-cp5-ajustes` carregou os 25 commits granulares do CP5 + CP5-AJUSTES + CP5-FIX e foi consumida no merge `6a11814`.
