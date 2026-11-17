import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import test from 'node:test'

// Run after Vite build and scripts/build-offline.mjs. Compare the actual build
// with the generated router inventory so new static routes cannot be omitted.
const client = new URL('../dist/client/', import.meta.url)
const worker = await readFile(new URL('sw.js', client), 'utf8')
const assets: string[] = JSON.parse(worker.match(/^const assets = (.+)$/m)![1])
const cached = new Set(assets.map(path => decodeURIComponent(path)))

test('every static application route has a prerendered, precached offline shell', async () => {
  const generated = await readFile(new URL('../src/routeTree.gen.ts', import.meta.url), 'utf8')
  const paths = generated.match(/export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(paths, 'Generated router inventory is available')
  const routes = [...new Set([...paths.matchAll(/^\s+'([^']+)':/gm)].map(match => match[1]).filter(path => !path.includes('$')))]
  assert.ok(routes.length > 0, 'Static routes were discovered')
  for (const route of routes) {
    const html = route.replace(/\/$/, '') + '/index.html'
    assert.ok(cached.has(html), `${route} must have a precached ${html}`)
    assert.ok((await stat(new URL('.' + html, client))).isFile(), `${route} has a generated HTML shell`)
  }
})

test('all generated HTML shells are precached and every cached asset exists', async () => {
  for (const path of await readdir(client, { recursive: true })) {
    if (path.endsWith('.html')) assert.ok(cached.has('/' + path.replaceAll('\\', '/')), `${path} is precached`)
  }
  assert.equal(cached.size, assets.length, 'Precache entries are unique')
  assert.ok(!assets.some(path => path.startsWith('/collections/') || path.endsWith('.map')))
  for (const asset of cached) assert.ok((await stat(new URL('.' + asset, client))).isFile(), `${asset} exists`)
})

test('the offline shell includes the same engine binary as the validated source artifact', async () => {
  const packaged = assets.filter(path => path.endsWith('.wasm'))
  assert.equal(packaged.length, 1)
  assert.deepEqual(await readFile(new URL('.' + packaged[0], client)), await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url)))
})
