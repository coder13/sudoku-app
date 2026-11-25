import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples.find(
  (example: { url: string }) => example.url.endsWith('/LEjN'),
) as { code: string; solution: string }

test('#168 imports all Entropic Spiral breaks and enforces the unique published solution', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.equal(imported.title, 'Entropic Spiral')
  const rules = imported.variant.puzzle.rules ?? []
  assert.equal(rules.filter(rule => rule.type === 'entropic').length, 18)
  const breaks = rules.filter(rule => rule.type === 'forbidden-entropic-connection')
  assert.equal(breaks.length, 16)
  assert.deepEqual(breaks[0], { type: 'forbidden-entropic-connection', cells: [31, 32, 33, 42] })
  assertVariantCompletion(imported.variant.puzzle, source.solution)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle, entries: source.solution,
  } }), 'unique')
})

test('the negative rule rejects a connection that both positive-only line fragments permit', async () => {
  const entries = Array(81).fill('0')
  for (const [cell, digit] of [[30, 1], [31, 4], [32, 7], [33, 2], [42, 5], [51, 8]]) entries[cell] = String(digit)
  const positiveOnly: VariantPuzzle = {
    version: 1, givens: '0'.repeat(81),
    rules: [
      { type: 'entropic', cells: [30, 31, 32] },
      { type: 'entropic', cells: [33, 42, 51] },
    ],
  }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: positiveOnly, entries: entries.join(''),
  }, maxNodes: 10_000 }), 'multiple')
  const withBreak: VariantPuzzle = { ...positiveOnly,
    rules: [...positiveOnly.rules!, { type: 'forbidden-entropic-connection', cells: [31, 32, 33, 42] }],
  }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: withBreak, entries: entries.join(''),
  }, maxNodes: 10_000 }), 'conflict')
})
