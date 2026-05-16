// Lions CricTracker Service Worker
// Caches the app shell and key assets for offline use

const CACHE_NAME = 'lions-crictracker-v4';
const RUNTIME_CACHE = 'lions-runtime-v4';

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable-192.svg',
  './icon-maskable-512.svg',
];

// External CDN resources to cache on first fetch
const CDN_CACHE_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
  'cdnjs.cloudflare.com',
];

// Firebase domains — always network-first (real-time data)
const FIREBASE_PATTERNS = [
  'firebaseapp.com',
  'firebaseio.com',
  'googleapis.com/identitytoolkit',
  'googleapis.com/securetoken',
];

// ── INSTALL: cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Pre-cache failed (some assets may not exist yet):', err);
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: routing strategy ───────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase / auth — always network-only
  if (FIREBASE_PATTERNS.some(p => url.href.includes(p))) {
    return; // let it fall through to network
  }

  // App shell: network-first so updates always get picked up
  if (PRECACHE_ASSETS.some(asset => url.pathname.endsWith(asset.replace('./', '')))) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // Google Fonts / CDN: stale-while-revalidate
  if (CDN_CACHE_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

// ── STRATEGIES ────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || networkFetch;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Lions CricTracker – Offline</title>
      <style>
        body {
          background: #07090f;
          color: #e8eaf0;
          font-family: 'Barlow Condensed', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          text-align: center;
          padding: 24px;
        }
        .lion { font-size: 64px; margin-bottom: 16px; }
        h1 { color: #c8f135; font-size: 28px; font-weight: 900; letter-spacing: 2px; margin-bottom: 8px; }
        p { color: #8a919e; font-size: 14px; max-width: 280px; line-height: 1.6; }
        .retry {
          margin-top: 24px;
          padding: 12px 24px;
          background: #c8f135;
          color: #07090f;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
        }
      </style>
    </head>
    <body>
      <div class="lion">🦁</div>
      <h1>YOU'RE OFFLINE</h1>
      <p>Lions CricTracker needs a connection for live data. Your local progress is safe.</p>
      <button class="retry" onclick="window.location.reload()">Try Again</button>
    </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// ── BACKGROUND SYNC (placeholder for future use) ─────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-progress') {
    console.log('[SW] Background sync triggered');
  }
});

// ── SKIP WAITING on demand ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
    
