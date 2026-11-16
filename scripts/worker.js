// A worker serves one build at a time and activates as soon as its cache is ready.
const cachedPaths = new Set(assets)
const shellPrefixes = ['sudoku-app-shell-', 'gridroom-shell-']

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(cacheName).then((cache) =>
      cache.addAll(assets.map((asset) => new Request(asset, { cache: 'reload' })))),
    self.skipWaiting(),
  ]))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key !== cacheName && shellPrefixes.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  const path = event.request.mode === 'navigate' && url.pathname === '/' ? '/index.html' : url.pathname
  if (!cachedPaths.has(path)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    return (await cache.match(path)) ?? fetch(event.request)
  })())
})
