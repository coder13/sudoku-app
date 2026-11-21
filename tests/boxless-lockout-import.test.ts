import assert from 'node:assert/strict'
import test from 'node:test'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { endpointLineRule } from '../src/latin/endpoint-lines.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const size = 6
const solution = Array.from({ length: size ** 2 }, (_, cell) => (Math.floor(cell / size) + cell % size) % size + 1)
const missing = [0, 3, 6, 9, 18, 21, 24, 27]
const givens = solution.map((digit, cell) => missing.includes(cell) ? 0 : digit).join('')
const paths = [[19, 20, 21], [14, 15, 21]]
const lockout = { type: 'lockoutLine', segments: paths.map(cells => ({ cells, parameters: {} })), settings: { bulbFillColour: '#ffffff' } }
const inequality = { type: 'greaterLess', segments: [{ cells: [6, 7] }] }
const cage = { type: 'cage', segments: [{ cells: [6, 7], parameters: { sum: 5 } }] }

function source(...givenConstraints: object[]) {
  return coachCode({ gridSize: size, regions: [], givenDigits: givens, givenConstraints })
}

test('the boxless import keeps each Lockout path and its combined rules through Play links', async () => {
  await assert.rejects(preparePlayableImport(source(lockout)), /more than one solution/)
  for (const other of [inequality, cage]) {
    await assert.rejects(preparePlayableImport(source(other)), /more than one solution/)
    const preview = await preparePlayableImport(source(lockout, other))
    const entry = 'futoshiki' in preview
      ? readImportedFutoshiki(preview.futoshiki.id)
      : 'calcudoku' in preview ? readImportedCalcudoku(preview.calcudoku.id) : undefined
    assert.ok(entry)
    assert.equal(other === cage, 'calcudoku' in preview)
    const { puzzle } = entry
    assert.deepEqual(puzzle.pathClues, paths.map(cells => ({ type: 'lockout', cells })))
    const result = solveLatin(puzzle)
    assert.equal(result.status, 'unique')
    assert.deepEqual(result.solution, solution)
    assert.equal(checkLatin(puzzle, solution).complete, true)

    const conflicting = Array<number>(size ** 2).fill(0)
    conflicting[21] = 4
    assert.deepEqual(checkLatin(puzzle, conflicting).conflicts.filter(rule => rule.kind === 'lockout').map(rule => rule.cells), paths)
    const lockoutHint = findLatinHints(puzzle, []).find(hint => hint.cell === 21)
    assert.equal(lockoutHint?.value, 1)
    assert.ok(lockoutHint?.rules.some(rule => rule.kind === 'lockout'))
    assert.equal(findLatinSolutionHints(puzzle, []).length, missing.length)
  }
})

test('a 7 × 7 export with a two-cell Lockout Line uses the same fixed gap', async () => {
  const solved = Array.from({ length: 49 }, (_, cell) => (Math.floor(cell / 7) + cell % 7) % 7 + 1)
  const preview = await preparePlayableImport(coachCode({
    gridSize: 7, regions: [], givenDigits: '0' + solved.slice(1).join(''),
    givenConstraints: [{ type: 'lockoutLine', segments: [{ cells: [0, 4] }] }],
  }))
  assert.ok('futoshiki' in preview)
  const reopened = readImportedFutoshiki(preview.futoshiki.id)
  assert.deepEqual(reopened?.puzzle.pathClues, [{ type: 'lockout', cells: [0, 4] }])
  assert.deepEqual(solveLatin(reopened!.puzzle).solution, solved)
})

test('malformed Lockout paths and unknown rule settings fail on import', async () => {
  await assert.rejects(preparePlayableImport(source({ ...lockout, settings: { minimumGap: 2 } })), /unsupported settings/)
  await assert.rejects(preparePlayableImport(source({ ...lockout, segments: [{ cells: [0], parameters: {} }] })), /invalid line clues/)
  await assert.rejects(preparePlayableImport(source({ ...lockout, segments: [{ cells: [0, 36], parameters: {} }] })), /invalid line clues/)
})

test('the Lockout rule keeps exactly the candidates with a compatible endpoint pair', () => {
  const rule = endpointLineRule(9, [0, 1, 2, 3], 'lockout')
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (const first of digits) for (const last of digits) {
    const low = Math.min(first, last), high = Math.max(first, last)
    for (const middle of digits) {
      const outside = digits.filter(value => value < low || value > high).reduce((mask, value) => mask | bit(value), 0)
      assert.deepEqual(rule.support([bit(first), bit(middle), 511, bit(last)]),
        high - low >= 4 && (outside & bit(middle)) ? [bit(first), bit(middle), outside, bit(last)] : null)
    }
  }
  assert.deepEqual(rule.support([bit(1) | bit(2), bit(1), bit(8), bit(5) | bit(6)]), [bit(2), bit(1), bit(8), bit(6)])
})
