// router.js — roteador minimalista baseado em History API.
// Sem framework. Cada rota tem um regex e um handler que renderiza no #app.

import { renderLogin }      from './pages/login.js';
import { renderCadastro }   from './pages/cadastro.js';
import { renderConfirmar }  from './pages/confirmar.js';
import { renderRecuperar }  from './pages/recuperar.js';
import { renderRedefinir }  from './pages/redefinir.js';
import { renderDashboard }     from './pages/dashboard.js';
import { renderCaixa }         from './pages/caixa.js';
import { renderCaixas }        from './pages/caixas.js';
import { renderConfiguracoes } from './pages/configuracoes.js';
import { renderVendedoras }    from './pages/configuracoes-vendedoras.js';
import { renderPendencias }    from './pages/pendencias.js';
import { pegarSessao }         from './supabase.js';

// Lista de rotas, em ordem. `aberta: true` = não exige sessão.
// /redefinir é aberta porque o usuário aterrissa via link de email com
// fragment de token; supabase-js cria sessão automaticamente, e o handler
// confere se há sessão antes de mostrar o form.
const rotas = [
  { padrao: /^\/$/,                  handler: () => navegar('/dashboard'), aberta: true },
  { padrao: /^\/login$/,             handler: renderLogin,                 aberta: true },
  { padrao: /^\/cadastro$/,          handler: renderCadastro,              aberta: true },
  { padrao: /^\/confirmar$/,         handler: renderConfirmar,             aberta: true },
  { padrao: /^\/recuperar$/,         handler: renderRecuperar,             aberta: true },
  { padrao: /^\/redefinir$/,         handler: renderRedefinir,             aberta: true },
  { padrao: /^\/dashboard$/,                  handler: renderDashboard },
  { padrao: /^\/caixas$/,                     handler: renderCaixas },
  { padrao: /^\/caixa\/([\w-]+)$/,            handler: renderCaixa },
  { padrao: /^\/configuracoes$/,              handler: renderConfiguracoes },
  { padrao: /^\/configuracoes\/vendedoras$/,  handler: renderVendedoras },
  { padrao: /^\/pendencias$/,                 handler: renderPendencias },
];

export async function navegar(url) {
  if (location.pathname + location.search === url) return;
  history.pushState({}, '', url);
  await despachar();
}

export async function despachar() {
  const url = location.pathname;
  const sessao = await pegarSessao();

  for (const rota of rotas) {
    const m = url.match(rota.padrao);
    if (!m) continue;
    // Limpa querystring bookmarks vindos por copy/paste, mas guarda
    // p/ as páginas que dependem dele (filter-bar lê via URLSearchParams).

    // Se rota fechada e sem sessão → manda para login.
    if (!rota.aberta && !sessao) {
      const destino = '/login?proximo=' + encodeURIComponent(url);
      return navegar(destino);
    }
    // Se rota é login mas usuário já tem sessão válida → manda para dashboard.
    // Exceção: /redefinir tem sessão "recovery" e precisa do form de senha,
    // não pode redirecionar.
    if (rota.aberta && sessao && (url === '/login' || url === '/')) {
      return navegar('/dashboard');
    }
    return rota.handler({ params: m.slice(1), sessao });
  }

  document.querySelector('#app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-8 text-center">
      <div>
        <p class="h-eyebrow mb-2">404</p>
        <h1 class="h-display text-5xl mb-4">Página não encontrada</h1>
        <a href="/dashboard" data-link class="btn-link">Voltar para o início</a>
      </div>
    </div>`;
}

// Intercepta cliques em <a data-link href="..."> para navegação client-side.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http')) return;
  e.preventDefault();
  navegar(href);
});

window.addEventListener('popstate', despachar);
