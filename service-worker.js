/* ═══════════════════════════════════════════
   சாரம் — Service Worker (PWA Offline Support)
   ═══════════════════════════════════════════ */

const CACHE_NAME = 'saram-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/offline.html',
];

/* ── Install: cache static assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first for API, cache-first for assets ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network for external APIs
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'offline', message: 'இணைய இணைப்பு இல்லை' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;

        return fetch(request)
          .then(response => {
            // Cache valid responses
            if (response.ok && request.method === 'GET') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback for navigation
            if (request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            return new Response('', { status: 408 });
          });
      })
  );
});

/* ── Background sync placeholder ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-likes') {
    // Future: sync likes to backend
  }
});

/* ── Push notification placeholder ── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || 'சாரம்', {
      body: data.body || 'இன்றைய தமிழ் ஞானம் உங்களுக்காக காத்திருக்கிறது',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'படிக்க' },
        { action: 'close', title: 'மூடு' },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const targetUrl = event.notification.data?.url || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then(clientList => {
          for (const client of clientList) {
            if (client.url === targetUrl && 'focus' in client) {
              return client.focus();
            }
          }
          return clients.openWindow(targetUrl);
        })
    );
  }
});
