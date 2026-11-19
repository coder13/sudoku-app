import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consecutiveLineState } from '../src/sudoku/consecutive-line.ts'
import { conflictsOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { coachCode } from './helpers/coach-code.ts'

const segments = [[40, 0], [80, 40]]
const layer = (paths: number[][]) => ({
  type: 'consecutiveLine', segments: paths.map(cells => ({ cells })), settings: { colour: '#ff8c82' },
})
const input = coachCode({ givenConstraints: [layer(segments)] })

test('Coach connects segments by their edges and preserves the authored drawing', async () => {
  const { variant } = await detectPuzzle(input)
  assert.equal(variant?.id, 'consecutive-line')
  assert.deepEqual(variant.puzzle.rules, [{ type: 'consecutive-line', cells: [0, 40, 80], segments }])
  const shared = '#variant=' + encodeURIComponent(JSON.stringify(variant))
  assert.deepEqual((await detectPuzzle(shared)).variant, variant)
  assert.deepEqual(reflectVariant(variant.puzzle, 4).rules?.[0], {
    type: 'consecutive-line', cells: [8, 40, 72], segments: [[40, 8], [72, 40]],
  })
})

test('placements require an ordered run, and different clue layers stay independent', async () => {
  const puzzle = (await detectPuzzle(input)).variant!.puzzle
  const values = [...puzzle.givens]
  values[40] = '5'
  assert.equal(consecutiveLineState(puzzle, values.join(''))?.allowed[0], 0b00101000)
  values[0] = '4'
  assert.equal(consecutiveLineState(puzzle, values.join(''))?.allowed[80], 0b00100000)
  values[80] = '4'
  assert.deepEqual([...conflictsOf(values.join(''), puzzle)].sort((a, b) => a - b), [0, 40, 80])

  const independent = await detectPuzzle(coachCode({ givenConstraints: [layer([[0, 40]]), layer([[80, 40]])] }))
  assert.equal(conflictsOf(values.join(''), independent.variant?.puzzle).size, 0)
})

test('empty layers have no effect, and impossible branches and cycles reject', async () => {
  assert.equal((await detectPuzzle(coachCode({ givenConstraints: [layer([])] }))).variant, undefined)
  for (const paths of [[[0, 40, 80], [40, 71]], [[0, 40, 80, 0]]]) {
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [layer(paths)] })), /cannot form a run/)
  }
})
