// MileMarker service worker — hand-rolled, no build step.
// Strategy:
//   • App shell + icons: precached on install.
//   • Navigations: network-first, fall back to cached index.html (SPA offline).
//   • API GETs: network-first, fall back to last-cached response (read offline).
//   • Static assets (hashed JS/CSS, images): stale-while-revalidate.
//   • Non-GET (POST/PUT/DELETE): passed straight to the network, never cached.
// Bump CACHE to invalidate everything on the next activation.
const CACHE = 'milemarker-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/maskable-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GET is cacheable; let writes hit the network untouched so they surface
  // real online/offline errors instead of a stale success.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Only handle same-origin traffic; leave cross-origin requests to the browser.
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl)
      if (fallback) return fallback
    }
    throw err
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || network
}
