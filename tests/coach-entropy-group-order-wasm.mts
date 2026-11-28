import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { coachCode } from './helpers/coach-code.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples.find(
  (example: { url: string }) => example.url.endsWith('/7nms'),
) as { code: string; solution: string }

test('#169 imports all seven outside digit-order clues and enforces them in Wasm', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  const rules = imported.variant.puzzle.rules ?? []
  const orders = rules.filter(rule => rule.type === 'digit-order')
  assert.equal(orders.length, 7)
  assert.equal(rules.filter(rule => rule.type === 'global-entropy').length, 1)
  assert.ok(rules.some(rule => rule.type === 'entropic'))

  for (const rule of orders) {
    if (rule.type !== 'digit-order') continue
    const selected = rule.cells.map(cell => Number(source.solution[cell])).filter(digit => rule.digits.includes(digit))
    assert.deepEqual(selected, rule.digits)
  }

  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
  } }), 'unique')
  const reversed = structuredClone(imported.variant.puzzle)
  const firstOrder = reversed.rules?.find(rule => rule.type === 'digit-order')
  assert.ok(firstOrder?.type === 'digit-order')
  firstOrder.cells.reverse()
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: reversed, entries: source.solution,
  } }), 'conflict')
})

test('#169 preserves its outside digit orders with a Ratio companion in Wasm', async () => {
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
  assert.ok(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'digit-order').length === 7)
  assert.ok(imported.variant?.puzzle.rules?.some(rule => rule.type === 'kropki' &&
    rule.ratioTwo?.pairs.some(([a, b]) => a === pair[0] && b === pair[1])))
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant!.puzzle, entries: source.solution,
  } }), 'unique')
})
