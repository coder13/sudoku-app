import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf } from '../src/sudoku/game.ts'
import { pillArrowState } from '../src/sudoku/pill-arrow.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { coachCode } from './helpers/coach-code.ts'

const layer = { type: 'pillArrow', segments: [{ cells: [8, 7, 16, 17] }], settings: { bulbBorderColour: '#ff8040' } }
const input = coachCode({ givenConstraints: [layer] })

test('Coach reads the pill in grid order and preserves the direction of the drawing', async () => {
  const { variant } = await detectPuzzle(input)
  assert.equal(variant?.id, 'pill-arrow')
  assert.deepEqual(variant.puzzle.rules, [{ type: 'pill-arrow', pill: [7, 8], cells: [16, 17], fromTens: true }])
  const link = '#variant=' + encodeURIComponent(JSON.stringify(variant))
  assert.deepEqual((await detectPuzzle(link)).variant, variant)
  assert.deepEqual(reflectVariant(variant.puzzle, 4).rules, [
    { type: 'pill-arrow', pill: [1, 0], cells: [10, 9], fromTens: true },
  ])
})

test('the player uses place value for candidates and reports a wrong path sum', async () => {
  const puzzle = (await detectPuzzle(input)).variant!.puzzle
  const values = [...puzzle.givens]
  values[7] = '1'
  values[8] = '2'
  values[17] = '8'
  assert.equal(pillArrowState(puzzle, values.join(''))?.allowed[16], 0b1000)
  values[16] = '4'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
  values[16] = '3'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 4)
})

test('repeated cells and unknown arithmetic settings reject', async () => {
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ ...layer, segments: [{ cells: [8, 7, 8] }] }] })), /invalid rules/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ ...layer, settings: { pillSize: 3 } }] })), /unsupported settings/)
})
