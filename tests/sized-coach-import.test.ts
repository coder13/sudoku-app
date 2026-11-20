import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeCoachSix, detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

const six = { gridSize: 6, givenDigits: '000000000000000000000000000030000400' }
const rectangularRegions = (rows: number, columns: number) => Array.from({ length: 36 }, (_, cell) =>
  Math.floor(cell / 6 / rows) * (6 / columns) + Math.floor(cell % 6 / columns) + 1)

test('six-by-six Coach decoding preserves the box orientation, clue order and both diagonals', async () => {
  const constraint = (type: string, paths: number[][]) => ({ type, segments: paths.map(cells => ({ cells, parameters: {} })), settings: {} })
  const result = await decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(2, 3), givenConstraints: [
    constraint('palindromeLine', []), constraint('diagonalNegative', []), constraint('even', [[5], [10]]),
    constraint('thermometer', [[1, 7, 13], [23, 29]]), constraint('odd', []), constraint('diagonalPositive', []),
  ] }))
  assert.deepEqual(result, {
    version: 2, grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: six.givenDigits, rules: [
      { type: 'diagonal', diagonal: 'main' }, { type: 'parity', parity: 'even', cells: [5, 10] },
      { type: 'thermometer', cells: [1, 7, 13] }, { type: 'thermometer', cells: [23, 29] }, { type: 'diagonal', diagonal: 'anti' },
    ],
  })
  const tall = await decodeCoachSix(coachCode({ ...six, regions: rectangularRegions(3, 2) }))
  assert.deepEqual(tall.grid, { size: 6, boxRows: 3, boxColumns: 2 })
})

test('six-by-six Coach decoding reports unsupported rules instead of importing a partial puzzle', async () => {
  const puzzle = { ...six, regions: rectangularRegions(2, 3) }
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: [{ type: 'globalEntropy', segments: [] }] })), /unsupported active rule/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, givenConstraints: [{ type: 'thermometer', segments: [{ cells: [1, 1] }] }] })), /invalid rules/)
  await assert.rejects(decodeCoachSix(coachCode({ ...puzzle, regions: Array(36).fill(0) })), /rectangular boxes/)
})

test('the 4 × 4 Coach path uses the same rule objects and preserves companion clues', async () => {
  const source = { gridSize: 4, givenDigits: '0000032000000010', givenConstraints: [
    { type: 'renban', segments: [{ cells: [0, 5] }, { cells: [5, 6] }] },
    { type: 'odd', segments: [{ cells: [9] }] },
  ] }
  const imported = await detectPuzzle(coachCode(source))
  assert.deepEqual(imported.grid, { size: 4, boxRows: 2, boxColumns: 2 })
  assert.deepEqual(imported.sizedRules, [
    { type: 'renban', cells: [0, 5, 6], segments: [[0, 5], [5, 6]] },
    { type: 'parity', parity: 'odd', cells: [9] },
  ])
  source.givenConstraints[0].segments[1].cells[1] = 16
  await assert.rejects(detectPuzzle(coachCode(source)), /invalid rules/)
})

test('six-by-six Coach keeps intersecting Renban segments as one set alongside other rules', async () => {
  const puzzle = { ...six, regions: rectangularRegions(3, 2) }
  const source = { ...puzzle, givenConstraints: [
    { type: 'renban', segments: [{ cells: [1, 7, 13] }, { cells: [7, 8] }] },
    { type: 'thermometer', segments: [{ cells: [1, 7, 13] }] },
  ] }
  assert.deepEqual((await decodeCoachSix(coachCode(source))).rules, [
    { type: 'renban', cells: [1, 7, 13, 8], segments: [[1, 7, 13], [7, 8]] },
    { type: 'thermometer', cells: [1, 7, 13] },
  ])
  source.givenConstraints[0].segments[1].cells[1] = 36
  await assert.rejects(decodeCoachSix(coachCode(source)), /invalid rules/)
})

test('sized Coach Kropki combines positive dots, independent negative rules and companion lines', async () => {
  const source = {
    ...six, regions: rectangularRegions(2, 3), givenConstraints: [
      { type: 'difference', settings: { negativeConstraint: true }, segments: [{ cells: [0, 1], parameters: { difference: 1 } }] },
      { type: 'ratio', settings: { negativeConstraint: false }, segments: [{ cells: [1, 7], parameters: { ratio: 2 } }] },
      { type: 'renban', segments: [{ cells: [0, 1, 7] }] },
    ],
  }
  const imported = await detectPuzzle(coachCode(source))
  assert.deepEqual(imported.sizedRules, [
    { type: 'kropki', consecutive: { pairs: [[0, 1]], negative: true } },
    { type: 'kropki', ratioTwo: { pairs: [[1, 7]], negative: false } },
    { type: 'renban', cells: [0, 1, 7] },
  ])
  source.givenConstraints[0].segments[0].cells = [5, 6]
  await assert.rejects(detectPuzzle(coachCode(source)), /invalid rules/)
})

test('a labeled Coach Difference layer keeps the explicit 1 alongside larger labels', async () => {
  const layer = {
    type: 'difference', settings: { negativeConstraint: false }, segments: [
      { cells: [0, 1], parameters: { difference: 1 } },
      { cells: [1, 2], parameters: { difference: 3 } },
    ],
  }
  const code = () => coachCode({ gridSize: 4, givenConstraints: [layer] })
  const puzzle = await detectPuzzle(code())
  assert.deepEqual(puzzle.sizedRules, [
    { type: 'difference', cells: [0, 1], difference: 1 },
    { type: 'difference', cells: [1, 2], difference: 3 },
  ])
  layer.segments[1].parameters.difference = 4
  await assert.rejects(detectPuzzle(code()), /between 1 and 3/)
  layer.segments[1].parameters.difference = 3
  layer.settings.negativeConstraint = true
  await assert.rejects(detectPuzzle(code()), /unsupported negative rule/)
})
