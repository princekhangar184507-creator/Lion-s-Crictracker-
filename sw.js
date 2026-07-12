// Lions CricTracker — Service Worker
// Bump CACHE_VERSION any time you change which files are cached, or want to
// force already-installed users to pull a fresh copy (e.g. new icons, new manifest).
const CACHE_VERSION = 'v2';
const CACHE_NAME = `lions-crictracker-${CACHE_VERSION}`;

// App shell — the core files needed for the app to load at all.
// Keep this list in sync with what actually exists in the repo root.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png'
];

// ── INSTALL: precache the app shell. Do NOT skipWaiting here — the new
// worker waits until the page explicitly tells it to (see the SKIP_WAITING
// message handler below), which is what index.html's updatefound logic drives. ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// ── ACTIVATE: delete any caches from older versions ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('lions-crictracker-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── MESSAGE: index.html sends this once it detects a new worker installed.
// This is what actually activates the new version (triggers 'controllerchange',
// which index.html listens for and reloads the page). ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── FETCH ──
// HTML (navigation requests): network-first, so users always get the latest
// app logic when online, falling back to cache only if offline.
// Everything else (icons, manifest): cache-first, since those rarely change
// and it's wasteful to refetch them constantly.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      });
    })
  );
});
