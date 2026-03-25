/* sw.js — Service Worker per PWA */
const CACHE   = 'photoscout-v1';
const ASSETS  = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/sun.js',
  '/js/weather.js',
  '/js/map.js',
  '/js/ai.js',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Network-first per API esterne, cache-first per asset locali
  if (
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('open-meteo') ||
    url.hostname.includes('nominatim') ||
    url.hostname.includes('openai') ||
    url.hostname.includes('arcgis') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('unpkg')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
