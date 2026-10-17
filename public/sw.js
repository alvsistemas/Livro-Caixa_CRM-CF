const CACHE_NAME = 'livro-caixa-v1';

self.addEventListener('install', () => {
  self.skipWaiting(); // assume o controle assim que instalar, sem esperar todas as abas fecharem
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

// Estratégia: network-first pra tudo (menos chamadas de API, que nunca passam por
// aqui). Sempre tenta buscar a versão mais nova do servidor primeiro; só usa o que
// está guardado em cache se o celular estiver sem internet nesse momento. Isso
// garante que qualquer atualização do site aparece pra quem já instalou o "app" no
// celular, sem precisar desinstalar e instalar de novo — só abrir com internet.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // API sempre direto no servidor, nunca em cache

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});

// Notificações push (tarefas e mensagens de clientes) — chegam mesmo com o app fechado.
self.addEventListener('push', (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = { title: 'Livro-Caixa', body: event.data ? event.data.text() : '' }; }
  const titulo = dados.title || 'Livro-Caixa';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: dados.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: dados.tag || undefined,
    renotify: !!dados.tag,
    data: { url: dados.url || '/index.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/index.html';
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if ('focus' in j) { await j.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(destino);
  })());
});
