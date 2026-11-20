import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import test from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import { futoshikiCatalog } from '../src/futoshiki/catalog.ts'
import { hidatoCatalog } from '../src/hidato/catalog.ts'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import { rulloCatalog } from '../src/rullo/catalog.ts'

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

test('each Kakuro puzzle has a precached board for direct and offline opens', async () => {
  for (const { id, puzzle } of kakuroCatalog) {
    const path = `/puzzles/kakuro/${id}/index.html`
    assert.ok(cached.has(path), `${id} has a precached shell`)
    const html = await readFile(new URL('.' + path, client), 'utf8')
    assert.ok(html.includes('aria-label="Kakuro board"'), `${id} prerenders its board`)
    assert.equal([...html.matchAll(/class="number-puzzle-cell"/g)].length, puzzle.cells.filter(cell => cell === null).length)
  }
})

test('each Calcudoku puzzle has a precached board', async () => {
  for (const { id, puzzle } of calcudokuCatalog) {
    const path = `/puzzles/calcudoku/${id}/index.html`
    assert.ok(cached.has(path), `${id} has a precached shell`)
    const html = await readFile(new URL('.' + path, client), 'utf8')
    assert.ok(html.includes('aria-label="Calcudoku board"'), `${id} prerenders its board`)
    assert.equal([...html.matchAll(/class="number-puzzle-cell"/g)].length, puzzle.size ** 2)
  }
})

test('generated Kakuro and Calcudoku links have precached shells and a generation worker', async () => {
  for (const game of ['kakuro', 'calcudoku']) {
    const path = `/puzzles/${game}/generated/index.html`
    assert.ok((await stat(new URL('.' + path, client))).isFile(), path)
    assert.ok(cached.has(path), path)
  }
  assert.ok(assets.some(path => /generation\.worker-[^/]+\.js$/.test(path)))
})

test('each Futoshiki puzzle precaches every inequality sign', async () => {
  for (const { id, puzzle } of futoshikiCatalog) {
    const path = `/puzzles/futoshiki/${id}/index.html`
    assert.ok(cached.has(path), `${id} has a precached shell`)
    const html = await readFile(new URL('.' + path, client), 'utf8')
    assert.ok(html.includes('aria-label="Futoshiki board"'), `${id} prerenders its board`)
    assert.equal([...html.matchAll(/class="futoshiki-sign"/g)].length, puzzle.inequalities.length)
  }
})

test('each Hidato puzzle precaches its playable cells and both endpoints', async () => {
  for (const { id, puzzle } of hidatoCatalog) {
    const path = `/puzzles/hidato/${id}/index.html`
    assert.ok(cached.has(path), `${id} has a precached shell`)
    const html = await readFile(new URL('.' + path, client), 'utf8')
    assert.ok(html.includes('aria-label="Hidato board"'), `${id} prerenders its board`)
    assert.equal([...html.matchAll(/class="number-puzzle-cell"/g)].length, puzzle.cells.length)
    assert.equal([...html.matchAll(/class="number-puzzle-endpoint"/g)].length, 2)
  }
})

test('each Rullo puzzle precaches its numbers and line targets', async () => {
  for (const { id, puzzle } of rulloCatalog) {
    const path = `/puzzles/rullo/${id}/index.html`
    assert.ok(cached.has(path), `${id} has a precached shell`)
    const html = await readFile(new URL('.' + path, client), 'utf8')
    assert.ok(html.includes('aria-label="Rullo board"'), `${id} prerenders its grid`)
    assert.equal([...html.matchAll(/class="number-puzzle-cell"/g)].length, puzzle.numbers.length)
    assert.equal([...html.matchAll(/class="rullo-target"/g)].length, 2 * puzzle.lines.length)
  }
})
