// ════════════════════════════════════════
// service-worker.js — PhotoWeather
// ════════════════════════════════════════

const CACHE_NAME = 'photoweather-cache-v1';

// App Shell: The essential files needed for the app to run.
// I have updated this list to include your specific icon files.
const FILES_TO_CACHE = [
  '/PhotoPlanner/',
  '/PhotoPlanner/index.html',
  '/PhotoPlanner/style.css',
  '/PhotoPlanner/main.js',
  '/PhotoPlanner/manifest.json',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap'
];

// 1. Install the service worker and cache the app shell.
self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install');
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching app shell');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activate the service worker and clean up old caches.
self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// 3. Serve assets from cache first (Cache-First Strategy).
self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') {
    return;
  }
  
  evt.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(evt.request)
        .then((response) => {
          return response || fetch(evt.request);
        });
    })
  );
});
