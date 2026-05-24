const CACHE_NAME = 'tudu-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon.svg'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle HTTP/HTTPS requests (bypass chrome-extension://, chrome://, etc.)
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  // Bypass service worker caching for Supabase requests completely
  const isSupabaseRequest = 
    url.hostname.includes('supabase.co') || 
    url.pathname.includes('/auth/') || 
    url.pathname.includes('/rest/v1/');

  if (isSupabaseRequest) {
    return;
  }

  // For pages (navigation mode), use Network-First, fallback to Cache (Offline Fallback)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/');
        })
    );
    return;
  }

  // Cache-First for static assets (Next.js static files, public SVGs, favicon, manifest)
  const isStaticAsset = 
    url.pathname.includes('/_next/static/') ||
    url.pathname.match(/\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2|woff|ttf)$/) ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/icon.svg';

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
  }
});
