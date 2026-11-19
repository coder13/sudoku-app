import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('the app verifies a Latin Square with an authored extra region in Wasm', async () => {
  const solution = Array.from({ length: 81 }, (_, cell) => (Math.floor(cell / 9) + cell % 9) % 9 + 1).join('')
  const givens = solution.slice(0, 40) + '0' + solution.slice(41)
  const code = coachCode({ givenDigits: givens, regions: [], givenConstraints: [
    { type: 'region', segments: [{ cells: Array.from({ length: 9 }, (_, i) => i * 10) }] },
  ] })
  const { game } = await prepareImportedPuzzle(code)
  assert.equal(game.variant?.solution, solution)
  assert.deepEqual(game.variant.puzzle.regions, { type: 'latin-square' })
  assert.match(game.title, /Latin Square/)
})
