// ════════════════════════════════════════════════
// LandscapeIQ — Service Worker
// Handles offline caching + background API sync
// ════════════════════════════════════════════════

const CACHE_NAME = 'landscapeiq-v2';
const API_SYNC_TAG = 'landscapeiq-sync';

// Core assets to cache immediately on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './sw.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap',
];

// ── INSTALL: pre-cache shell assets ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove old caches ──────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for assets, network-first for API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls → network-first, fallback to queued offline response
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithOfflineQueue(event.request));
    return;
  }

  // Map tile requests → cache with long TTL
  if (url.hostname.includes('tile') || url.pathname.includes('tiles')) {
    event.respondWith(cacheFirstWithNetwork(event.request, 'map-tiles-v1'));
    return;
  }

  // Font/static assets → cache first
  if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) {
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
    return;
  }

  // Navigation → network-first so new deployments are picked up immediately
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Default: cache-first
  event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
});

// ── BACKGROUND SYNC: flush queued API writes ─────
self.addEventListener('sync', event => {
  if (event.tag === API_SYNC_TAG) {
    event.waitUntil(flushOfflineQueue());
  }
});

// ── PUSH NOTIFICATIONS ────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'LandscapeIQ', body: 'Update available' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'LandscapeIQ', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      tag: 'landscapeiq-push',
    })
  );
});

// ════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════

async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithOfflineQueue(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Queue for background sync
    if (request.method !== 'GET') {
      await queueRequest(request);
    }
    return new Response(JSON.stringify({ offline: true, queued: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 202,
    });
  }
}

async function queueRequest(request) {
  try {
    const body = await request.text();
    const queue = await getQueue();
    queue.push({ url: request.url, method: request.method, body, timestamp: Date.now() });
    await setQueue(queue);
  } catch (e) {
    console.warn('[SW] Queue error:', e);
  }
}

async function flushOfflineQueue() {
  const queue = await getQueue();
  const remaining = [];
  for (const item of queue) {
    try {
      await fetch(item.url, { method: item.method, body: item.body, headers: { 'Content-Type': 'application/json' } });
    } catch {
      remaining.push(item);
    }
  }
  await setQueue(remaining);
}

// IndexedDB-backed queue (survives SW restarts)
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('liq-sw-queue', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('queue');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

async function getQueue() {
  try {
    const db = await openQueueDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readonly');
      const req = tx.objectStore('queue').get('pending');
      req.onsuccess = () => res(req.result || []);
      req.onerror = rej;
    });
  } catch { return []; }
}

async function setQueue(data) {
  try {
    const db = await openQueueDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').put(data, 'pending');
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {}
}