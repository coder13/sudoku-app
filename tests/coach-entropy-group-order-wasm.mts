import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

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
