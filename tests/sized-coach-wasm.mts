import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { decodeCoachSix } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker(process.env.SIZED_COACH_WASM)

test('six-by-six Coach constraints reach Wasm together and change the exact solution count', async () => {
  const constraints = [
    { type: 'diagonalPositive', segments: [] },
    { type: 'thermometer', segments: [{ cells: [1, 7, 13, 14] }, { cells: [32, 26, 20] }] },
    { type: 'odd', segments: [{ cells: [24] }, { cells: [17] }] },
  ]
  const decoded = await decodeCoachSix(coachCode({ gridSize: 6, givenDigits: '000000000000000000000000000030000400', givenConstraints: constraints,
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)) }))
  const { givens, rules, grid, version } = decoded
  const position = { digits: Array.from(givens, Number), rules, grid, version }
  assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
  const solved = await runEngine({ type: 'sized-variant', position, operation: 'solve' })
  assert.equal(solved?.digits.join(''), '413652625314234561156243542136361425')
  const candidates = await runEngine({ type: 'sized-variant', position, operation: 'candidates' })
  assert.ok(candidates)
  assert.equal(candidates.length, 36)
  assert.equal(candidates[24] & 0b101010, 0)
  for (const ruleType of ['diagonal', 'parity', 'thermometer']) {
    const partial = { ...position, rules: rules.filter(rule => rule.type !== ruleType) }
    assert.equal(await runEngine({ type: 'sized-variant', position: partial, operation: 'analyze' }), 'multiple')
  }
})
