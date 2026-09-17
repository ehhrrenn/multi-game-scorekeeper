// public/sw.js
//
// Runtime-caching service worker. This app already keeps game state in
// localStorage (see hooks/useGameState.ts), so the only thing standing
// between "offline" and "broken" is whether the browser still has the
// page's HTML/JS/CSS. This worker caches same-origin pages and static
// assets as they're visited, and serves them from cache when the network
// is unavailable. Firebase/Firestore requests are left untouched so auth
// and cloud sync behave exactly as they do without the worker.

const CACHE_VERSION = 'scorekeeper-v1';
const OFFLINE_URL = '/offline';

// Warm the cache with the app shell so a completely offline first launch
// (after at least one successful visit + install) still has somewhere to go.
const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// Never intercept Firebase/Firestore/Google auth traffic, or anything
// that isn't a simple GET — those need to hit the real network (or fail
// naturally) so auth/cloud sync behave correctly.
function shouldBypass(request, url) {
  if (request.method !== 'GET') return true;
  if (!isSameOrigin(url)) return true;
  if (url.pathname.startsWith('/api/')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (shouldBypass(request, url)) return;

  // Page navigations: network-first so users get fresh content when
  // online, falling back to a cached copy (or the offline page) when not.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Static assets (hashed Next.js chunks, images, fonts): cache-first,
  // since a given URL's contents never change once built.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
