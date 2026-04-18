// ═══════════════════════════════════════════════
// service-worker.js — PhotoPlanner (FIXED)
// ═══════════════════════════════════════════════
const CACHE_NAME = 'photoplanner-v2';
const FILES_TO_CACHE = [
  './', './index.html', './style.css', './main.js', './manifest.json',
  './icons/android-chrome-192x192.png', './icons/android-chrome-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', (evt) => {
  console.log('[SW] Install');
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[SW] Activate');
  evt.waitUntil(caches.keys().then(keys => 
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// 🔧 FIX: Fetch handler sicuro con clone corretto
self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;

  evt.respondWith(
    caches.match(evt.request).then(cached => {
      if (cached) return cached;

      return fetch(evt.request).then(networkRes => {
        // Cache solo se la richiesta ha successo
        if (networkRes.ok) {
          const clone = networkRes.clone(); // 🔑 Clona PRIMA di usare la risposta
          evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone)));
        }
        return networkRes;
      });
    })
  );
});