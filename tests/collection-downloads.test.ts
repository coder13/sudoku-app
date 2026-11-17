import assert from 'node:assert/strict'
import test from 'node:test'
import { collectionDownloadBytes, collectionDownloadUrl, createCollectionDownloadStore } from '../src/sudoku/collection-downloads.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { fullCollections, MemoryStorage, puzzleResponse } from './collection-fixtures.ts'

const collection = fullCollections[0]
const puzzles = collection.puzzles.slice(0, 7)
Object.defineProperty(globalThis, 'window', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true })

test('zero default downloads, exact chosen batches, no repeats, and offline reload', async () => {
  const storage = new MemoryStorage()
  const urls: string[] = []
  const store = createCollectionDownloadStore(() => storage, async url => {
    urls.push(String(url))
    return puzzleResponse(url)
  })
  const disconnect = store.connect()
  assert.deepEqual(store.grids(collection), {})
  assert.equal(urls.length, 0)
  assert.equal(await store.download(collection, puzzles.slice(0, 3)), 3)
  assert.deepEqual(urls, puzzles.slice(0, 3).map(puzzle => collectionDownloadUrl(collection, puzzle)))
  assert.equal(collectionDownloadBytes(puzzles.slice(0, 3)), 243)
  assert.equal(Object.keys(store.grids(collection)).length, 3)
  assert.equal(await store.download(collection, puzzles.slice(0, 5)), 2)
  assert.equal(urls.length, 5)
  assert.equal(await store.download(collection, puzzles.slice(0, 5)), 0)
  assert.equal(urls.length, 5)
  disconnect()

  const offline = createCollectionDownloadStore(() => storage, async () => { throw new TypeError('Offline') })
  const close = offline.connect()
  assert.deepEqual(offline.grids(collection), Object.fromEntries(puzzles.slice(0, 5).map(puzzle => [puzzle.id, puzzle.givens])))
  assert.equal(await offline.download(collection, puzzles.slice(0, 5)), 0)
  await assert.rejects(offline.download(collection, puzzles), /Connect to the internet/)
  assert.equal(Object.keys(offline.grids(collection)).length, 5)
  close()
})

test('an interrupted or invalid batch saves nothing and can be retried', async () => {
  const storage = new MemoryStorage()
  let bad = true
  const store = createCollectionDownloadStore(() => storage, async url => bad
    ? String(url).includes(puzzles[1].id) ? new Response('not a grid') : puzzleResponse(url)
    : puzzleResponse(url))
  await assert.rejects(store.download(collection, puzzles), /invalid/)
  assert.equal(storage.values.size, 0)
  assert.deepEqual(store.grids(collection), {})
  bad = false
  const abort = new AbortController()
  await assert.rejects(store.download(collection, puzzles, { signal: abort.signal, onProgress: done => { if (done === 1) abort.abort() } }), { name: 'AbortError' })
  assert.equal(storage.values.size, 0)
  assert.deepEqual(store.grids(collection), {})
  assert.equal(await store.download(collection, puzzles), puzzles.length)
  assert.equal(Object.keys(store.grids(collection)).length, puzzles.length)
})

test('storage failures preserve earlier downloads and never report new puzzles as offline', async () => {
  const storage = new MemoryStorage()
  let full = false
  const store = createCollectionDownloadStore(() => ({
    getItem: key => storage.getItem(key),
    setItem: (key, value) => { if (full) throw new Error('Quota'); storage.setItem(key, value) },
  }), puzzleResponse)
  await store.download(collection, puzzles.slice(0, 1))
  full = true
  await assert.rejects(store.download(collection, puzzles), /could not be saved/)
  assert.deepEqual(store.grids(collection), { [puzzles[0].id]: puzzles[0].givens })
  full = false
  assert.equal(await store.download(collection, puzzles), puzzles.length - 1)
})

test('previously saved games remain available without downloads or progress changes', async () => {
  const game = { ...makeGame('legacy', 'My title', puzzles[0].givens, 'collection'), started: true, elapsed: 42,
    collection: { collectionId: collection.id, puzzleId: puzzles[0].id } }
  const before = structuredClone(game)
  const urls: string[] = []
  const store = createCollectionDownloadStore(() => new MemoryStorage(), async url => { urls.push(String(url)); return puzzleResponse(url) })
  assert.deepEqual(store.grids(collection, [game]), { [puzzles[0].id]: puzzles[0].givens })
  assert.equal(await store.download(collection, puzzles.slice(0, 1), { games: [game] }), 0)
  assert.equal(urls.length, 0)
  assert.deepEqual(game, before)
})

test('corrupt saved grids are excluded and only missing puzzles are fetched again', async () => {
  const storage = new MemoryStorage()
  const first = createCollectionDownloadStore(() => storage, puzzleResponse)
  await first.download(collection, puzzles.slice(0, 2))
  const [key, raw] = [...storage.values.entries()][0]
  storage.setItem(key, JSON.stringify({ ...JSON.parse(raw), [puzzles[0].id]: '0'.repeat(81) }))
  const urls: string[] = []
  const reloaded = createCollectionDownloadStore(() => storage, async url => { urls.push(String(url)); return puzzleResponse(url) })
  const close = reloaded.connect()
  assert.equal(Object.keys(reloaded.grids(collection)).length, 1)
  assert.equal(await reloaded.download(collection, puzzles.slice(0, 2)), 1)
  assert.deepEqual(urls, [collectionDownloadUrl(collection, puzzles[0])])
  close()
})

test('a double click cannot start a second overlapping batch', async () => {
  const storage = new MemoryStorage()
  let proceed!: () => void
  const gate = new Promise<void>(resolve => { proceed = resolve })
  const store = createCollectionDownloadStore(() => storage, async url => { await gate; return puzzleResponse(url) })
  const pending = store.download(collection, puzzles.slice(0, 2))
  await assert.rejects(store.download(collection, puzzles), /in progress/)
  proceed()
  assert.equal(await pending, 2)
  assert.equal(Object.keys(store.grids(collection)).length, 2)
})
