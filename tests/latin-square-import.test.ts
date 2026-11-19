import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf, singleFromCandidates } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantHouseMasks, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const solution = Array.from({ length: 81 }, (_, cell) => (Math.floor(cell / 9) + cell % 9) % 9 + 1).join('')
const givens = solution.slice(0, 40) + '0' + solution.slice(41)

test('an empty Coach region map opens a boxless Latin Square', async () => {
  const { variant } = await detectPuzzle(coachCode({ givenDigits: givens, regions: [] }))
  assert.equal(variant?.id, 'latin-square')
  assert.deepEqual(variant.puzzle.regions, { type: 'latin-square' })
  assert.match(variantRuleDescriptions(variant.puzzle)[0], /each row and column/)
  assert.equal(conflictsOf(solution, variant.puzzle).size, 0)
  assert.ok(conflictsOf(solution).size > 0)
  const candidates = variantHouseMasks(variant.puzzle, givens)
  assert.deepEqual(singleFromCandidates(givens, candidates, undefined, variant.puzzle), [40, Number(solution[40])])
})

test('Latin Square imports retain authored extra houses and share the layout', async () => {
  const cells = Array.from({ length: 9 }, (_, row) => row * 10)
  const { variant } = await detectPuzzle(coachCode({ givenDigits: givens, regions: [], givenConstraints: [
    { type: 'region', segments: [{ cells, parameters: {} }], settings: {} },
  ] }))
  assert.equal(variant?.id, 'mixed')
  assert.deepEqual(variant.puzzle.rules, [{ type: 'extra-house', cells }])
  const link = '#variant=' + encodeURIComponent(JSON.stringify(variant))
  assert.deepEqual((await detectPuzzle(link)).variant, variant)
  assert.equal(conflictsOf(solution, variant.puzzle).size, 0)
})
