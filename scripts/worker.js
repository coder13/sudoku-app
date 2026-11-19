// A worker serves one build at a time and waits for the app to approve an update.
const cachedPaths = new Set(assets)
// Static hosts serve prerendered index files at their directory URLs.
const cachePath = (path) => path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path
const shellPrefixes = ['sudoku-app-shell-', 'gridroom-shell-']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll(assets.map((asset) => new Request(cachePath(asset), { cache: 'reload' })))))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
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
  const indexPath = `${url.pathname.replace(/\/$/, '')}/index.html`
  const path = event.request.mode === 'navigate' && cachedPaths.has(indexPath) ? indexPath : url.pathname
  if (!cachedPaths.has(path)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    return (await cache.match(cachePath(path))) ?? fetch(event.request)
  })())
})
