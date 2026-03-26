const CACHE_NAME = 'photoweather-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })
    ))
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Strategia Network-First per API
  if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('nominatim.openstreetmap.org')) {
    event.respondWith(
      fetch(req)
      .then(res => {
        const cacheRes = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, cacheRes));
        return res;
      })
      .catch(() => caches.match(req).then(res => res || new Response(null, { status: 503, statusText: 'Service Unavailable' })))
    );
  } else {
    // Strategia Cache-First per asset statici e tile della mappa
    event.respondWith(
      caches.match(req).then(res => res || fetch(req).then(fetchRes => {
        const cacheRes = fetchRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, cacheRes));
        return fetchRes;
      }))
    );
  }
});
