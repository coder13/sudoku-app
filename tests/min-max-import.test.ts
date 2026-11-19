import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { minMaxNeighbors, variantDigitExclusions, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const minimum = { type: 'minimum', segments: [{ cells: [7] }, { cells: [8] }], settings: {} }
const maximum = { type: 'maximum', segments: [{ cells: [17] }], settings: {} }
const odd = { type: 'odd', segments: [{ cells: [7] }], settings: {} }
const input = coachCode({ givenConstraints: [minimum, maximum, odd] })

test('Coach Min/Max imports keep each clue group and compatible companion rules', async () => {
  const { variant } = await detectPuzzle(input)
  assert.equal(variant?.id, 'mixed')
  assert.deepEqual(variant.puzzle.rules, [
    { type: 'min-max', cells: [7, 8], maximum: false },
    { type: 'min-max', cells: [17], maximum: true },
    { type: 'parity', cells: [7], parity: 'odd' },
  ])
  assert.match(variantRuleDescriptions(variant.puzzle).join(' '), /Minimum group \(R1C8, R1C9\)/)
  const shared = '#variant=' + encodeURIComponent(JSON.stringify(variant))
  assert.deepEqual((await detectPuzzle(shared)).variant, variant)
  assert.deepEqual(reflectVariant(variant.puzzle, 4).rules?.[0], {
    type: 'min-max', cells: [1, 0], maximum: false,
  })
})

test('player comparisons exclude same-group cells, diagonal cells, and row wraps', async () => {
  const puzzle = (await detectPuzzle(input)).variant!.puzzle
  assert.deepEqual(minMaxNeighbors([7, 8], 7), [6, 16])
  assert.deepEqual(minMaxNeighbors([7, 8], 8), [17])
  assert.equal(variantDigitExclusions(puzzle, 7, 8, 3), 0)
  assert.equal(variantDigitExclusions(puzzle, 7, 15, 3), 0)
  assert.equal(variantDigitExclusions(puzzle, 8, 9, 2), 0)
  assert.equal(variantDigitExclusions(puzzle, 7, 6, 3), 0b111)
  assert.equal(variantDigitExclusions(puzzle, 6, 7, 3), 0b111111100)
  assert.equal(variantDigitExclusions(puzzle, 17, 8, 4), 0b111111000)

  const grid = [...puzzle.givens]
  grid[7] = '3'
  grid[8] = '2'
  grid[17] = '8'
  assert.equal(conflictsOf(grid.join(''), puzzle).size, 0)
  grid[6] = '1'
  assert.deepEqual([...conflictsOf(grid.join(''), puzzle)].sort(), [6, 7])
})

test('malformed Min/Max layers fail without dropping their rules', async () => {
  for (const segments of [[{ cells: [81] }], [{ cells: [7, 8] }], [{ cells: [7], parameters: { value: 3 } }]]) {
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ ...minimum, segments }] })))
  }
})
