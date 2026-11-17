import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  COLLECTIONS as CATALOG, collectionDifficulties, collectionProgress, collectionPuzzles, collectionPuzzleStatus,
  findCollectionGame, getGameCollection,
  nextCollectionPuzzle, type CollectionPuzzleInfo,
} from '../src/sudoku/collections.ts'
import { isCollectionReference } from '../src/sudoku/collection-reference.ts'
import { EMPTY, enter, makeGame, restartGame } from '../src/sudoku/game.ts'
import { openCollectionPuzzle, openNextCollectionPuzzle } from '../src/sudoku/collection-play.ts'
import { roomStore } from '../src/sudoku/storage.ts'
import { collectionDownloads } from '../src/sudoku/collection-downloads.ts'
import { collectionGridHash } from '../src/sudoku/collection-integrity.ts'
import { fullCollections as COLLECTIONS, puzzleResponse } from './collection-fixtures.ts'

const collection = COLLECTIONS[0]
const puzzle = collection.puzzles[0]
const reference = { collectionId: collection.id, puzzleId: puzzle.id }
// Independently published Nikoli solution, not derived from the stored catalog.
const solution = '745613928312987546986542137239168754174395682658724391527836419461259873893471265'

test('collection IDs and puzzle grids are unique, with explicit source licenses', () => {
  assert.equal(new Set(COLLECTIONS.map(set => set.id)).size, COLLECTIONS.length)
  const grids = new Set<string>()
  for (const set of COLLECTIONS) {
    assert.match(set.sourceRevision, /^[a-f0-9]{40}$/)
    assert.ok(set.creator && set.license && set.changes)
    assert.equal(new URL(set.sourceUrl).protocol, 'https:')
    assert.equal(new URL(set.licenseUrl).protocol, 'https:')
    assert.equal(new Set(set.puzzles.map(puzzle => puzzle.id)).size, set.puzzles.length)
    for (const puzzle of set.puzzles) {
      assert.ok(isCollectionReference({ collectionId: set.id, puzzleId: puzzle.id }))
      assert.match(puzzle.givens, /^[0-9]{81}$/)
      assert.ok(puzzle.title.length > 0 && puzzle.title.length <= 72)
      assert.ok(!grids.has(puzzle.givens), 'Repeated puzzle: ' + puzzle.id)
      grids.add(puzzle.givens)
    }
  }
  assert.equal(collection.puzzles.length, 100)
})

test('progress counts actual solved grids and recognizes earlier imports', () => {
  const original = makeGame('import', 'My title', puzzle.givens, 'imported')
  const playing = { ...enter(original, [1], 'value', 4), started: true }
  const solved = { ...playing, position: { ...playing.position, entries: solution } }
  assert.equal(collectionPuzzleStatus(puzzle, [original]), 'unplayed')
  assert.equal(collectionPuzzleStatus(puzzle, [playing]), 'in-progress')
  assert.equal(collectionPuzzleStatus(puzzle, [solved]), 'solved')
  assert.equal(collectionProgress(collection, [solved, solved]).solved, 1)
  assert.equal(collectionProgress(collection, [solved]).unplayed, 99)
  assert.equal(collectionPuzzleStatus(puzzle, [{ ...solved, source: 'draft' }]), 'unplayed')
  assert.equal(findCollectionGame(puzzle, [solved, playing]), playing)
})

test('credits require the catalog grid and survive a restart', () => {
  const game = { ...makeGame('collection', puzzle.title, puzzle.givens, 'collection'), collection: reference }
  assert.equal(getGameCollection(game)?.collection.id, collection.id)
  assert.deepEqual(restartGame(game).collection, reference)
  assert.equal(getGameCollection({ ...game, givens: EMPTY }), undefined)
  assert.equal(getGameCollection({ ...game, collection: { ...reference, puzzleId: 'missing' } }), undefined)
  assert.equal(getGameCollection({ ...game, source: 'draft' }), undefined)
  assert.equal(isCollectionReference({ collectionId: '../bad', puzzleId: 'x' }), false)
  assert.equal(isCollectionReference({ collectionId: collection.id, puzzleId: 12 }), false)
})

test('difficulty groups cover each catalog without mixing levels', () => {
  for (const collection of COLLECTIONS) {
    const difficulties = collectionDifficulties(collection)
    const grouped = difficulties.flatMap(difficulty => collectionPuzzles(collection, difficulty))
    assert.equal(grouped.length, collection.puzzles.length)
    assert.equal(new Set(grouped.map(puzzle => puzzle.id)).size, grouped.length)
    for (const difficulty of difficulties) {
      const puzzles = collectionPuzzles(collection, difficulty)
      assert.ok(puzzles.length > 0)
      assert.ok(puzzles.every(puzzle => puzzle.difficulty === difficulty))
      assert.equal(collectionProgress(collection, [], difficulty).unplayed, puzzles.length)
    }
  }
})

test('the client catalog contains metadata and zero bundled puzzle grids', () => {
  assert.ok(CATALOG.every(collection => collection.puzzles.every(puzzle => !('givens' in puzzle))))
  for (const full of COLLECTIONS) {
    for (const puzzle of full.puzzles) {
      assert.equal(puzzle.givensHash, collectionGridHash(puzzle.givens))
      assert.equal(puzzle.bytes, Buffer.byteLength(puzzle.givens))
      assert.ok(!JSON.stringify(CATALOG).includes(puzzle.givens))
    }
  }
  assert.equal(nextCollectionPuzzle(collection, [], 'easy', undefined, new Set()), undefined)
})

test('offline difficulty labels reflect the available puzzles', () => {
  assert.deepEqual(collectionDifficulties(collection, new Set()), [])
  const available = collection.puzzles.filter(puzzle => puzzle.difficulty === 'medium')
  assert.ok(available.length > 0)
  assert.deepEqual(collectionDifficulties(collection, new Set(available.map(puzzle => puzzle.id))), ['medium'])
})

test('the metadata catalog stays within 12 KiB compressed and 64 KiB uncompressed', () => {
  const data = Buffer.from(JSON.stringify(CATALOG))
  assert.ok(data.byteLength <= 64 * 1024, `Catalog is ${data.byteLength} bytes`)
  const compressed = gzipSync(data).byteLength
  assert.ok(compressed <= 12 * 1024, `Compressed catalog is ${compressed} bytes`)
})

test('next puzzle skips solved grids, stays in one difficulty, and stops when complete', () => {
  // Permute a published grid and its known solution to make distinct valid fixtures.
  const swap = (digits: string, digit: string) => [...digits].map(value => value === '1' ? digit : value === digit ? '1' : value).join('')
  const puzzles: (CollectionPuzzleInfo & { givens: string })[] = ['1', '2', '3', '4'].map((digit, index) => ({
    ...puzzle, id: `fixture-${index}`, difficulty: index === 3 ? 'hard' : 'easy', givens: swap(puzzle.givens, digit), givensHash: collectionGridHash(swap(puzzle.givens, digit)),
  }))
  const set = { ...collection, puzzles }
  const finished = puzzles.map((puzzle, index) => {
    const game = makeGame(`solved-${index}`, puzzle.title, puzzle.givens, 'imported')
    return { ...game, started: true, position: { ...game.position, entries: swap(solution, String(index + 1)) } }
  })
  assert.equal(nextCollectionPuzzle(set, [], 'easy')?.id, puzzles[0].id)
  assert.equal(nextCollectionPuzzle(set, [], 'easy', puzzles[0].id)?.id, puzzles[1].id)
  assert.equal(nextCollectionPuzzle(set, [finished[1]], 'easy', puzzles[0].id)?.id, puzzles[2].id)
  assert.equal(nextCollectionPuzzle(set, [finished[2]], 'easy', puzzles[2].id)?.id, puzzles[0].id)
  const unfinished = { ...makeGame('unfinished', puzzles[2].title, puzzles[2].givens, 'imported'), started: true }
  assert.equal(nextCollectionPuzzle(set, [unfinished], 'easy')?.id, puzzles[2].id)
  assert.deepEqual(collectionProgress(set, finished.slice(0, 3), 'easy'), { unplayed: 0, 'in-progress': 0, solved: 3 })
  assert.equal(nextCollectionPuzzle(set, finished.slice(0, 3), 'easy', puzzles[2].id), undefined)
  assert.equal(nextCollectionPuzzle(set, finished.slice(0, 3), 'hard')?.id, puzzles[3].id)

  const savedIds = new Set([puzzles[2].id])
  assert.deepEqual(collectionPuzzles(set, 'easy'), puzzles.slice(0, 3))
  assert.deepEqual(collectionPuzzles(set, 'easy', savedIds), [puzzles[2]])
  assert.equal(nextCollectionPuzzle(set, [], 'easy', undefined, savedIds)?.id, puzzles[2].id)
  assert.equal(nextCollectionPuzzle(set, [finished[2]], 'easy', puzzles[2].id, savedIds), undefined)
})

class MemoryStorage {
  get length() { return Object.keys(this).length }
  key(index: number) { return Object.keys(this)[index] ?? null }
  getItem(key: string) { return Object.hasOwn(this, key) ? String((this as unknown as Record<string, unknown>)[key]) : null }
  setItem(key: string, value: string) { Object.defineProperty(this, key, { value: String(value), writable: true, enumerable: true, configurable: true }) }
  removeItem(key: string) { delete (this as unknown as Record<string, unknown>)[key] }
}

test('save, open, reload, and reopen preserve one game and its progress', async () => {
  const originalFetch = globalThis.fetch
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
    window: { value: { addEventListener() {}, removeEventListener() {} }, configurable: true },
    fetch: { value: puzzleResponse, configurable: true },
  })
  const disconnect = roomStore.connect()
  const disconnectDownloads = collectionDownloads.connect()
  try {
    const offline = { online: false }
    await assert.rejects(openCollectionPuzzle(collection.id, puzzle.id, offline), /not available offline/)
    await collectionDownloads.download(collection, [puzzle])
    const saved = await openCollectionPuzzle(collection.id, puzzle.id, { ...offline, play: false })
    assert.equal(saved.added, true)
    assert.equal(roomStore.getSnapshot().active, null)
    assert.equal(roomStore.getSnapshot().games[0].savedForLater, true)
    const started = await openCollectionPuzzle(collection.id, puzzle.id, offline)
    assert.equal(started.id, saved.id)
    assert.equal(started.added, false)
    assert.equal(roomStore.getSnapshot().games.length, 1)
    assert.equal(roomStore.getSnapshot().games[0].savedForLater, undefined)
    roomStore.update(saved.id, game => ({ ...enter(game, [1], 'value', 4), started: true, elapsed: 93 }))
    const before = roomStore.getSnapshot().games[0]
    roomStore.connect()()
    assert.deepEqual(roomStore.getSnapshot().games[0], JSON.parse(JSON.stringify(before)))
    await openCollectionPuzzle(collection.id, puzzle.id, offline)
    const after = roomStore.getSnapshot().games[0]
    assert.deepEqual(after.position, before.position)
    assert.deepEqual(after.past, before.past)
    assert.equal(after.elapsed, 93)
    assert.equal(after.source, 'collection')
    assert.deepEqual(after.collection, reference)
    await assert.rejects(openCollectionPuzzle('missing', puzzle.id, offline))
    assert.equal(roomStore.getSnapshot().games.length, 1)

    // A malformed optional reference must not discard an otherwise valid game.
    local.setItem('sudoku-app:v1:game:' + after.id, JSON.stringify({ ...after, collection: { puzzleId: 7 } }))
    roomStore.connect()()
    assert.equal(roomStore.getSnapshot().games[0].collection, undefined)
    assert.equal(roomStore.getSnapshot().games[0].elapsed, 93)

    roomStore.remove(after.id)
    const imported = { ...makeGame('older-import', 'My custom title', puzzle.givens, 'imported'), started: true, elapsed: 21 }
    roomStore.add(imported)
    assert.equal((await openCollectionPuzzle(collection.id, puzzle.id, offline)).id, imported.id)
    assert.equal(roomStore.getSnapshot().games.length, 1)
    assert.equal(roomStore.getSnapshot().games[0].title, imported.title)
    assert.equal(roomStore.getSnapshot().games[0].elapsed, 21)

    const next = nextCollectionPuzzle(collection, roomStore.getSnapshot().games, puzzle.difficulty!, puzzle.id)!
    const savedNext = { ...enter(makeGame('next-import', 'Continue this game', next.givens, 'imported'),
      [next.givens.indexOf('0')], 'candidate', 2), started: true, savedForLater: true, elapsed: 42 }
    roomStore.add(savedNext)
    roomStore.update(imported.id, game => ({ ...game, difficulty: 'extreme', position: { ...game.position, entries: solution } }))
    // Use the catalog difficulty even if the player's rating labels differ.
    assert.equal((await openNextCollectionPuzzle(imported.id, offline))?.id, savedNext.id)
    const resumed = roomStore.getSnapshot().games.find(game => game.id === savedNext.id)!
    assert.equal(roomStore.getSnapshot().active, savedNext.id)
    assert.deepEqual(resumed.position, savedNext.position)
    assert.deepEqual(resumed.past, savedNext.past)
    assert.equal(resumed.elapsed, 42)
    assert.equal(resumed.savedForLater, undefined)
    assert.deepEqual(resumed.collection, { collectionId: collection.id, puzzleId: next.id })
    await openNextCollectionPuzzle(imported.id, offline)
    assert.equal(roomStore.getSnapshot().games.length, 2)
    await assert.rejects(openNextCollectionPuzzle('missing', offline))

    roomStore.remove(savedNext.id)
    assert.equal(await openNextCollectionPuzzle(imported.id, offline), undefined)
    const online = await openNextCollectionPuzzle(imported.id, { online: true })
    assert.equal(roomStore.getSnapshot().active, online?.id)
    const fetched = roomStore.getSnapshot().games.find(game => game.id === online?.id)
    assert.equal(fetched?.givens, next.givens)
    assert.equal(fetched?.collection?.puzzleId, next.id)
    assert.deepEqual(Object.keys(collectionDownloads.getSnapshot()[collection.id]), [puzzle.id])
    assert.equal((await openNextCollectionPuzzle(imported.id, offline))?.id, fetched?.id)
  } finally {
    disconnect()
    disconnectDownloads()
    Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true })
    for (const key of ['window', 'localStorage', 'sessionStorage']) Reflect.deleteProperty(globalThis, key)
  }
})
