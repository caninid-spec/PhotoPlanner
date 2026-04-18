// service-worker.js — PhotoPlanner (FIXED & OPTIMIZED)
const CACHE_NAME = 'photoplanner-v3'; // Incrementato versione per forzare aggiornamento

const FILES_TO_CACHE = [
  './', './index.html', './style.css', './main.js', './manifest.json',
  './icons/android-chrome-192x192.png', './icons/android-chrome-512x512.png'
];

self.addEventListener('install', (evt) => {
  console.log('[SW] Install v3');
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[SW] Activate v3');
  evt.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ✅ FIX: Fetch handler sicuro. Clona SOLO prima di mettere in cache.
self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;

  // Ignora richieste API/dinamiche (non cachiamo Open-Meteo, Worker, ecc.)
  const url = new URL(evt.request.url);
  const isStatic = FILES_TO_CACHE.some(f => url.pathname.endsWith(f.replace('./', '')));
  const isCdn = url.hostname.includes('cdnjs') || url.hostname.includes('fonts');
  
  if (!isStatic && !isCdn) return;

  evt.respondWith(
    caches.match(evt.request).then(cached => {
      if (cached) return cached;

      return fetch(evt.request).then(networkRes => {
        if (networkRes.ok) {
          // 🔑 Clona PRIMA di usare la risposta per la cache
          const clone = networkRes.clone();
          evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone)));
        }
        return networkRes;
      });
    })
  );
});