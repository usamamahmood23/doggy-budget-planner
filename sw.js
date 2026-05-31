/* Doggy Budget Planner — service worker
   - precache app shell
   - cache-first for shell
   - stale-while-revalidate for Chart.js CDN
*/
const CACHE = 'dbp-cache-v6';
const SHELL = [
  './',
  'index.html',
  'css/styles.css?v=5',
  'js/storage.js?v=5',
  'js/charts.js?v=5',
  'js/app.js?v=5',
  'manifest.json?v=5',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/favicon-16.png'
];

const CHART_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Chart.js CDN: stale-while-revalidate
  if (req.url === CHART_CDN || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Same-origin: cache-first with network fallback
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => {
          if (req.mode === 'navigate') return caches.match('index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
    );
  }
});
