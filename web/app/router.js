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
import { renderCaixaFechar }   from './pages/caixa-fechar.js';
import { renderConfiguracoes } from './pages/configuracoes.js';
import { renderVendedoras }    from './pages/configuracoes-vendedoras.js';
import { renderUsuarios }      from './pages/configuracoes-usuarios.js';
import { renderFeriados }      from './pages/configuracoes-feriados.js';
import { renderSistema }       from './pages/configuracoes-sistema.js';
import { renderRelatorios }    from './pages/relatorios.js';
import { renderPendencias }    from './pages/pendencias.js';
import { renderNotificacoes }  from './pages/notificacoes.js';
import { renderPerfil }        from './pages/perfil.js';
import { renderLancamento }    from './pages/lancamento.js';
import { renderErro404 }       from './pages/erro-404.js';
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
  { padrao: /^\/caixa\/([\w-]+)\/fechar$/,    handler: renderCaixaFechar },
  { padrao: /^\/caixa\/([\w-]+)$/,            handler: renderCaixa },
  { padrao: /^\/lancamento\/([\w-]+)$/,       handler: renderLancamento },
  { padrao: /^\/configuracoes$/,              handler: renderConfiguracoes },
  { padrao: /^\/configuracoes\/vendedoras$/,  handler: renderVendedoras },
  { padrao: /^\/configuracoes\/usuarios$/,    handler: renderUsuarios },
  { padrao: /^\/configuracoes\/feriados$/,    handler: renderFeriados },
  { padrao: /^\/configuracoes\/sistema$/,     handler: renderSistema },
  { padrao: /^\/relatorios$/,                 handler: renderRelatorios },
  { padrao: /^\/pendencias$/,                 handler: renderPendencias },
  { padrao: /^\/notificacoes$/,               handler: renderNotificacoes },
  { padrao: /^\/perfil$/,                     handler: renderPerfil },
  { padrao: /^\/erros\/404$/,                 handler: renderErro404, aberta: true },
  // Catch-all editorial — sempre o último. Se chegou aqui é 404.
  { padrao: /.*/,                              handler: renderErro404, aberta: true },
];

export async function navegar(url) {
  if (location.pathname + location.search === url) return;
  history.pushState({}, '', url);
  await despachar();
}

export async function despachar() {
  const url = location.pathname;
  const sessao = await pegarSessao();

  // Limpa shell entre rotas — páginas autenticadas (com sidebar) chamam
  // `ligarShell()` que reativa o data-shell. Páginas auth (login etc.)
  // ficam em layout cheio.
  document.querySelector('#app')?.removeAttribute('data-shell');

  for (const rota of rotas) {
    const m = url.match(rota.padrao);
    if (!m) continue;

    // Se rota fechada e sem sessão → manda para login com ?next= preservando
    // a intenção. Pós-login o /login lê esse ?next= e devolve o operador
    // exatamente onde ele tentou ir.
    if (!rota.aberta && !sessao) {
      const destino = '/login?next=' + encodeURIComponent(url);
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
  // Inalcançável: o catch-all `/.*/  ` no fim da lista garante match.
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
