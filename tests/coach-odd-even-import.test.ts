import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

const givens = '123456789456789123789123456214365897365897214897214365531642978642978531978531642'
const lineLayer = { id: 'oddEven', type: 'oddEven', settings: { colour: '#888888', lineThickness: 4 },
  segments: [{ cells: [0, 1, 2], parameters: {} }, { cells: [9, 10], parameters: {} }] }

test('Sudoku Coach Odd/Even Lines import with cell parity and other line rules', async () => {
  const imported = await detectPuzzle(coachCode({ givenDigits: givens, givenConstraints: [
    lineLayer,
    { id: 'odd', type: 'odd', settings: {}, segments: [{ cells: [0], parameters: {} }] },
    { id: 'even', type: 'even', settings: {}, segments: [{ cells: [1], parameters: {} }] },
    { id: 'thermometer', type: 'thermometer', settings: {}, segments: [{ cells: [0, 1, 2], parameters: {} }] },
  ] }))

  assert.deepEqual(imported.sizedRules, [
    { type: 'parity-line', cells: [0, 1, 2] },
    { type: 'parity-line', cells: [9, 10] },
    { type: 'parity', cells: [0], parity: 'odd' },
    { type: 'parity', cells: [1], parity: 'even' },
    { type: 'thermometer', cells: [0, 1, 2] },
  ])
  assert.equal(conflictsOf(givens, undefined, imported.grid, imported.sizedRules).size, 0)

  assert.ok(conflictsOf(givens, undefined, imported.grid, [{ type: 'parity-line', cells: [14, 15] }]).has(15),
    'adjacent cells on an Odd/Even Line must alternate parity')
})

test('Sudoku Coach Odd/Even Lines reject malformed paths and unsupported settings', async () => {
  const input = (layer: unknown) => coachCode({ givenDigits: '0'.repeat(81), givenConstraints: [layer] })
  const layer = (cells: number[], parameters: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) => ({
    id: 'oddEven', type: 'oddEven', settings, segments: [{ cells, parameters }],
  })

  for (const malformed of [
    layer([]), layer([0]), layer([0, 0]), layer([0, 1], { startWith: 'odd' }),
    layer([0, 81]), layer([0, 1], {}, { alternation: 'optional' }),
  ]) {
    await assert.rejects(detectPuzzle(input(malformed)), /Odd\/Even Line/)
  }
})
