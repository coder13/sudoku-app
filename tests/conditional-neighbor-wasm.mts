import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const puzzle: VariantPuzzle = {
  version: 1,
  givens: '0'.repeat(81),
  rules: [{ type: 'conditional-neighbor', triggerDigit: 5, alternatives: [
    { rowOffset: -1, columnOffset: 0, digit: 1 },
    { rowOffset: 1, columnOffset: 0, digit: 9 },
  ] }],
}

test('conditional neighbor rules propagate alternatives and reject invalid completions', async () => {
  const blocked = Array(81).fill('0')
  blocked[31] = '2'
  blocked[49] = '8'
  const withoutSupport = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle, entries: blocked.join(''),
  } })
  assert.equal(withoutSupport?.[40] & (1 << 4), 0)

  const forced = Array(81).fill('0')
  forced[40] = '5'
  forced[31] = '2'
  const withOneOption = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle, entries: forced.join(''),
  } })
  assert.equal(withOneOption?.[49], 1 << 8)

  const classicSolution = Array.from({ length: 81 }, (_, cell) =>
    String((Math.floor(cell / 9) * 3 + Math.floor(Math.floor(cell / 9) / 3) + cell % 9) % 9 + 1)).join('')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle, entries: classicSolution,
  } }), 'unsolvable')
})
