const CACHE_VERSION = 'moroccan-os-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

// Financial and operational data always remains network-only. The worker is
// intentionally limited to installation lifecycle support so stale business
// data can never be displayed from a cache.
