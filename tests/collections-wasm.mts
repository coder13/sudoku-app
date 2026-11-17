import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fullCollections as COLLECTIONS } from './collection-fixtures.ts'
import { createEngineHandler, type EngineExports } from '../src/sudoku/engine-protocol.ts'
import type { EngineRequest, EngineResult } from '../src/sudoku/engine.ts'

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

test('every collection puzzle has one solution and a complete logical solve at its published app rating', async () => {
  const { defaultOrder } = await run({ type: 'techniques' })
  for (const collection of COLLECTIONS) {
    for (const puzzle of collection.puzzles) {
      assert.equal(await run({ type: 'analyze', values: puzzle.givens }), 'unique', puzzle.title)
      const rating = await run({ type: 'rate', values: puzzle.givens, techniqueOrder: defaultOrder })
      assert.notEqual(rating.status, 'stalled', puzzle.title)
      assert.deepEqual(rating.status, { solved: puzzle.difficulty }, puzzle.title)
      assert.equal(rating.score.points, puzzle.points, puzzle.title)
      assert.equal(rating.scoringVersion, puzzle.scoringVersion, puzzle.title)
    }
  }
})
