// Service Worker — Caixa Boti
//
// Responsabilidade única (por enquanto): receber Web Push do navegador
// quando a aba está fechada / browser em background, mostrar a
// notification do SO, e na hora do click focar / abrir a aba certa.
//
// Sem precache de assets, sem offline-first — não é um PWA completo,
// é um SW mínimo de push. Mantém o footprint pequeno e a lógica óbvia.

const TAG_FALLBACK = 'caixa-boti-notif';

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar ciclo de fechar todas as abas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (_) {
    dados = { titulo: 'Caixa Boti', mensagem: event.data ? event.data.text() : '' };
  }

  const titulo = dados.titulo || 'Caixa Boti';
  const opcoes = {
    body: dados.mensagem || '',
    icon: '/assets/logo.svg',
    badge: '/assets/logo.svg',
    // Mesmo `tag` substitui notificação anterior em vez de empilhar.
    tag: dados.tipo ? `notif-${dados.tipo}` : TAG_FALLBACK,
    renotify: dados.severidade === 'urgente',
    requireInteraction: dados.severidade === 'urgente',
    data: {
      url: dados.url || '/notificacoes',
      notif_id: dados.notif_id || null,
      lancamento_id: dados.lancamento_id || null,
      caixa_id: dados.caixa_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || '/notificacoes';

  event.waitUntil((async () => {
    const clientes = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // Se já tem uma janela aberta, foca + navega
    for (const c of clientes) {
      try {
        const u = new URL(c.url);
        if (u.origin === self.location.origin) {
          await c.focus();
          if ('navigate' in c) {
            try { await c.navigate(destino); } catch (_) {}
          } else {
            // fallback: dispara mensagem que o app trata
            c.postMessage({ tipo: 'navegar', url: destino });
          }
          return;
        }
      } catch (_) { /* ignore */ }
    }

    // Nenhuma janela: abre nova
    if (self.clients.openWindow) {
      await self.clients.openWindow(destino);
    }
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Push service rotacionou a subscription. O frontend re-registra
  // na próxima vez que abrir a aba (push.js detecta divergência).
  // Sem applicationServerKey aqui (não temos acesso às configs do app
  // a partir do SW sem fetch ao backend), então só logamos.
  console.warn('[sw] pushsubscriptionchange — frontend reinscreverá ao abrir');
});
