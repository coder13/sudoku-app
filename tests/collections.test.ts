import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLECTIONS, collectionProgress, collectionPuzzleStatus, findCollectionGame, getGameCollection,
} from '../src/sudoku/collections.ts'
import { isCollectionReference } from '../src/sudoku/collection-reference.ts'
import { EMPTY, enter, makeGame, restartGame } from '../src/sudoku/game.ts'
import { openCollectionPuzzle } from '../src/sudoku/collection-play.ts'
import { roomStore } from '../src/sudoku/storage.ts'

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

class MemoryStorage {
  get length() { return Object.keys(this).length }
  key(index: number) { return Object.keys(this)[index] ?? null }
  getItem(key: string) { return Object.hasOwn(this, key) ? String((this as unknown as Record<string, unknown>)[key]) : null }
  setItem(key: string, value: string) { Object.defineProperty(this, key, { value: String(value), writable: true, enumerable: true, configurable: true }) }
  removeItem(key: string) { delete (this as unknown as Record<string, unknown>)[key] }
}

test('save, open, reload, and reopen preserve one game and its progress', async () => {
  const local = new MemoryStorage()
  Object.defineProperties(globalThis, {
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
    window: { value: { addEventListener() {}, removeEventListener() {} }, configurable: true },
  })
  const disconnect = roomStore.connect()
  try {
    const saved = openCollectionPuzzle(collection.id, puzzle.id, false)
    assert.equal(saved.added, true)
    assert.equal(roomStore.getSnapshot().active, null)
    assert.equal(roomStore.getSnapshot().games[0].savedForLater, true)
    const started = openCollectionPuzzle(collection.id, puzzle.id)
    assert.equal(started.id, saved.id)
    assert.equal(started.added, false)
    assert.equal(roomStore.getSnapshot().games.length, 1)
    assert.equal(roomStore.getSnapshot().games[0].savedForLater, undefined)
    roomStore.update(saved.id, game => ({ ...enter(game, [1], 'value', 4), started: true, elapsed: 93 }))
    const before = roomStore.getSnapshot().games[0]
    roomStore.connect()()
    assert.deepEqual(roomStore.getSnapshot().games[0], JSON.parse(JSON.stringify(before)))
    openCollectionPuzzle(collection.id, puzzle.id)
    const after = roomStore.getSnapshot().games[0]
    assert.deepEqual(after.position, before.position)
    assert.deepEqual(after.past, before.past)
    assert.equal(after.elapsed, 93)
    assert.equal(after.source, 'collection')
    assert.deepEqual(after.collection, reference)
    assert.throws(() => openCollectionPuzzle('missing', puzzle.id))
    assert.equal(roomStore.getSnapshot().games.length, 1)

    // A malformed optional reference must not discard an otherwise valid game.
    local.setItem('sudoku-app:v1:game:' + after.id, JSON.stringify({ ...after, collection: { puzzleId: 7 } }))
    roomStore.connect()()
    assert.equal(roomStore.getSnapshot().games[0].collection, undefined)
    assert.equal(roomStore.getSnapshot().games[0].elapsed, 93)

    roomStore.remove(after.id)
    const imported = { ...makeGame('older-import', 'My custom title', puzzle.givens, 'imported'), started: true, elapsed: 21 }
    roomStore.add(imported)
    assert.equal(openCollectionPuzzle(collection.id, puzzle.id).id, imported.id)
    assert.equal(roomStore.getSnapshot().games.length, 1)
    assert.equal(roomStore.getSnapshot().games[0].title, imported.title)
    assert.equal(roomStore.getSnapshot().games[0].elapsed, 21)
  } finally {
    disconnect()
    for (const key of ['window', 'localStorage', 'sessionStorage']) Reflect.deleteProperty(globalThis, key)
  }
})
