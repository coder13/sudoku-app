import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hasUniquenessProof } from '../src/sudoku/game.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-unknown-cage-totals.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#433 unknown cage totals and C links are enforced by the Rust engine', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle: imported.variant.puzzle,
  } })
  assert.ok(candidates && candidates.length === 81 && candidates.every(mask => mask > 0))
  const position = { puzzle: imported.variant.puzzle, entries: source.solution }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position }), 'unique')
  const altered = [...source.solution].map(digit => String(Number(digit) % 9 + 1)).join('')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { ...position, entries: altered } }), 'conflict')
})

test('#433 Unknown Cages completes Import Preview with its parity clues and author answer', async () => {
  const preview = await prepareImportedPuzzle(source.code)
  assert.equal(preview.format, 'Sudoku Coach')
  assert.equal(preview.game.variant?.solution, source.solution)
  assert.equal(hasUniquenessProof(preview.game), false)
  assert.ok(preview.game.variant?.puzzle.rules?.some(rule => rule.type === 'unknown-cage-sums'))
  assert.equal(preview.game.variant?.puzzle.rules?.filter(rule => rule.type === 'parity').length, 2)
})
