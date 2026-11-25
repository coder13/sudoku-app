import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-magic-square.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}

test('#423 Magic Square import passes the complete puzzle through the Rust engine', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: source.solution,
  } }), 'unique')
})
