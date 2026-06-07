const CACHE_VERSION = 'v26';
const STATIC_CACHE = `stryvfit-static-${CACHE_VERSION}`;
const PAGE_CACHE = `stryvfit-pages-${CACHE_VERSION}`;
const CORE_ROUTES = ['/', '/book', '/notes', '/meals', '/coach', '/admin/pulse'];
const APP_SHELL = [
  '/manifest.webmanifest',
  '/admin-manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/stryv-insignia.svg',
  '/stryv-logo.svg',
  '/stryv-logo-typography.svg',
  '/images/hero-training.jpg',
  '/fonts/projekt-blackbird.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
      caches.open(PAGE_CACHE).then((cache) => cache.addAll(CORE_ROUTES)),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, PAGE_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/admin-manifest.webmanifest' ||
    url.pathname === '/stryv-insignia.svg' ||
    url.pathname === '/stryv-logo.svg' ||
    url.pathname === '/stryv-logo-typography.svg'
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(request)) ||
      (CORE_ROUTES.includes(url.pathname) ? await cache.match(url.pathname) : null) ||
      caches.match('/book')
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
