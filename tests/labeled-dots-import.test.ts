import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantDigitExclusions, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const white = { type: 'difference', settings: { negativeConstraint: true },
  segments: [{ cells: [0, 1], parameters: { difference: 2 } }] }
const black = { type: 'ratio', settings: {},
  segments: [{ cells: [0, 1], parameters: { ratio: 3 } }, { cells: [9, 10], parameters: { ratio: 2 } }] }
const input = coachCode({ givenConstraints: [white, black] })

test('Coach preserves labeled values and default values in the same puzzle', async () => {
  const { variant } = await detectPuzzle(input)
  assert.equal(variant?.id, 'labeled-dots')
  assert.deepEqual(variant.puzzle.rules, [
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [0, 1], value: 2 }], negative: true },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 3 }, { cells: [9, 10], value: 2 }], negative: false },
  ])
  const shared = '#variant=' + encodeURIComponent(JSON.stringify(variant))
  assert.deepEqual((await detectPuzzle(shared)).variant, variant)
  assert.match(variantRuleDescriptions(variant.puzzle).join(' '), /without a white dot cannot differ by 1/)
})

test('an opposite-color dot does not exempt an edge from the negative rule', async () => {
  const puzzle = (await detectPuzzle(input)).variant!.puzzle
  assert.equal(variantDigitExclusions(puzzle, 0, 1, 1), 511 & ~(1 << 2))
  assert.equal(variantDigitExclusions(puzzle, 9, 10, 1), 511)
  const values = [...puzzle.givens]
  values[9] = '1'
  values[10] = '2'
  assert.deepEqual([...conflictsOf(values.join(''), puzzle)], [9, 10])
  values[9] = '2'
  values[10] = '4'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
})

test('Non-Consecutive keeps the Coach white-mark exceptions, including labels', async () => {
  const input = coachCode({ givenConstraints: [{ type: 'nonconsecutive', segments: [] }, white, black] })
  const { variant } = await detectPuzzle(input)
  assert.deepEqual(variant?.puzzle.rules?.[0], { type: 'non-consecutive', except: [[0, 1]] })
})
