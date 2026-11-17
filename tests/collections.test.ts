import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  COLLECTIONS, collectionDifficulties, collectionProgress, collectionPuzzles, collectionPuzzleStatus, collectionSelection,
  discoverCollections, findCollectionGame, getGameCollection,
  nextCollectionPuzzle, type CollectionPuzzle,
} from '../src/sudoku/collections.ts'
import { isCollectionReference } from '../src/sudoku/collection-reference.ts'
import { EMPTY, enter, makeGame, restartGame } from '../src/sudoku/game.ts'
import { openCollectionPuzzle, openNextCollectionPuzzle } from '../src/sudoku/collection-play.ts'
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

test('the handmade starter selection has six puzzles per difficulty without copying or losing catalog entries', () => {
  const starter = collectionSelection(collection, 'starter')
  assert.equal(collection.kind, 'handmade')
  assert.equal(starter.length, 18)
  assert.equal(new Set(collection.starterPuzzleIds).size, 18)
  assert.deepEqual(starter.map(puzzle => puzzle.id), collection.starterPuzzleIds)
  assert.ok(starter.every(puzzle => collection.puzzles.includes(puzzle)))
  const full = collectionSelection(collection)
  assert.equal(full.length, collection.puzzles.length)
  assert.equal(new Set(full.map(puzzle => puzzle.id)).size, full.length)
  for (const difficulty of collectionDifficulties(collection)) {
    const first = collectionPuzzles(collection, difficulty, 'starter')
    assert.equal(first.length, 6)
    assert.deepEqual(collectionPuzzles(collection, difficulty).slice(0, 6), first)
    assert.equal(collectionProgress(collection, [], difficulty, 'starter').unplayed, 6)
  }
})

test('discovery starts with handmade puzzles and retains previously opened collections', () => {
  assert.ok(discoverCollections([]).every(collection => collection.kind === 'handmade'))
  assert.deepEqual(discoverCollections([], true), COLLECTIONS)
  const legacy = COLLECTIONS.find(collection => collection.kind === 'generated')!
  const puzzle = legacy.puzzles[0]
  const saved = { ...makeGame('legacy', puzzle.title, puzzle.givens, 'collection'),
    collection: { collectionId: legacy.id, puzzleId: puzzle.id } }
  assert.ok(discoverCollections([saved]).includes(legacy))
  assert.ok(!discoverCollections([{ ...saved, givens: EMPTY }]).includes(legacy))
})

test('the offline catalog stays within 12 KiB compressed and 64 KiB uncompressed', () => {
  const data = Buffer.from(JSON.stringify(COLLECTIONS))
  assert.ok(data.byteLength <= 64 * 1024, `Catalog is ${data.byteLength} bytes`)
  const compressed = gzipSync(data).byteLength
  assert.ok(compressed <= 12 * 1024, `Compressed catalog is ${compressed} bytes`)
})

test('next puzzle skips solved grids, stays in one difficulty, and stops when complete', () => {
  // Permute a published grid and its known solution to make distinct valid fixtures.
  const swap = (digits: string, digit: string) => [...digits].map(value => value === '1' ? digit : value === digit ? '1' : value).join('')
  const puzzles: CollectionPuzzle[] = ['1', '2', '3', '4'].map((digit, index) => ({
    ...puzzle, id: `fixture-${index}`, difficulty: index === 3 ? 'hard' : 'easy', givens: swap(puzzle.givens, digit),
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

  const curated = { ...set, starterPuzzleIds: [puzzles[2].id, puzzles[0].id] }
  assert.equal(nextCollectionPuzzle(curated, [], 'easy')?.id, puzzles[2].id)
  assert.equal(nextCollectionPuzzle(curated, [finished[2]], 'easy', puzzles[2].id)?.id, puzzles[0].id)
  // Completing the small starter set continues into the rest of the same difficulty.
  assert.equal(nextCollectionPuzzle(curated, [finished[2], finished[0]], 'easy', puzzles[0].id)?.id, puzzles[1].id)
  assert.equal(nextCollectionPuzzle(curated, finished.slice(0, 3), 'easy', puzzles[1].id), undefined)
  assert.equal(collectionProgress(curated, [finished[2], finished[0]], 'easy', 'starter').solved, 2)
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

    const next = nextCollectionPuzzle(collection, roomStore.getSnapshot().games, puzzle.difficulty!, puzzle.id)!
    const savedNext = { ...enter(makeGame('next-import', 'Continue this game', next.givens, 'imported'),
      [next.givens.indexOf('0')], 'candidate', 2), started: true, savedForLater: true, elapsed: 42 }
    roomStore.add(savedNext)
    roomStore.update(imported.id, game => ({ ...game, difficulty: 'extreme', position: { ...game.position, entries: solution } }))
    // Use the catalog difficulty even if the player's rating labels differ.
    assert.equal(openNextCollectionPuzzle(imported.id)?.id, savedNext.id)
    const resumed = roomStore.getSnapshot().games.find(game => game.id === savedNext.id)!
    assert.equal(roomStore.getSnapshot().active, savedNext.id)
    assert.deepEqual(resumed.position, savedNext.position)
    assert.deepEqual(resumed.past, savedNext.past)
    assert.equal(resumed.elapsed, 42)
    assert.equal(resumed.savedForLater, undefined)
    assert.deepEqual(resumed.collection, { collectionId: collection.id, puzzleId: next.id })
    openNextCollectionPuzzle(imported.id)
    assert.equal(roomStore.getSnapshot().games.length, 2)
    assert.throws(() => openNextCollectionPuzzle('missing'))
  } finally {
    disconnect()
    for (const key of ['window', 'localStorage', 'sessionStorage']) Reflect.deleteProperty(globalThis, key)
  }
})
