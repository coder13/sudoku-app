import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { fullCollections as COLLECTIONS } from './collection-fixtures.ts'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResult, EngineResponse } from '../src/sudoku/engine.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'
import { roomStore } from '../src/sudoku/storage.ts'
import { collectionDownloads } from '../src/sudoku/collection-downloads.ts'
import { openCollectionPuzzle, openNextCollectionPuzzle } from '../src/sudoku/collection-play.ts'
import { collectionPuzzleStatus, findCollectionGame, getGameCollection } from '../src/sudoku/collections.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { puzzleResponse } from './collection-fixtures.ts'
import { enter, valuesOf } from '../src/sudoku/game.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'

const handle = createEngineHandler(async () => {
  const bytes = await readFile(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  return (await WebAssembly.instantiate(bytes)).instance.exports as unknown as EngineExports
})
let id = 0
async function run<T extends EngineRequest>(request: T): Promise<EngineResult<T>> {
  const result = await handle({ id: ++id, request })
  assert.ok('value' in result, JSON.stringify(result))
  return result.value as EngineResult<T>
}

const globals = ['Worker', 'window', 'localStorage', 'sessionStorage', 'fetch'] as const
const original = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
before(() => {
  class TestWorker {
    onmessage?: (message: { data: EngineResponse }) => void
    postMessage(message: { id: number; request: EngineRequest }) {
      void handle(message).then(data => this.onmessage?.({ data }))
    }
    terminate() {}
  }
  Object.defineProperties(globalThis, {
    Worker: { value: TestWorker, configurable: true },
    window: { value: { addEventListener() {}, removeEventListener() {} }, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
    fetch: { value: puzzleResponse, configurable: true },
  })
})
after(() => globals.forEach((key, index) => {
  if (original[index]) Object.defineProperty(globalThis, key, original[index]!)
  else Reflect.deleteProperty(globalThis, key)
}))

test('every added variant starts offline, preserves progress after reload, and keeps source credits', async () => {
  const close = roomStore.connect()
  const closeDownloads = collectionDownloads.connect()
  try {
    for (const collection of COLLECTIONS.filter(collection => collection.variant !== 'classic')) {
      const puzzle = collection.puzzles[0]
      await collectionDownloads.download(collection, [puzzle])
      const opened = await openCollectionPuzzle(collection.id, puzzle.id, { online: false })
      let game = roomStore.getSnapshot().games.find(game => game.id === opened.id)!
      assert.deepEqual(game.variant?.puzzle, puzzle.puzzle)
      assert.equal(getGameCollection(game)?.collection.id, collection.id)
      assert.equal(findCollectionGame(collection.puzzles[1], [game]), undefined)
      const masks = await playCandidates(game)
      assert.ok(masks)
      const cell = game.givens.indexOf('0')
      const digit = Number(game.variant!.solution[cell])
      assert.ok(masks[cell] & (1 << (digit - 1)))
      roomStore.update(game.id, current => ({ ...enter(current, [cell], 'value', digit), started: true, elapsed: 37 }))
      const before = roomStore.getSnapshot().games.find(current => current.id === game.id)!
      assert.equal(collectionPuzzleStatus(puzzle, [before]), 'in-progress')
      roomStore.connect()()
      assert.deepEqual((await openCollectionPuzzle(collection.id, puzzle.id, { online: false })), { id: game.id, added: false })
      game = roomStore.getSnapshot().games.find(current => current.id === game.id)!
      assert.deepEqual(game.variant, before.variant)
      assert.deepEqual(game.position, before.position)
      assert.deepEqual(game.past, before.past)
      assert.equal(game.elapsed, 37)
      assert.equal(valuesOf(game)[cell], String(digit))
      roomStore.update(game.id, current => ({ ...current, position: { ...current.position, entries: current.variant!.solution } }))
      assert.equal(collectionPuzzleStatus(puzzle, roomStore.getSnapshot().games), 'solved')
      assert.equal(await openNextCollectionPuzzle(game.id, { online: false }), undefined)
    }
  } finally { close(); closeDownloads() }
})

test('every collection puzzle has one solution and a complete logical solve at its published app rating', async () => {
  const { difficultyOrder } = await run({ type: 'techniques' })
  const classic = await run({ type: 'techniques' })
  const variant = await run({ type: 'techniques', variant: true })
  const variantOrder = variantTechniqueOrder(variant.defaultOrder, difficultyOrder,
    Object.fromEntries([...classic.techniques, ...variant.techniques].map(t => [t.id, t.difficulty])))
  for (const collection of COLLECTIONS) {
    for (const puzzle of collection.puzzles) {
      if (puzzle.puzzle) {
        const position = { puzzle: puzzle.puzzle }
        assert.equal(await run({ type: 'variant', operation: 'analyze', position }), 'unique', puzzle.title)
        const rating = await run({ type: 'variant', operation: 'rate', position, techniqueOrder: variantOrder })
        assert.deepEqual(rating.status, { solved: puzzle.difficulty }, puzzle.title)
        assert.equal(rating.points, puzzle.points, puzzle.title)
        assert.equal(rating.hardest, puzzle.hardestTechnique, puzzle.title)
        assert.equal(rating.scoringVersion, puzzle.scoringVersion, puzzle.title)
        continue
      }
      assert.equal(await run({ type: 'analyze', values: puzzle.givens }), 'unique', puzzle.title)
      const rating = await run({ type: 'rate', values: puzzle.givens, techniqueOrder: difficultyOrder })
      assert.notEqual(rating.status, 'stalled', puzzle.title)
      assert.deepEqual(rating.status, { solved: puzzle.difficulty }, puzzle.title)
      assert.equal(rating.score.points, puzzle.points, puzzle.title)
      assert.equal(rating.score.hardest, puzzle.hardestTechnique, puzzle.title)
      assert.equal(rating.scoringVersion, puzzle.scoringVersion, puzzle.title)
    }
  }
})
