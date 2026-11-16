import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPuzzleRating } from '../src/sudoku/difficulty.ts'

test('puzzle ratings place the score beside the difficulty', () => {
  assert.equal(formatPuzzleRating('unfair', 1000), 'Unfair (1000)')
  assert.equal(formatPuzzleRating('easy', null), 'Easy')
  assert.equal(formatPuzzleRating('medium'), 'Medium')
})
