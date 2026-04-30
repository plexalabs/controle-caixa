// sw.js — Service Worker placeholder.
// Implementação real (cache-first do shell, fila offline) entra no CP5.
// Por agora apenas registra-se para que o manifest valide; nenhum fetch
// é interceptado.

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

// Sem listener de fetch — passa por padrão até o CP5.
