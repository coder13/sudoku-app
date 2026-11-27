import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { coachCode } from './helpers/coach-code.ts'

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

test('#168 preserves its broken joins with a Ratio companion in Wasm', async () => {
  const data = await decodeSudokuCoachPayload(source.code)
  const pair = Array.from({ length: 81 }, (_, cell) => cell).flatMap(cell => {
    const row = Math.floor(cell / 9), column = cell % 9
    return [row < 8 ? cell + 9 : -1, column < 8 ? cell + 1 : -1]
      .filter(other => other >= 0 && (Number(source.solution[cell]) === 2 * Number(source.solution[other]) ||
        Number(source.solution[other]) === 2 * Number(source.solution[cell])))
      .map(other => [cell, other] as [number, number])
  })[0]
  assert.ok(pair)
  const ratio = { type: 'ratio', segments: [{ cells: pair, parameters: {} }] }
  const imported = await detectPuzzle(coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] }))
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'forbidden-entropic-connection').length, 16)
  assert.ok(imported.variant?.puzzle.rules?.some(rule => rule.type === 'kropki' &&
    rule.ratioTwo?.pairs.some(([a, b]) => a === pair[0] && b === pair[1])))
  assertVariantCompletion(imported.variant!.puzzle, source.solution)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant!.puzzle, entries: source.solution,
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
