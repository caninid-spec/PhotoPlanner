const CACHE_NAME = 'photoplanner-v2';
const SHELL = [
  './', './index.html', './style.css', './main.js', './manifest.json',
  './icons/android-chrome-192x192.png', './icons/android-chrome-512x512.png'
];

self.addEventListener('install', evt => {
  console.log('[SW] Install');
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  console.log('[SW] Activate');
  evt.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET') return;
  const url = new URL(evt.request.url);
  const isStatic = SHELL.some(s => url.pathname.endsWith(s.replace('./','')));
  const isApi = url.hostname.includes('open-meteo') || url.hostname.includes('workers.dev') || url.hostname.includes('openstreetmap');

  evt.respondWith(
    caches.match(evt.request).then(res => {
      if (res) return res;
      return fetch(evt.request).then(networkRes => {
        if (networkRes.ok && (isStatic || isApi)) {
          const cache = caches.open(CACHE_NAME);
          cache.then(c => c.put(evt.request, networkRes.clone()));
        }
        return networkRes;
      });
    })
  );
});