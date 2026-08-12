// Service worker — the studio has bad signal and the app has no server to talk
// to anyway, so everything it needs is precached on install.
//
// Strategy is network-first with a cache fallback: a refresh picks up a new
// deploy when there's signal, and still works when there isn't. Bump CACHE when
// the file list changes so old entries get evicted on activate.

const CACHE = 'vibe-clay-v1.1.0';

const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/chemistry.js',
  './js/import.js',
  './js/paste-import.js',
  './js/limits.js',
  './js/store.js',
  './data/materials.json',
  './data/glaze-limits.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // One bad URL shouldn't fail the whole install, so add them individually.
      .then(cache => Promise.all(ASSETS.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Only serve our own origin; anything else goes straight to the network.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
  );
});
