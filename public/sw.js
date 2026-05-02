const CACHE = 'mise-v1';
const OFFLINE = '/offline.html';

// Pre-cache the app shell and offline fallback on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/', OFFLINE, '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'])
    ).then(() => self.skipWaiting())
  );
});

// Remove old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Let Supabase and other third-party API calls pass through untouched
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    // Navigation: network-first, fall back to offline page
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(OFFLINE))
    );
    return;
  }

  // Static assets: cache-first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, clone));
        return res;
      });
    })
  );
});
