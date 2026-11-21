import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { decodeCoachSix, detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { tournamentQuadrupleCode, tournamentQuadrupleRules, tournamentQuadrupleSolution } from './fixtures/tournament-quadruple.ts'
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
  assert.deepEqual((await detectPuzzle(code())).sizedRules, [
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [0, 1], value: 1 }, { cells: [1, 2], value: 3 }], negative: true },
  ])
})

test('sized Coach Arrow preserves the bulb, its ordered shaft and its companion rules', async () => {
  const arrow = { type: 'arrow', segments: [{ cells: [0, 5, 10], parameters: {} }] }
  const code = () => coachCode({ gridSize: 4, givenConstraints: [arrow,
    { type: 'renban', segments: [{ cells: [0, 1] }] }] })
  const result = await detectPuzzle(code())
  assert.deepEqual(result.sizedRules, [
    { type: 'arrow', circle: 0, cells: [5, 10] }, { type: 'renban', cells: [0, 1] },
  ])
  arrow.segments[0].cells = [0, 5, 0]
  await assert.rejects(detectPuzzle(code()), /invalid rules/)
})

test('Coach Region Sum preserves each box visit and coexists with other line clues', async () => {
  const path = [0, 4, 9, 13, 10, 5]
  const source = { gridSize: 4, givenConstraints: [
    { type: 'regionSumLine', segments: [{ cells: path }] },
    { type: 'renban', segments: [{ cells: [4, 0] }] },
  ] }
  assert.deepEqual((await detectPuzzle(coachCode(source))).sizedRules, [
    { type: 'region-sum', cells: path, groupByRegion: false },
    { type: 'renban', cells: [4, 0] },
  ])
  source.givenConstraints[0].segments[0].cells = [0, 1, 6, 7, 2, 5, 0]
  assert.deepEqual((await detectPuzzle(coachCode(source))).sizedRules?.[0], {
    type: 'region-sum', cells: [6, 7, 2, 5, 0, 1], groupByRegion: false, segments: [[0, 1, 6, 7, 2, 5, 0]],
  })
  source.givenConstraints[0].segments[0].cells = [0, 1, 5]
  await assert.rejects(detectPuzzle(coachCode(source)), /invalid rules/)
})

test('a 7 × 7 Coach Jigsaw preserves explicit regions beside Thermometer and exact Ratio rules', async () => {
  const labels = '0000111020011122233312223434555343456664445556666'
  const original = { gridSize: 7, givenDigits: '0'.repeat(49), regions: Array.from(labels, label => Number(label) + 1),
    givenConstraints: [
      { type: 'thermometer', segments: [{ cells: [8, 16, 24] }] },
      { type: 'ratio', settings: { negativeConstraint: true }, segments: [{ cells: [1, 2], parameters: { ratio: 3 } }] },
    ] }
  const puzzle = await detectPuzzle(coachCode(original))
  assert.equal(puzzle.grid?.size, 7)
  assert.deepEqual(puzzle.grid?.size === 7 && puzzle.grid.regions[0], [0, 1, 2, 3, 7, 9, 10])
  assert.deepEqual(puzzle.sizedRules, [
    { type: 'thermometer', cells: [8, 16, 24] },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [1, 2], value: 3 }], negative: true },
  ])
  await assert.rejects(detectPuzzle(coachCode({ ...original, regions: Array(49).fill(0) })), /seven connected regions/)
})

test('Coach preserves repeated Quadruple digits and rejects malformed corners or digits', async () => {
  const imported = await detectPuzzle(tournamentQuadrupleCode())
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.deepEqual(imported.sizedRules, tournamentQuadrupleRules.map(([topLeft, digits]) => ({
    type: 'quadruple', topLeft, digits: Array.from(digits, Number),
  })))

  const shape = { ...six, regions: rectangularRegions(2, 3) }
  const code = (cell: number, digits: string) => coachCode({ ...shape, givenConstraints: [
    { type: 'quadruple', segments: [{ cells: [cell], parameters: { digits } }] },
    { type: 'even', segments: [{ cells: [0] }] },
  ] })
  assert.deepEqual((await detectPuzzle(code(8, '4556'))).sizedRules, [
    { type: 'quadruple', topLeft: 8, digits: [4, 5, 5, 6] },
    { type: 'parity', cells: [0], parity: 'even' },
  ])
  await assert.rejects(detectPuzzle(code(5, '4556')), /contains invalid rules/)
  await assert.rejects(detectPuzzle(code(8, '457')), /invalid Quadruple clue/)
  await assert.rejects(detectPuzzle(code(8, '')), /invalid Quadruple clue/)
})

test('a progressed tournament Quadruple preserves repeated labels through reload and the share Worker', async () => {
  const { grid, givens, sizedRules: rules } = await detectPuzzle(tournamentQuadrupleCode())
  assert.ok(grid && rules)
  const game = { ...makeGame('quad-tournament', 'Tournament Quadruple', givens, 'imported', 0, grid),
    sized: { rules, solution: tournamentQuadrupleSolution } }
  const progressed = enter(game, [0], 'value', 3)
  assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.sized, game.sized)
  const shared = await publishFixture(progressed)
  assert.deepEqual(shared.sixRules, rules)
  assert.equal(shared.givens, givens)
})
