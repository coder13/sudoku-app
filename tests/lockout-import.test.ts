import assert from 'node:assert/strict'
import { test } from 'node:test'
import { endpointLineState } from '../src/sudoku/between.ts'
import { conflictsOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const cells = [0, 40, 80]
const clue = { type: 'lockoutLine', settings: { bulbFillColour: '#888888' }, segments: [{ cells, parameters: {} }] }

test('Coach Lockout imports preserve paths, endpoint order and companion rules', async () => {
  const input = coachCode({ givenConstraints: [clue, {
    type: 'odd', segments: [{ cells: [8], parameters: {} }],
  }] })
  const { variant } = await detectPuzzle(input)
  assert.equal(variant?.id, 'mixed')
  assert.deepEqual(variant.puzzle.rules, [
    { type: 'lockout', cells, },
    { type: 'parity', cells: [8], parity: 'odd' },
  ])
  assert.match(variantRuleDescriptions(variant.puzzle).join(' '), /differ by at least 4/)
  const shared = '#variant=' + encodeURIComponent(JSON.stringify(variant))
  assert.deepEqual((await detectPuzzle(shared)).variant, variant)
  assert.deepEqual(reflectVariant(variant.puzzle, 4).rules?.[0], { type: 'lockout', cells: [8, 40, 72] })
})

test('Lockout candidate and conflict checks use strict boundaries and the minimum gap', async () => {
  const puzzle = (await detectPuzzle(coachCode({ givenConstraints: [clue] }))).variant!.puzzle
  const values = [...puzzle.givens]
  values[0] = '2'
  values[80] = '7'
  assert.equal(endpointLineState(puzzle, values.join(''))!.allowed[40], 0b110000001)
  for (let digit = 1; digit <= 9; digit++) {
    values[40] = String(digit)
    assert.equal(conflictsOf(values.join(''), puzzle).size, digit < 2 || digit > 7 ? 0 : 3)
  }
  values[40] = '0'
  values[80] = '5'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 2)
  values[0] = '1'
  values[80] = '9'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 2)
})

test('Lockout validates active paths and leaves a two-diamond clue intact', async () => {
  const input = (paths: number[][]) => coachCode({ givenConstraints: [{
    ...clue, segments: paths.map(cells => ({ cells, parameters: {} })),
  }] })
  assert.deepEqual((await detectPuzzle(input([[0, 80]]))).variant?.puzzle.rules, [{ type: 'lockout', cells: [0, 80] }])
  await assert.rejects(detectPuzzle(input([[0]])), /invalid Lockout line/)
  await assert.rejects(detectPuzzle(input([[0, 40, 0]])), /invalid rules/)
})
