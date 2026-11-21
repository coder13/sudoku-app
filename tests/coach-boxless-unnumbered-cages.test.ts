import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { numberSolution } from '../src/number-puzzles/solution.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/coach-boxless-414.json', import.meta.url), 'utf8'))
const leftBoxes = [
  [0, 1, 2, 9, 10, 11, 18, 19, 20],
  [27, 28, 29, 36, 37, 38, 45, 46, 47],
  [54, 55, 56, 63, 64, 65, 72, 73, 74],
]

test('the original #414 export keeps every typed rule, the unlabeled cages and the corner paths', async () => {
  const preview = await preparePlayableImport(fixture.code)
  assert.ok('calcudoku' in preview)
  const entry = readImportedCalcudoku(preview.calcudoku.id)!
  const { puzzle, annotations } = entry
  assert.deepEqual(puzzle.givens, Array(81).fill(0))
  assert.equal(puzzle.antiKnight, true)
  assert.deepEqual(puzzle.unnumberedCages, leftBoxes)
  assert.equal(puzzle.extraRegions, undefined)
  assert.deepEqual(puzzle.cages.map(({ cells, target, distinct }) => [cells, target, distinct]), [
    [[54, 55, 63], 21, true], [[56, 65, 74], 15, true], [[64], 1, true], [[72, 73], 8, true],
  ])
  assert.deepEqual(puzzle.adjacentClues?.marks.map(mark => mark.cells), [[1, 2], [9, 10], [10, 19], [18, 19]])
  assert.deepEqual(puzzle.pathClues, [
    { type: 'entropic', cells: [27, 28, 29] }, { type: 'entropic', cells: [38, 37, 36, 45, 46, 47] },
  ])
  assert.deepEqual(puzzle.whispers?.map(({ cells, minDifference }) => [cells, minDifference]), [
    [[67, 76], 5], [[76, 77, 68, 69, 78, 79, 70], 5], [[57, 48, 49, 58, 59, 50, 51, 60, 61], 5],
    [[35, 44, 43, 34, 33], 5], [[50, 41, 40], 5], [[44, 53], 5],
  ])
  assert.deepEqual(puzzle.quadruples?.map(clue => [clue.topLeft, clue.digits.join('')]), [
    [3, '998'], [5, '463'], [7, '845'], [15, '6357'], [13, '8356'],
  ])
  const axis = Array.from({ length: 10 }, (_, index) => index)
  assert.deepEqual(annotations?.authoredPaths, [
    axis.map(x => [x, 3]), axis.map(y => [3, y]), [[3, 6], [2, 6], [1, 6], [0, 6]],
  ].map(points => ({
    type: 'corner-path', points, thickness: .18, color: '#ffa8a8', opacity: 1,
    border: { color: '#a35c5c', thickness: .03 },
  })))

  const result = solveLatin(puzzle)
  assert.equal(result.status, 'unique')
  const answer = Array.from(fixture.solution, Number)
  assert.deepEqual(result.solution, answer)
  assert.equal(checkLatin(puzzle, answer).complete, true)

  const values = Array(81).fill(0)
  values[0] = values[10] = 5
  assert.deepEqual(checkLatin(puzzle, values).conflicts.filter(rule => rule.kind === 'unnumbered-cage').map(rule => rule.cells), [leftBoxes[0]])
  const hint = findLatinHints(puzzle, [], 10).find(hint => hint.rules.some(rule => rule.kind === 'unnumbered-cage'))
  assert.ok(hint)
  assert.equal(hint.value, answer[hint.cell])

  const walkthrough = numberSolution({
    check: values => checkLatin(puzzle, values),
    hints: values => findLatinHints(puzzle, values),
    solutionHints: values => findLatinSolutionHints(puzzle, values),
    solve: () => result.solution!,
  }, puzzle.givens.map(() => true))
  assert.equal(walkthrough.complete, true)
  assert.deepEqual(walkthrough.positions.at(-1), answer)
  assert.equal(walkthrough.positions[0][64], 0)
  assert.ok(walkthrough.steps.some(step => step?.cell === 64 && step.value === 1))
})

test('one Coach cage layer can mix totals and unnumbered cages in a 7 × 7 grid', async () => {
  const solved = Array.from({ length: 49 }, (_, cell) => (cell % 7 + Math.floor(cell / 7)) % 7 + 1).join('')
  const givens = '0' + solved.slice(1)
  const layer = { type: 'cage', segments: [{ cells: [0, 1, 8], parameters: {} }, { cells: [0], parameters: { sum: 1 } }] }
  const prepared = await preparePlayableImport(coachCode({ gridSize: 7, regions: [], givenDigits: givens, givenConstraints: [layer] }))
  assert.ok('calcudoku' in prepared)
  const entry = readImportedCalcudoku(prepared.calcudoku.id)!
  assert.deepEqual(entry.puzzle.unnumberedCages, [[0, 1, 8]])
  assert.deepEqual(entry.puzzle.cages[0], { cells: [0], target: 1, operator: 'add', distinct: true })
  assert.equal(entry.puzzle.givens[0], 0)
  assert.equal(solveLatin(entry.puzzle).solution?.join(''), solved)
  const [, payload, ...sections] = entry.id.split('.')
  const [size, definition, recipe, colors] = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')))
  recipe[0][2] = 'equal'
  const legacy = ['c1', btoa(JSON.stringify([size, definition, recipe, colors])).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''),
    ...sections.filter(key => !key.startsWith('u'))].join('.')
  assert.equal(readImportedCalcudoku(legacy)?.puzzle.givens[0], 1)
})

test('a boxless export with only unnumbered cages preserves them and rejects malformed cage layers', async () => {
  const layer = { type: 'cage', segments: [{ cells: [0, 1, 3], parameters: {} }] }
  const source = (gridSize: number, layer: unknown, regions: unknown = []) =>
    coachCode({ gridSize, regions, givenDigits: '023312231', givenConstraints: [layer] })
  const preview = await preparePlayableImport(source(3, layer))
  assert.ok('futoshiki' in preview)
  const reopened = readImportedFutoshiki(preview.futoshiki.id)!
  const [rule] = reopened.puzzle.rules.filter(rule => rule.kind === 'unnumbered-cage')
  assert.deepEqual(rule.cells, [0, 1, 3])
  assert.equal(rule.support([7, bit(1), 7, bit(1)]), null)
  assert.equal(readImportedFutoshiki(preview.futoshiki.id.replace('.u', '.u0')), undefined)
  for (const invalid of [
    { ...layer, segments: [{ cells: [0, 3, 3], parameters: {} }] },
    { ...layer, segments: [{ cells: [0, 1, 2, 3], parameters: {} }] },
    { ...layer, settings: { repeat: true } },
  ]) await assert.rejects(preparePlayableImport(source(3, invalid)), /invalid unnumbered cage/)
  await assert.rejects(detectPuzzle(source(3, { ...layer, type: 'cosmeticCage' })), /invalid cage label/)
  await assert.rejects(detectPuzzle(coachCode({
    gridSize: 9, regions: [0, 1], givenConstraints: [layer],
  })), /invalid region map/)
  assert.throws(() => createCalcudoku(3, [{ cells: [0], operator: 'add', target: 1 }], undefined, { allowUncaged: true }),
    /Invalid Calcudoku cage/)
})
