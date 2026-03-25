/* sw.js - Service Worker con strategia "Network First" */

const CACHE_NAME = 'photographer-spot-cache-v1.2'; // Aggiornato il nome della cache
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'style.css',
  'app.js',
  'map.js',
  'weather.js',
  'sun.js',
  'ai.js',
  'manifest.json',
  'img/icons/icon-192x192.png',
  'img/icons/icon-512x512.png',
  // Aggiungi qui altre immagini o asset statici importanti
  'img/markers/marker-user.png',
  'img/markers/marker-photo.png',
  'img/markers/marker-poi.png',
  'img/markers/marker-food.png'
];

// FASE 1: Installazione del Service Worker e Caching degli asset statici
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching assets statici');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// FASE 2: Attivazione e pulizia delle vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Pulizia vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// FASE 3: Gestione delle richieste (Fetch) con strategia "Network First"
self.addEventListener('fetch', event => {
  // Ignora le richieste non-GET (es. POST)
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignora le richieste alle API esterne (es. OpenStreetMap, Open-Meteo)
  if (event.request.url.startsWith('https://')) {
    return;
  }

  event.respondWith(
    // 1. Prova a ottenere la risorsa dalla rete
    fetch(event.request)
      .then(networkResponse => {
        // Se la rete risponde, usiamo quella e aggiorniamo la cache
        return caches.open(CACHE_NAME).then(cache => {
          // Non mettere in cache le risposte di errore
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // 2. Se la rete fallisce (offline), cerca nella cache
        console.log('Service Worker: Rete non disponibile, cerco nella cache per:', event.request.url);
        return caches.match(event.request).then(cachedResponse => {
          return cachedResponse || new Response("Contenuto non disponibile offline.", { status: 404, statusText: "Not Found" });
        });
      })
  );
});
