// Lions CricTracker — Service Worker
// Bump CACHE_VERSION any time you change which files are cached, or want to
// force already-installed users to pull a fresh copy (e.g. new icons, new manifest).
const CACHE_VERSION = 'v3';
const CACHE_NAME = `lions-crictracker-${CACHE_VERSION}`;

// App shell — the core files needed for the app to load at all.
// NOTE: these paths must exactly match what index.html / manifest.json
// actually reference. Everything lives at the repo root — there is no
// /icons/ subfolder, which was the bug in v2 (see below).
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

// ── INSTALL: precache the app shell. ──
// v2 used cache.addAll(), which is all-or-nothing: it pointed at
// ./icons/icon-192.png etc, a folder that doesn't exist in this repo, so
// every one of those requests 404'd, the whole addAll() rejected, and
// index.html itself was NEVER cached — that's why offline showed the
// browser's default offline page instead of the app.
// Fix: cache each file individually and don't let one bad/missing file
// (e.g. if you rename an icon later) take down the whole app shell —
// index.html and manifest.json are cached first and are what matter most.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url))
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn('[sw] precache failed for', PRECACHE_URLS[i], r.reason);
        }
      });
    })
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
// app logic when online, falling back to cache only if offline. Since
// index.html contains the ENTIRE app (Tracker, Analytics, Coach View, AI
// Coach — it's all one file), caching it correctly is all that's needed
// for the whole app to work offline.
// Everything else (icons, manifest, and CDN scripts like Firebase/OneSignal
// once fetched at least once online): cache-first, since those rarely
// change and it's wasteful to refetch them constantly.
// Live data calls (Firestore, Cloudinary, Gemini) are NOT intercepted here
// beyond this generic pass-through — they'll naturally fail offline, which
// is correct: that's live data, not app shell, and shouldn't be cached.
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
        // Only cache successful, same-type responses (avoid caching opaque
        // errors or partial CORS responses that can poison the cache).
        if (res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
