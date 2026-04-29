# PROMPT 04 — FRONTEND WEB: MICRO-SITE OPERACIONAL

> **Pré-requisitos de leitura:**
> - `01_VISAO_GERAL_E_REGRAS_DE_NEGOCIO.md` — regras visuais e de negócio.
> - `03_BACKEND_SUPABASE_DATABASE.md` — RPCs e schema.
>
> Este arquivo descreve o **micro-site web** que o Operador usa em paralelo ao Excel. Premissa central: **PC do trabalho é lento**. A web app usa **HTML + JS vanilla + Tailwind CSS via CDN**, **sem build, sem framework, sem bundler**. Tudo carrega direto do navegador.

---

## SUMÁRIO

1. Princípios de design e restrições
2. Stack técnica
3. Estrutura de arquivos
4. Roteamento (sem framework)
5. Tela de login (SSO)
6. Tela Dashboard
7. Tela Caixa do dia (visão única)
8. Modal "Novo lançamento"
9. Tela Pendências (centralizada)
10. Tela Configurações
11. Componentes reutilizáveis
12. Sistema de cores e CSS
13. Camada de dados — supabase-js
14. State management (sem Redux)
15. Realtime e atualização viva
16. Notificações em browser
17. Modo offline (cache-first)
18. Acessibilidade (WCAG AA)
19. Performance — alvo PC lento
20. Internacionalização
21. Testes funcionais (Playwright)
22. Apêndice J — Wireframes textuais
23. Apêndice K — Listagem completa do `index.html`

---

## 1. PRINCÍPIOS DE DESIGN E RESTRIÇÕES

### 1.1. O que **não** vamos fazer

- Não usar React, Vue, Angular, Svelte, ou qualquer framework com build step.
- Não usar Vite, Webpack, esbuild, ou qualquer bundler.
- Não usar TypeScript que precise compilar (apenas JSDoc para tipagem inline).
- Não fazer SSR. É uma SPA estática hospedada em CDN.
- Não consumir bibliotecas de gráficos pesadas (Chart.js está OK por ser ~150kb gzip; Plotly e D3 são pesados demais).

### 1.2. O que **vamos** fazer

- HTML semântico ESM nativo (`<script type="module">`).
- Tailwind via CDN (`https://cdn.tailwindcss.com`) com config inline.
- Supabase JS client via ESM CDN: `https://esm.sh/@supabase/supabase-js@2`.
- Web Components nativos para reuso (`customElements.define(...)`).
- IndexedDB para cache offline (Dexie via CDN se necessário).
- Service Worker para PWA básico (cache de shell).
- LocalStorage apenas para preferências e tokens auth (Supabase já gerencia).

### 1.3. Por que assim

PC lento + permissão restrita para instalar = nada de toolchain local. Tudo precisa funcionar abrindo um `index.html` via servidor estático (CDN ou Cloudflare Pages). Bundles devem ficar abaixo de **300 KB total transferido** no primeiro load.

---

## 2. STACK TÉCNICA

| Camada | Tecnologia | URL CDN |
|--------|-----------|---------|
| HTML | HTML5 estático | — |
| CSS | Tailwind CSS Play CDN | `https://cdn.tailwindcss.com` |
| JS runtime | ES2022 nativo + módulos | — |
| Backend client | supabase-js v2 | `https://esm.sh/@supabase/supabase-js@2` |
| Roteamento | History API + handler simples | (próprio) |
| Gráficos | Chart.js v4 | `https://cdn.jsdelivr.net/npm/chart.js@4.4.1` |
| Ícones | Heroicons como SVG inline | (próprio) |
| Storage local | IndexedDB nativo + Dexie 4 | `https://unpkg.com/dexie@4` |
| PWA | Service Worker + Web App Manifest | (próprio) |

---

## 3. ESTRUTURA DE ARQUIVOS

```
frontend/
├── index.html                 # Shell da aplicação
├── manifest.webmanifest       # PWA manifest
├── sw.js                      # Service Worker
├── app/
│   ├── main.js                # Entry point
│   ├── router.js              # Roteamento mínimo
│   ├── store.js               # State management
│   ├── supabase.js            # Cliente Supabase configurado
│   ├── auth.js                # Helpers SSO
│   ├── i18n.js                # Strings pt-BR
│   ├── utils.js               # Utilities (formatadores, etc.)
│   ├── notifications.js       # Sistema de toasts e bell
│   ├── offline.js             # Fila offline + reconciliação
│   └── pages/
│       ├── login.js
│       ├── dashboard.js
│       ├── caixa.js
│       ├── pendencias.js
│       └── config.js
├── components/
│   ├── tab-bar.js             # Web Component
│   ├── entry-form.js
│   ├── entry-row.js
│   ├── filter-bar.js
│   ├── notification-bell.js
│   ├── modal.js
│   ├── stat-card.js
│   └── icon.js
├── styles/
│   ├── tokens.css             # Variáveis CSS (cores)
│   ├── components.css         # Classes específicas
│   └── print.css              # Estilo de impressão
└── assets/
    ├── icons/                  # Ícones de categoria
    └── img/                    # Logo, etc.
```

> Para deploy estático, publicar o conteúdo de `frontend/` em Cloudflare Pages, Netlify ou Vercel free tier.

---

## 4. ROTEAMENTO (SEM FRAMEWORK)

### 4.1. Convenção de URLs

| URL | Tela |
|-----|------|
| `/` | redireciona para `/dashboard` se autenticado, senão `/login` |
| `/login` | Tela SSO |
| `/dashboard` | Visão consolidada |
| `/caixa/:data` | Caixa específico (data ISO `YYYY-MM-DD` ou alias `hoje`) |
| `/pendencias` | Lista centralizada |
| `/config` | Configurações |

### 4.2. Implementação `router.js`

```javascript
// app/router.js
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCaixa } from './pages/caixa.js';
import { renderPendencias } from './pages/pendencias.js';
import { renderConfig } from './pages/config.js';
import { getSession } from './auth.js';

const routes = [
  { pattern: /^\/$/,                    handler: () => navegar('/dashboard') },
  { pattern: /^\/login$/,               handler: renderLogin,                    aberto: true },
  { pattern: /^\/dashboard$/,           handler: renderDashboard },
  { pattern: /^\/caixa\/([\w-]+)$/,     handler: (m) => renderCaixa(m[1]) },
  { pattern: /^\/pendencias$/,          handler: renderPendencias },
  { pattern: /^\/config$/,              handler: renderConfig },
];

export async function navegar(url) {
  history.pushState({}, '', url);
  await despachar();
}

export async function despachar() {
  const url = location.pathname;
  const sessao = await getSession();
  
  for (const rota of routes) {
    const m = url.match(rota.pattern);
    if (m) {
      if (!sessao && !rota.aberto) {
        return navegar('/login');
      }
      return rota.handler(m);
    }
  }
  
  document.querySelector('#app').innerHTML = `
    <div class="p-8 text-center">
      <h1 class="text-2xl">Página não encontrada</h1>
      <a href="/dashboard" class="text-blue-600 underline">Voltar ao dashboard</a>
    </div>
  `;
}

window.addEventListener('popstate', despachar);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a) {
    e.preventDefault();
    navegar(a.getAttribute('href'));
  }
});
```

### 4.3. Inicialização

```javascript
// app/main.js
import { despachar } from './router.js';
import { iniciarRealtime } from './supabase.js';
import { registrarServiceWorker } from './offline.js';

async function init() {
  registrarServiceWorker();
  await despachar();
  iniciarRealtime();
}

init();
```

---

## 5. TELA DE LOGIN (SSO)

### 5.1. Layout

```
╔══════════════════════════════════════╗
║                                      ║
║         [Logo da empresa]            ║
║                                      ║
║      Controle de Caixa               ║
║   Sistema de auditoria interno       ║
║                                      ║
║                                      ║
║   [ Entrar com SSO da empresa ]      ║
║                                      ║
║                                      ║
║   Versão 1.0 — Suporte: TI           ║
╚══════════════════════════════════════╝
```

### 5.2. `pages/login.js`

```javascript
import { supabase } from '../supabase.js';

export function renderLogin() {
  document.querySelector('#app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-10 max-w-md w-full">
        <div class="text-center mb-8">
          <img src="/assets/img/logo.png" alt="Logo" class="h-16 mx-auto mb-4" />
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">Controle de Caixa</h1>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">Sistema de auditoria interno</p>
        </div>
        
        <button id="btn-sso" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.25 21h-7.5..." />
          </svg>
          Entrar com SSO da empresa
        </button>
        
        <p class="text-xs text-slate-500 mt-6 text-center">
          Versão 1.0 — Suporte: TI
        </p>
      </div>
    </div>
  `;
  
  document.querySelector('#btn-sso').addEventListener('click', async () => {
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: 'empresa.com'
    });
    if (error) {
      alert('Erro ao iniciar SSO: ' + error.message);
      return;
    }
    if (data?.url) location.href = data.url;
  });
}
```

### 5.3. Callback SSO

A URL `/auth/callback` é tratada pelo Supabase automaticamente; após o redirect, recarregar `/` e o `despachar()` envia para `/dashboard`.

---

## 6. TELA DASHBOARD

### 6.1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [☰] Controle de Caixa            [🔔 3]  [👤 Operador ▾]   │
├─────────────────────────────────────────────────────────────┤
│  📊 Dashboard | 📅 Caixas | ⏰ Pendências | ⚙️ Config       │
├─────────────────────────────────────────────────────────────┤
│ Bom dia, Operador! 28/04/2026                               │
│                                                             │
│ ┌─────────┬─────────┬─────────┬───────────────┐             │
│ │ NFs     │ Pend.   │ Cancel. │ Valor líquido │             │
│ │  1.234  │   12    │   34    │ R$ 482.150    │             │
│ └─────────┴─────────┴─────────┴───────────────┘             │
│                                                             │
│ ┌────────────────────┐ ┌────────────────────┐               │
│ │ Por categoria      │ │ Série diária 30d   │               │
│ │   (donut chart)    │ │  (bar chart)       │               │
│ └────────────────────┘ └────────────────────┘               │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Pendências mais antigas                                 │ │
│ │ NF      Cliente        Idade  Valor      Ação           │ │
│ │ 12345   ABC Ltda       7d    R$ 250,00  [Resolver]     │ │
│ │ 12346   XYZ Comércio   5d    R$ 180,00  [Resolver]     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2. `pages/dashboard.js`

```javascript
import { supabase } from '../supabase.js';
import { layoutBase } from '../layout.js';
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm';
import { CORES } from '../tokens.js';

export async function renderDashboard() {
  document.querySelector('#app').innerHTML = layoutBase('dashboard', `
    <div class="p-6 max-w-6xl mx-auto">
      <h1 class="text-2xl font-semibold mb-6 dark:text-slate-100">
        Bom dia, <span id="user-name">...</span>!
        <span class="text-base font-normal text-slate-500 ml-2" id="hoje"></span>
      </h1>
      
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8" id="stat-cards">
        <stat-card id="stat-nfs" label="Total NFs"></stat-card>
        <stat-card id="stat-pend" label="Pendências" tone="amber"></stat-card>
        <stat-card id="stat-canc" label="Cancelados" tone="red"></stat-card>
        <stat-card id="stat-val" label="Valor líquido" tone="emerald"></stat-card>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="bg-white dark:bg-slate-800 p-5 rounded-xl shadow">
          <h2 class="text-lg font-semibold mb-3 dark:text-slate-100">Por categoria</h2>
          <canvas id="chart-cat" height="240"></canvas>
        </div>
        <div class="bg-white dark:bg-slate-800 p-5 rounded-xl shadow">
          <h2 class="text-lg font-semibold mb-3 dark:text-slate-100">Série diária — últimos 30 dias úteis</h2>
          <canvas id="chart-dia" height="240"></canvas>
        </div>
      </div>
      
      <div class="bg-white dark:bg-slate-800 p-5 rounded-xl shadow">
        <h2 class="text-lg font-semibold mb-3 dark:text-slate-100">Pendências mais antigas</h2>
        <table class="w-full text-sm">
          <thead class="text-slate-500 dark:text-slate-400">
            <tr><th class="text-left py-2">NF</th><th class="text-left">Cliente</th><th>Idade</th><th class="text-right">Valor</th><th></th></tr>
          </thead>
          <tbody id="tabela-pendencias-top"></tbody>
        </table>
      </div>
    </div>
  `);
  
  // Carrega dados
  const sessao = await supabase.auth.getSession();
  document.querySelector('#user-name').textContent = sessao.data.session?.user.user_metadata?.full_name?.split(' ')[0] ?? 'Operador';
  document.querySelector('#hoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  
  const { data: resumo, error } = await supabase.rpc('dashboard_resumo');
  if (error) { console.error(error); return; }
  
  const r = resumo[0];
  document.querySelector('#stat-nfs').setAttribute('value', r.total_lancamentos);
  document.querySelector('#stat-pend').setAttribute('value', r.total_pendentes);
  document.querySelector('#stat-canc').setAttribute('value', r.total_cancelados);
  document.querySelector('#stat-val').setAttribute('value', formatBRL(r.valor_liquido));
  
  // Donut por categoria
  const labels = Object.keys(r.por_categoria);
  const valores = Object.values(r.por_categoria);
  new Chart(document.querySelector('#chart-cat'), {
    type: 'doughnut',
    data: {
      labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1).replace('_', ' ')),
      datasets: [{
        data: valores,
        backgroundColor: labels.map(l => CORES[l]?.bg || '#cbd5e1'),
        borderColor: labels.map(l => CORES[l]?.border || '#64748b'),
        borderWidth: 2
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'right' } } }
  });
  
  // Barras série diária
  const dias = r.por_dia;
  new Chart(document.querySelector('#chart-dia'), {
    type: 'bar',
    data: {
      labels: dias.map(d => new Date(d.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
      datasets: [{
        label: 'Lançamentos',
        data: dias.map(d => d.total),
        backgroundColor: '#3B82F6'
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
  
  // Top pendências
  const { data: pend } = await supabase.from('pendencia').select('*').order('idade_dias_uteis', { ascending: false }).limit(5);
  const tbody = document.querySelector('#tabela-pendencias-top');
  tbody.innerHTML = (pend ?? []).map(p => `
    <tr class="border-t border-slate-200 dark:border-slate-700">
      <td class="py-2 font-mono">${p.numero_nf}</td>
      <td>${p.cliente_nome}</td>
      <td class="text-center"><span class="badge ${p.severidade}">${p.idade_dias_uteis}d</span></td>
      <td class="text-right font-mono">${formatBRL(p.valor_nf)}</td>
      <td class="text-right"><a href="/caixa/${p.data_caixa}" data-link class="text-blue-600 hover:underline">→ Resolver</a></td>
    </tr>
  `).join('');
}

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}
```

---

## 7. TELA CAIXA DO DIA

### 7.1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [TabBar de caixas: ◂ 26/04 27/04 [28/04●] +]                │
├─────────────────────────────────────────────────────────────┤
│ Caixa 28/04/2026  [aberto]   Total: R$ 12.450  Pendências: 3│
│                                                             │
│ [+ Novo lançamento]  [⋯ Mais ações]  [🔍 filtros: todas ▾] │
├─────────────────────────────────────────────────────────────┤
│ # | Hora  | NF    | Pedido | Cliente | Valor   | Cat | Det │
│ 1 | 09:30 | 12345 | PED1   | ABC Ltda| 250,00  | 🟦  | ... │
│ 2 | 10:15 | 12346 | PED2   | XYZ     | 180,00  | 🟢  | ... │
│ 3 | 10:45 | 12347 | PED3   | DEF     | 95,00   | 🟢  | ... │
│ 4 | 11:00 | 12348 | PED4   | GHI     | 320,00  | ⏳  | ... │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### 7.2. `pages/caixa.js`

```javascript
import { supabase } from '../supabase.js';
import { layoutBase } from '../layout.js';
import { abrirModalNovoLancamento, abrirModalResolverPendencia } from './modais.js';
import { CORES, NOMES_CATEGORIA } from '../tokens.js';

export async function renderCaixa(dataParam) {
  const data = dataParam === 'hoje' ? new Date().toISOString().slice(0,10) : dataParam;
  
  document.querySelector('#app').innerHTML = layoutBase('caixas', `
    <div class="max-w-7xl mx-auto p-4">
      <tab-bar id="tab-bar" data-ativo="${data}"></tab-bar>
      
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow mt-2">
        <header class="flex items-center justify-between p-4 border-b dark:border-slate-700">
          <div>
            <h1 class="text-xl font-semibold dark:text-slate-100" id="caixa-titulo"></h1>
            <p class="text-sm text-slate-500 dark:text-slate-400" id="caixa-stats"></p>
          </div>
          <div class="flex gap-2">
            <button id="btn-novo" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">+ Novo lançamento</button>
            <button id="btn-fechar" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">Fechar caixa</button>
          </div>
        </header>
        
        <filter-bar id="filter-bar"></filter-bar>
        
        <div class="overflow-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              <tr>
                <th class="text-left py-2 px-3">#</th>
                <th class="text-left">Hora</th>
                <th class="text-left">NF</th>
                <th class="text-left">Pedido</th>
                <th class="text-left">Cliente</th>
                <th class="text-right">Valor</th>
                <th class="text-center">Categoria</th>
                <th class="text-left">Detalhes</th>
                <th class="text-center">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="lancamentos-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `);
  
  // Carrega caixa
  const { data: caixa } = await supabase.from('caixa').select('*').eq('data', data).single();
  if (!caixa) {
    document.querySelector('#caixa-titulo').textContent = `Caixa de ${formatDate(data)} ainda não existe`;
    return;
  }
  
  document.querySelector('#caixa-titulo').textContent = caixa.nome_aba_web;
  document.querySelector('#caixa-stats').innerHTML = `
    <span class="badge ${caixa.estado}">${NOMES_ESTADO[caixa.estado]}</span>
    Total: <span class="font-mono">${formatBRL(caixa.total_valor)}</span> · 
    Pendências: <span class="font-mono">${caixa.total_pendentes}</span>
  `;
  
  // Carrega lançamentos
  const { data: lancamentos } = await supabase
    .from('lancamento')
    .select('*')
    .eq('caixa_id', caixa.id)
    .neq('estado', 'excluido')
    .order('criado_em', { ascending: true });
  
  renderLancamentos(lancamentos ?? []);
  
  // Botão novo lançamento
  document.querySelector('#btn-novo').addEventListener('click', () => {
    abrirModalNovoLancamento(caixa.id, () => location.reload());
  });
  
  // Realtime
  supabase
    .channel(`caixa-${caixa.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'lancamento',
      filter: `caixa_id=eq.${caixa.id}`
    }, payload => {
      // Recarrega tabela
      renderCaixa(data);
    })
    .subscribe();
}

function renderLancamentos(lista) {
  const tbody = document.querySelector('#lancamentos-tbody');
  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="10" class="p-12 text-center text-slate-500 dark:text-slate-400">
        Nenhum lançamento ainda neste caixa. Comece criando o primeiro.
      </td></tr>
    `;
    return;
  }
  
  tbody.innerHTML = lista.map((l, i) => {
    const corClass = l.categoria ? `cat-${l.categoria}` : 'cat-pendente';
    const resClass = l.estado === 'resolvido' ? 'is-resolvida' : '';
    const atrasada = l.estado === 'pendente' && diasUteisDesde(l.criado_em) > 3 ? 'is-atrasada' : '';
    
    return `
      <tr class="entry-row ${corClass} ${resClass} ${atrasada}" data-id="${l.id}">
        <td class="py-2 px-3 text-slate-500">${i + 1}</td>
        <td class="font-mono text-slate-600">${formatHora(l.criado_em)}</td>
        <td class="font-mono">${l.numero_nf}</td>
        <td class="font-mono text-slate-500">${l.codigo_pedido}</td>
        <td>${l.cliente_nome}</td>
        <td class="text-right font-mono">${formatBRL(l.valor_nf)}</td>
        <td class="text-center">
          ${l.categoria ? `<span class="badge-cat">${NOMES_CATEGORIA[l.categoria]}</span>` : `<span class="badge-cat pendente">— pendente</span>`}
        </td>
        <td class="text-xs text-slate-600">${formatDetalhes(l.categoria, l.dados_categoria)}</td>
        <td class="text-center">${NOMES_ESTADO[l.estado]}</td>
        <td><button data-acao="editar" class="text-blue-600 hover:underline text-xs">Editar</button></td>
      </tr>
    `;
  }).join('');
  
  tbody.querySelectorAll('button[data-acao="editar"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const lanc = lista.find(x => x.id === id);
      if (lanc.estado === 'pendente' || lanc.estado === 'em_preenchimento') {
        abrirModalResolverPendencia(lanc, () => location.reload());
      } else {
        abrirModalEditarLancamento(lanc, () => location.reload());
      }
    });
  });
}

function formatDetalhes(cat, d) {
  if (!cat) return '—';
  switch (cat) {
    case 'cartao':
      return `${d.bandeira} ${d.modalidade} · ${d.parcelas}x · ****${d.ultimos_4_digitos ?? '----'}`;
    case 'pix':
      return `${d.comprovante_id_externo} · ${maskChave(d.chave_recebedora)}`;
    case 'dinheiro':
      return `${d.vendedora_nome_cache} · troco ${formatBRL(d.troco)}`;
    case 'cancelado':
      return `${d.motivo_cancelamento.slice(0, 40)}...`;
    case 'cartao_link':
      return `[${d.status_link}] ${(d.link_url ?? '').slice(0, 30)}...`;
    case 'obs':
      return `${d.tipo_obs}: ${d.descricao.slice(0, 30)}...`;
  }
}

function maskChave(c) {
  if (!c) return '';
  if (c.includes('@')) return c[0] + '***' + c.slice(c.indexOf('@'));
  return '***' + c.slice(-4);
}
```

---

## 8. MODAL "NOVO LANÇAMENTO"

### 8.1. Comportamento dinâmico

Conforme o usuário escolhe a categoria, os campos abaixo **mudam visualmente** — sem reload, sem perder dados já digitados de campos comuns (NF, pedido, cliente, valor).

### 8.2. `components/entry-form.js` (Web Component)

```javascript
const TEMPLATE = `
<form id="entry-form" class="space-y-4">
  <div class="grid grid-cols-2 gap-4">
    <label>
      <span class="text-sm text-slate-600 dark:text-slate-300">Número da NF *</span>
      <input name="numero_nf" required maxlength="15" class="input" />
    </label>
    <label>
      <span class="text-sm text-slate-600 dark:text-slate-300">Código do pedido *</span>
      <input name="codigo_pedido" required maxlength="20" class="input" />
    </label>
    <label class="col-span-2">
      <span class="text-sm text-slate-600 dark:text-slate-300">Cliente / Revendedora *</span>
      <input name="cliente_nome" required class="input" />
    </label>
    <label>
      <span class="text-sm text-slate-600 dark:text-slate-300">Valor da NF (R$) *</span>
      <input name="valor_nf" type="number" step="0.01" min="0.01" required class="input" />
    </label>
    <label>
      <span class="text-sm text-slate-600 dark:text-slate-300">Categoria *</span>
      <select name="categoria" id="select-cat" required class="input">
        <option value="">— selecione —</option>
        <option value="cartao">Cartão</option>
        <option value="pix">Pix</option>
        <option value="dinheiro">Dinheiro</option>
        <option value="cancelado">Cancelado</option>
        <option value="cartao_link">Cartão Link</option>
        <option value="obs">Obs / Outros</option>
      </select>
    </label>
  </div>
  
  <fieldset id="fieldset-detalhes" class="border-t pt-4 mt-4 space-y-3">
    <legend class="text-sm font-semibold text-slate-700 dark:text-slate-300">Detalhes da categoria</legend>
    <div id="detalhes-container" class="text-sm text-slate-500">
      Selecione uma categoria para ver os campos específicos.
    </div>
  </fieldset>
  
  <div class="flex justify-end gap-2 pt-4 border-t">
    <button type="button" data-acao="cancelar" class="btn-ghost">Cancelar</button>
    <button type="submit" class="btn-primary">Salvar</button>
  </div>
</form>
`;

const CAMPOS_POR_CATEGORIA = {
  cartao: [
    { name: 'codigo_autorizacao', label: 'Código de autorização', type: 'text', required: true, minLength: 4 },
    { name: 'bandeira', label: 'Bandeira', type: 'select', required: true, options: ['Visa','Mastercard','Elo','Hipercard','Amex','Outros'] },
    { name: 'modalidade', label: 'Modalidade', type: 'select', required: true, options: ['Crédito','Débito'] },
    { name: 'parcelas', label: 'Parcelas', type: 'number', required: true, min: 1, max: 24 },
    { name: 'ultimos_4_digitos', label: 'Últimos 4 dígitos', type: 'text', maxLength: 4 }
  ],
  pix: [
    { name: 'comprovante_id_externo', label: 'ID do comprovante (NF)', type: 'text', required: true },
    { name: 'chave_recebedora', label: 'Chave recebedora', type: 'text', required: true },
    { name: 'data_hora_pix', label: 'Data/hora do Pix', type: 'datetime-local', required: true },
    { name: 'nome_remetente', label: 'Nome do remetente', type: 'text' },
    { name: 'valor_recebido', label: 'Valor recebido (se diferente)', type: 'number', step: 0.01 }
  ],
  dinheiro: [
    { name: 'vendedora_id', label: 'Vendedora que recebeu', type: 'select-vendedora', required: true },
    { name: 'valor_recebido', label: 'Valor recebido (R$)', type: 'number', required: true, step: 0.01 },
    { name: 'observacao_caixa', label: 'Observação', type: 'textarea' }
  ],
  cancelado: [
    { name: 'motivo_cancelamento', label: 'Motivo do cancelamento', type: 'textarea', required: true, minLength: 10 },
    { name: 'cancelado_por', label: 'Cancelado por', type: 'text', required: true },
    { name: 'data_cancelamento', label: 'Data do cancelamento', type: 'date', required: true },
    { name: 'numero_estorno', label: 'Nº do estorno (opcional)', type: 'text' }
  ],
  cartao_link: [
    { name: 'link_url', label: 'URL do link', type: 'url', required: true, pattern: '^https://.+' },
    { name: 'codigo_autorizacao', label: 'Código de autorização (quando pago)', type: 'text' },
    { name: 'status_link', label: 'Status do link', type: 'select', required: true, options: ['Enviado','Pago','Expirado','Cancelado'] },
    { name: 'data_envio_link', label: 'Data de envio', type: 'datetime-local', required: true },
    { name: 'data_pagamento_link', label: 'Data de pagamento (se pago)', type: 'datetime-local' }
  ],
  obs: [
    { name: 'tipo_obs', label: 'Tipo', type: 'select', required: true, options: ['Troca','Cortesia','Erro','Devolução','NF Perdida','Pix Conta Errada','Outro'] },
    { name: 'descricao', label: 'Descrição (mín. 20 chars)', type: 'textarea', required: true, minLength: 20 },
    { name: 'acao_pendente', label: 'Ainda há ação pendente?', type: 'checkbox' },
    { name: 'responsavel', label: 'Responsável', type: 'text' }
  ]
};

class EntryForm extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;
    
    this.querySelector('#select-cat').addEventListener('change', e => {
      this.renderizarDetalhes(e.target.value);
    });
    
    // Autocomplete cliente via cliente_cache
    const inpPedido = this.querySelector('input[name="codigo_pedido"]');
    inpPedido.addEventListener('blur', async () => {
      const codigo = inpPedido.value.trim();
      if (!codigo) return;
      const { data } = await window.supabase.from('cliente_cache').select('*').eq('codigo_pedido', codigo).single();
      if (data) {
        this.querySelector('input[name="cliente_nome"]').value ||= data.cliente_nome;
        this.querySelector('input[name="valor_nf"]').value ||= data.valor_nf_ultimo;
      }
    });
    
    this.querySelector('form').addEventListener('submit', this.handleSubmit.bind(this));
  }
  
  renderizarDetalhes(categoria) {
    const container = this.querySelector('#detalhes-container');
    if (!categoria) {
      container.innerHTML = 'Selecione uma categoria para ver os campos específicos.';
      return;
    }
    const campos = CAMPOS_POR_CATEGORIA[categoria];
    container.innerHTML = '<div class="grid grid-cols-2 gap-4">' + campos.map(c => this.htmlCampo(c)).join('') + '</div>';
  }
  
  htmlCampo(c) {
    const lbl = `<span class="text-sm text-slate-600 dark:text-slate-300">${c.label}${c.required ? ' *' : ''}</span>`;
    const attrs = `name="${c.name}"${c.required?' required':''}${c.minLength?` minlength="${c.minLength}"`:''}${c.maxLength?` maxlength="${c.maxLength}"`:''}${c.min?` min="${c.min}"`:''}${c.max?` max="${c.max}"`:''}${c.step?` step="${c.step}"`:''}${c.pattern?` pattern="${c.pattern}"`:''}`;
    
    let inp;
    if (c.type === 'select') {
      inp = `<select ${attrs} class="input"><option value="">—</option>${c.options.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else if (c.type === 'select-vendedora') {
      inp = `<select ${attrs} class="input vendedoras-select"><option value="">— selecione —</option></select>`;
    } else if (c.type === 'textarea') {
      inp = `<textarea ${attrs} rows="2" class="input"></textarea>`;
    } else if (c.type === 'checkbox') {
      inp = `<input type="checkbox" ${attrs} />`;
    } else {
      inp = `<input type="${c.type}" ${attrs} class="input" />`;
    }
    
    const span = c.type === 'textarea' ? 'col-span-2' : '';
    return `<label class="${span}">${lbl}${inp}</label>`;
  }
  
  async handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    
    const dadosCategoria = {};
    const camposCat = CAMPOS_POR_CATEGORIA[data.categoria] ?? [];
    for (const c of camposCat) {
      if (data[c.name] != null && data[c.name] !== '') {
        dadosCategoria[c.name] = data[c.name];
      }
    }
    
    const payload = {
      caixa_id: this.dataset.caixaId,
      numero_nf: data.numero_nf,
      codigo_pedido: data.codigo_pedido,
      cliente_nome: data.cliente_nome,
      valor_nf: parseFloat(data.valor_nf),
      categoria: data.categoria,
      estado: 'completo',
      dados_categoria: dadosCategoria,
      criado_por: (await window.supabase.auth.getUser()).data.user.id,
      atualizado_por: (await window.supabase.auth.getUser()).data.user.id
    };
    
    const { error } = await window.supabase.from('lancamento').insert(payload);
    if (error) {
      alert('Erro: ' + error.message);
      return;
    }
    
    this.dispatchEvent(new CustomEvent('saved', { bubbles: true }));
  }
}

customElements.define('entry-form', EntryForm);
```

### 8.3. Carregamento das vendedoras no select

```javascript
async function popularSelectVendedoras() {
  const { data } = await supabase.from('vendedora').select('id, nome').eq('ativa', true).order('nome');
  document.querySelectorAll('.vendedoras-select').forEach(sel => {
    sel.innerHTML = '<option value="">— selecione —</option>' + data.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
  });
}
```

---

## 9. TELA PENDÊNCIAS (CENTRALIZADA)

### 9.1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Pendências em aberto (12)                                   │
│                                                             │
│ Filtros: [Severidade ▾] [Caixa ▾] [Buscar NF...]           │
├─────────────────────────────────────────────────────────────┤
│ 🔴 URGENTE  20/04 NF 12340  ABC Ltda    R$ 250  [Resolver] │
│ 🔴 URGENTE  21/04 NF 12341  XYZ         R$ 180  [Resolver] │
│ 🟡 Aviso    25/04 NF 12345  DEF         R$ 320  [Resolver] │
│ 🟢 Recente  28/04 NF 12350  GHI         R$ 95   [Resolver] │
└─────────────────────────────────────────────────────────────┘
```

### 9.2. `pages/pendencias.js`

```javascript
export async function renderPendencias() {
  document.querySelector('#app').innerHTML = layoutBase('pendencias', `
    <div class="max-w-5xl mx-auto p-4">
      <h1 class="text-2xl font-semibold mb-4">Pendências em aberto</h1>
      
      <div class="flex gap-3 mb-4">
        <select id="f-severidade" class="input">
          <option value="">Todas severidades</option>
          <option value="urgente">🔴 Urgente</option>
          <option value="aviso">🟡 Aviso</option>
          <option value="normal">🟢 Recente</option>
        </select>
        <input id="f-busca" placeholder="Buscar NF, cliente..." class="input flex-1" />
      </div>
      
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-100 dark:bg-slate-700">
            <tr>
              <th></th><th class="text-left py-2 px-3">Caixa</th>
              <th class="text-left">NF</th><th class="text-left">Cliente</th>
              <th class="text-right">Valor</th><th class="text-center">Idade</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  `);
  
  const { data: pendencias } = await supabase.from('pendencia').select('*').order('idade_dias_uteis', { ascending: false });
  
  let lista = pendencias ?? [];
  
  function render() {
    const sev = document.querySelector('#f-severidade').value;
    const busca = document.querySelector('#f-busca').value.toLowerCase();
    const filt = lista.filter(p => 
      (!sev || p.severidade === sev) &&
      (!busca || p.numero_nf.toLowerCase().includes(busca) || p.cliente_nome.toLowerCase().includes(busca))
    );
    
    document.querySelector('#tbody').innerHTML = filt.map(p => `
      <tr class="border-t cat-pendente ${p.severidade === 'urgente' ? 'is-atrasada' : ''}">
        <td class="px-3">${badgeSev(p.severidade)}</td>
        <td class="py-2"><a href="/caixa/${p.data_caixa}" data-link class="text-blue-600 hover:underline">${formatDate(p.data_caixa)}</a></td>
        <td class="font-mono">${p.numero_nf}</td>
        <td>${p.cliente_nome}</td>
        <td class="text-right font-mono">${formatBRL(p.valor_nf)}</td>
        <td class="text-center font-mono">${p.idade_dias_uteis}d</td>
        <td><button data-id="${p.id}" class="btn-resolver text-blue-600 hover:underline text-xs">Resolver</button></td>
      </tr>
    `).join('');
    
    document.querySelectorAll('.btn-resolver').forEach(b => {
      b.addEventListener('click', e => {
        const id = e.target.dataset.id;
        const p = lista.find(x => x.id === id);
        abrirModalResolverPendencia(p, render);
      });
    });
  }
  
  document.querySelector('#f-severidade').addEventListener('change', render);
  document.querySelector('#f-busca').addEventListener('input', debounce(render, 200));
  
  render();
}

function badgeSev(s) {
  return { urgente: '🔴', aviso: '🟡', normal: '🟢' }[s] ?? '⚪';
}
```

---

## 10. TELA CONFIGURAÇÕES

Lista de chaves de `config` editáveis pelo usuário com papel admin. Permite ajustar:
- Intervalo de notificação.
- Janela horária.
- Dias para virar atraso.
- Adicionar/desativar vendedora.
- Adicionar feriado.

(Implementação direta, sem novidades.)

---

## 11. COMPONENTES REUTILIZÁVEIS

### 11.1. `<tab-bar>` — barra de abas dos caixas

```javascript
class TabBar extends HTMLElement {
  async connectedCallback() {
    const { data: caixas } = await supabase.from('caixa').select('data, estado').order('data', { ascending: false }).limit(15);
    const ativo = this.dataset.ativo;
    
    this.innerHTML = `
      <nav class="flex gap-1 overflow-x-auto p-2 bg-slate-100 dark:bg-slate-700 rounded-t-xl" role="tablist">
        ${caixas.map(c => {
          const isAtivo = c.data === ativo;
          return `<a href="/caixa/${c.data}" data-link role="tab"
                     class="px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${isAtivo ? 'bg-white dark:bg-slate-800 font-semibold' : 'hover:bg-white/50'} ${c.estado === 'fechado' ? 'opacity-60' : ''}">
                  Caixa ${formatDDMM(c.data)}
                </a>`;
        }).join('')}
        <button id="btn-add-caixa" class="px-2 py-1.5 text-slate-500 hover:bg-white/50 rounded-md">+</button>
      </nav>
    `;
    
    this.querySelector('#btn-add-caixa').addEventListener('click', async () => {
      const dt = prompt('Data do novo caixa (YYYY-MM-DD):');
      if (!dt) return;
      const { error } = await supabase.rpc('criar_caixa_se_nao_existe', { p_data: dt });
      if (!error) location.href = `/caixa/${dt}`;
    });
  }
}
customElements.define('tab-bar', TabBar);
```

### 11.2. `<stat-card>` — cartão de estatística

```javascript
class StatCard extends HTMLElement {
  static get observedAttributes() { return ['value', 'label', 'tone']; }
  
  attributeChangedCallback() { this.render(); }
  connectedCallback() { this.render(); }
  
  render() {
    const tone = this.getAttribute('tone') ?? 'slate';
    const value = this.getAttribute('value') ?? '—';
    const label = this.getAttribute('label') ?? '';
    
    this.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow p-4 border-l-4 border-${tone}-500">
        <div class="text-xs uppercase text-slate-500 dark:text-slate-400 font-medium">${label}</div>
        <div class="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">${value}</div>
      </div>
    `;
  }
}
customElements.define('stat-card', StatCard);
```

### 11.3. `<notification-bell>`

Sino com contador, abre painel lateral com lista. Subscreve em realtime na tabela `notificacao`.

### 11.4. `<modal>`

Wrapper genérico com backdrop, ESC fecha, foco em primeiro input ao abrir.

---

## 12. SISTEMA DE CORES E CSS

### 12.1. `styles/tokens.css`

```css
:root {
  /* Paleta canônica — modo claro */
  --c-cartao-bg: #DBEAFE;
  --c-cartao-text: #1E3A8A;
  --c-cartao-border: #1E40AF;
  
  --c-pix-bg: #CCFBF1;
  --c-pix-text: #134E4A;
  --c-pix-border: #0F766E;
  
  --c-dinheiro-bg: #DCFCE7;
  --c-dinheiro-text: #14532D;
  --c-dinheiro-border: #166534;
  
  --c-cancelado-bg: #FECACA;
  --c-cancelado-text: #7F1D1D;
  --c-cancelado-border: #991B1B;
  
  --c-cartao_link-bg: #EDE9FE;
  --c-cartao_link-text: #4C1D95;
  --c-cartao_link-border: #5B21B6;
  
  --c-obs-bg: #FEF3C7;
  --c-obs-text: #78350F;
  --c-obs-border: #92400E;
  
  --c-pendente-bg: #F3F4F6;
  --c-pendente-text: #6B7280;
  --c-pendente-border: #9CA3AF;
  
  --c-resolvida: #10B981;
  --c-atrasada: #EF4444;
  --c-conflito: #F59E0B;
}

@media (prefers-color-scheme: dark) {
  :root {
    --c-cartao-bg: #1E3A8A;
    --c-cartao-text: #BFDBFE;
    /* ... análogo para todas */
  }
}
```

### 12.2. `styles/components.css`

```css
/* Linha de lançamento colorida */
.entry-row {
  transition: background-color 150ms;
}

.cat-cartao {
  background: var(--c-cartao-bg);
  color: var(--c-cartao-text);
  border-left: 4px solid var(--c-cartao-border);
}
.cat-pix {
  background: var(--c-pix-bg);
  color: var(--c-pix-text);
  border-left: 4px solid var(--c-pix-border);
}
.cat-dinheiro {
  background: var(--c-dinheiro-bg);
  color: var(--c-dinheiro-text);
  border-left: 4px solid var(--c-dinheiro-border);
}
.cat-cancelado {
  background: var(--c-cancelado-bg);
  color: var(--c-cancelado-text);
  border-left: 4px solid var(--c-cancelado-border);
  text-decoration: line-through;
}
.cat-cartao_link {
  background: var(--c-cartao_link-bg);
  color: var(--c-cartao_link-text);
  border-left: 4px solid var(--c-cartao_link-border);
}
.cat-obs {
  background: var(--c-obs-bg);
  color: var(--c-obs-text);
  border-left: 4px solid var(--c-obs-border);
}
.cat-pendente {
  background: var(--c-pendente-bg);
  color: var(--c-pendente-text);
  border-left: 4px dashed var(--c-pendente-border);
}

/* Modificador "resolvida" — sobrepõe faixa verde */
.is-resolvida {
  box-shadow: inset 4px 0 0 var(--c-resolvida);
  border-left-color: var(--c-resolvida) !important;
}
.is-resolvida::after {
  content: '✓';
  color: var(--c-resolvida);
  margin-left: 0.5rem;
  font-weight: 700;
}

/* Atrasada — borda direita pulsante */
.is-atrasada {
  box-shadow: inset -4px 0 0 var(--c-atrasada);
  animation: pulse-borda 2s ease-in-out infinite;
}
@keyframes pulse-borda {
  0%, 100% { box-shadow: inset -4px 0 0 var(--c-atrasada); }
  50% { box-shadow: inset -4px 0 0 var(--c-atrasada), 0 0 0 2px var(--c-atrasada); }
}

/* Conflito */
.is-conflict {
  background-image: repeating-linear-gradient(
    45deg,
    var(--c-conflito), var(--c-conflito) 4px,
    transparent 4px, transparent 12px
  );
}

/* Inputs */
.input {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  font: inherit;
  background: white;
}
.dark .input {
  background: #334155;
  border-color: #475569;
  color: #f1f5f9;
}
.input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.25);
}

/* Botões */
.btn-primary {
  background: #2563eb;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
}
.btn-primary:hover { background: #1d4ed8; }

.btn-ghost {
  background: transparent;
  color: #475569;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
}

/* Badges de severidade */
.badge.urgente { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
.badge.aviso   { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
.badge.normal  { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
```

---

## 13. CAMADA DE DADOS — `supabase-js`

### 13.1. `app/supabase.js`

```javascript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = window.__SUPABASE_URL__ || 'https://<projeto>.supabase.co';
const SUPABASE_ANON = window.__SUPABASE_ANON__ || '<anon-key>';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage
  }
});

window.supabase = supabase; // disponibiliza globalmente para componentes

export function iniciarRealtime() {
  supabase.channel('global-notif')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notificacao'
    }, payload => {
      window.dispatchEvent(new CustomEvent('nova-notificacao', { detail: payload.new }));
    })
    .subscribe();
}
```

### 13.2. Como o Excel acessa as mesmas RPCs

O VBA do arquivo 02 usa `MSXML2.XMLHTTP.6.0` direto contra `${url}/rest/v1/rpc/upsert_lancamento` com headers `apikey` e `Authorization`. Mesma RPC, mesmo schema.

---

## 14. STATE MANAGEMENT (SEM REDUX)

### 14.1. Padrão: store reativo simples

```javascript
// app/store.js
const listeners = new Map();
const state = {};

export function getState(k) { return state[k]; }
export function setState(k, v) {
  state[k] = v;
  (listeners.get(k) ?? []).forEach(cb => cb(v));
}
export function subscribe(k, cb) {
  if (!listeners.has(k)) listeners.set(k, []);
  listeners.get(k).push(cb);
  return () => {
    const arr = listeners.get(k);
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  };
}
```

### 14.2. Uso

```javascript
import { setState, subscribe } from './store.js';

// Em qualquer lugar, atualizar contagem de pendências:
setState('contagem_pendencias', 12);

// Em qualquer componente, reagir:
subscribe('contagem_pendencias', n => {
  document.querySelector('#bell-count').textContent = n;
});
```

---

## 15. REALTIME E ATUALIZAÇÃO VIVA

### 15.1. Estratégia

- **Tela Caixa:** subscreve em `lancamento` filtrado por `caixa_id`. Em qualquer mudança, recarrega lista.
- **Tela Dashboard:** subscreve em todas as tabelas. Debounce 2s antes de recalcular para não derrubar PC lento.
- **Tela Pendências:** subscreve em `lancamento` com filtro `estado=eq.pendente`.

### 15.2. Reconexão automática

`supabase-js` reconecta sozinho. Adicionar listener:

```javascript
supabase.channel('xx').subscribe((status) => {
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    mostrarToast('Reconectando...', 'aviso');
  }
});
```

---

## 16. NOTIFICAÇÕES EM BROWSER

### 16.1. Toast em canto inferior

```javascript
// app/notifications.js
export function mostrarToast(mensagem, severidade = 'info', ms = 4000) {
  let container = document.querySelector('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-4 right-4 space-y-2 z-50';
    document.body.appendChild(container);
  }
  
  const cores = {
    info: 'bg-blue-600',
    aviso: 'bg-amber-600',
    urgente: 'bg-red-600 animate-pulse'
  };
  
  const toast = document.createElement('div');
  toast.className = `${cores[severidade] ?? cores.info} text-white px-4 py-3 rounded-lg shadow-xl max-w-md`;
  toast.innerHTML = `
    <div class="flex items-start gap-2">
      <div class="flex-1 text-sm">${mensagem}</div>
      <button class="text-white/70 hover:text-white">×</button>
    </div>
  `;
  toast.querySelector('button').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), ms);
}

// Listen para nova-notificacao do realtime
window.addEventListener('nova-notificacao', e => {
  const n = e.detail;
  mostrarToast(`<strong>${n.titulo}</strong><br>${n.mensagem}`, n.severidade);
  
  // Som curto para urgente (se permitido)
  if (n.severidade === 'urgente') {
    new Audio('/assets/sounds/alert.mp3').play().catch(() => {});
  }
});
```

### 16.2. Web Push (futuro)

Service Worker com `self.addEventListener('push', ...)` — implementar na fase 3.

---

## 17. MODO OFFLINE (CACHE-FIRST)

### 17.1. Service Worker `sw.js`

```javascript
const CACHE_NAME = 'caixa-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/styles/tokens.css',
  '/styles/components.css',
  '/app/main.js',
  // ... demais módulos
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/rest/v1/') || e.request.url.includes('/auth/v1/')) return;
  
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const respClone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, respClone));
      return resp;
    }))
  );
});
```

### 17.2. Fila offline para mutações

Usar IndexedDB via Dexie para fila de mutações pendentes:

```javascript
// app/offline.js
import Dexie from 'https://unpkg.com/dexie@4.0.1/dist/dexie.mjs';

const db = new Dexie('caixa-offline');
db.version(1).stores({
  pendentes: '++id, tipo, payload, criado_em'
});

export async function enfileirar(tipo, payload) {
  await db.pendentes.add({ tipo, payload, criado_em: new Date() });
}

export async function processarFila() {
  if (!navigator.onLine) return;
  const lista = await db.pendentes.toArray();
  for (const item of lista) {
    try {
      if (item.tipo === 'inserir_lancamento') {
        await window.supabase.from('lancamento').insert(item.payload);
      }
      // ... outros tipos
      await db.pendentes.delete(item.id);
    } catch (e) {
      console.warn('Falha processando fila:', e);
      break;
    }
  }
}

window.addEventListener('online', processarFila);
window.addEventListener('offline', () => mostrarToast('Modo offline ativado.', 'aviso'));
```

---

## 18. ACESSIBILIDADE (WCAG AA)

### 18.1. Requisitos atendidos

- Contraste ≥ 4.5:1 para texto, ≥ 3:1 para ícones (paleta canônica do arquivo 01 já validada).
- Foco visível em todos os elementos interativos (`focus:ring-2 focus:ring-blue-500`).
- Navegação por teclado: Tab, Enter, Esc no modal.
- ARIA labels em botões só-ícone.
- `lang="pt-BR"` no `<html>`.
- `aria-live="polite"` na área de toasts.

### 18.2. Skip link

```html
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-blue-600 text-white px-3 py-2 rounded">
  Pular para conteúdo
</a>
```

---

## 19. PERFORMANCE — ALVO PC LENTO

### 19.1. Métricas-alvo

| Métrica | Alvo |
|---------|------|
| First Contentful Paint | < 1.5s (cache vazio, 4G simulado) |
| Time to Interactive | < 3s |
| Total bundle (precache) | < 300 KB gzip |
| Memória após 1h | < 100 MB |
| FPS de scroll na lista | ≥ 50 |

### 19.2. Técnicas

- **Lazy loading** de páginas via `import()` dinâmico.
- **Chart.js carregado só onde usado** (Dashboard).
- **Tabela virtualizada** para listas > 200 linhas (implementação simples com IntersectionObserver).
- **Debounce** em filtros e buscas (200ms).
- **Imagens em WebP** com fallback PNG via `<picture>`.
- **Preload** das fontes do sistema (sem fontes web carregadas).

### 19.3. Eliminar reflows

Antes de inserir lista grande, montar string completa e setar `innerHTML` uma vez. Não usar `appendChild` em loop.

---

## 20. INTERNACIONALIZAÇÃO

`i18n/pt-BR.json` com todas as strings da seção 15 do arquivo 01.

```javascript
// app/i18n.js
import strings from '/i18n/pt-BR.json' assert { type: 'json' };

export function t(chave, vars = {}) {
  let s = chave.split('.').reduce((acc, k) => acc?.[k], strings) ?? chave;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, v);
  }
  return s;
}
```

Uso: `t('erro.nf.obrigatorio')`.

---

## 21. TESTES FUNCIONAIS

### 21.1. Playwright

`tests/e2e.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('fluxo: criar lançamento Cartão', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.click('#btn-sso'); // mock SSO em ambiente de teste
  
  await page.click('a[href="/caixa/hoje"]');
  await page.click('#btn-novo');
  
  await page.fill('input[name="numero_nf"]', '99999');
  await page.fill('input[name="codigo_pedido"]', 'PED-TEST');
  await page.fill('input[name="cliente_nome"]', 'Cliente Teste');
  await page.fill('input[name="valor_nf"]', '100.50');
  await page.selectOption('select[name="categoria"]', 'cartao');
  
  await page.fill('input[name="codigo_autorizacao"]', 'AUTH123');
  await page.selectOption('select[name="bandeira"]', 'Visa');
  await page.selectOption('select[name="modalidade"]', 'Crédito');
  await page.fill('input[name="parcelas"]', '1');
  
  await page.click('button[type="submit"]');
  
  await expect(page.locator('text=Cliente Teste')).toBeVisible();
  await expect(page.locator('.cat-cartao')).toBeVisible();
});
```

---

## 22. APÊNDICE J — WIREFRAMES TEXTUAIS

### J.1. Layout base (todas as páginas autenticadas)

```
┌──────────────────────────────────────────────────────┐
│ [☰] Controle de Caixa            [🔔 N]  [👤 Op ▾]  │  ← header (h-14, sticky)
├──────────────────────────────────────────────────────┤
│ [📊 Dashboard] [📅 Caixas] [⏰ Pendências] [⚙️ Cfg] │  ← nav primário (h-12)
├──────────────────────────────────────────────────────┤
│                                                      │
│     ( conteúdo da rota atual )                       │
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### J.2. Header detalhe

- Botão hambúrguer mobile (oculta nav em <768px).
- Logo + nome do produto.
- Sino com badge contador.
- Avatar com menu dropdown: nome, e-mail, "Sair".

### J.3. Footer (opcional, low-key)

- Versão do sistema.
- Link para suporte interno.

---

## 23. APÊNDICE K — `index.html` BASE

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#1F2937">
  <title>Controle de Caixa</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/assets/img/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'media',
      theme: { extend: { colors: { /* cores extras */ } } }
    }
  </script>
  <link rel="stylesheet" href="/styles/tokens.css">
  <link rel="stylesheet" href="/styles/components.css">
</head>
<body class="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 antialiased">
  <a href="#main" class="sr-only focus:not-sr-only ...">Pular para conteúdo</a>
  <div id="app" role="main"></div>
  <div id="toast-container" aria-live="polite" aria-atomic="false"></div>
  
  <script type="module" src="/app/main.js"></script>
</body>
</html>
```

---

## FIM DO DOCUMENTO 04

> Próxima leitura: `05_INTEGRACAO_SINCRONIZACAO_OPERACAO.md`.

