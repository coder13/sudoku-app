import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-distant-neighbors.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#434 Distant Neighbors import passes its published solution through the Rust engine', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: source.solution,
  } }), 'unique')
})

test('#434 Distant Neighbors completes Import Preview with its source rules intact', async () => {
  const preview = await prepareImportedPuzzle(source.code)
  assert.equal(preview.format, 'Sudoku Coach')
  assert.equal(preview.game.variant?.solution, source.solution)
  assert.deepEqual(preview.game.variant?.puzzle.rules?.find(rule => rule.type === 'distant-neighbors'), {
    type: 'distant-neighbors', markedCells: [0, 4, 8, 36, 40, 44, 72, 76, 80],
  })
})
