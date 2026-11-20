import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mobileInputResizeBudget, mobilePreviewGridWidth, mobileResizedPuzzleHeight } from '../src/sudoku/mobile-input-sizing.ts'

test('input grows into both outer margins before the puzzle starts shrinking', () => {
  const input = 300, naturalPuzzle = 540
  const topSpace = 90, bottomSpace = 100
  const total = mobileInputResizeBudget(input, naturalPuzzle, topSpace + bottomSpace)
  assert.equal(total, 1030)

  // All 190px of unused space belongs to the input before any board reduction.
  for (const height of [input, 350, 400, 489, 490]) {
    assert.equal(mobileResizedPuzzleHeight(total, height, naturalPuzzle, 250), naturalPuzzle)
  }
  assert.equal(mobileResizedPuzzleHeight(total, 491, naturalPuzzle, 250), 539)
  assert.equal(mobileResizedPuzzleHeight(total, 600, naturalPuzzle, 250), 430)
  assert.equal(mobileResizedPuzzleHeight(total, 780, naturalPuzzle, 250), 250)
})

test('reducing an expanded input restores the puzzle before recreating outer space', () => {
  // Starting another drag after the board has already shrunk must retain the
  // original maximum puzzle size, even though no empty space is currently visible.
  const total = mobileInputResizeBudget(600, 430, 0)
  assert.equal(mobileResizedPuzzleHeight(total, 550, 540, 250), 480)
  assert.equal(mobileResizedPuzzleHeight(total, 490, 540, 250), 540)
  assert.equal(mobileResizedPuzzleHeight(total, 400, 540, 250), 540)
})

test('small viewports with no spare space shrink the board immediately', () => {
  const total = mobileInputResizeBudget(300, 540, 0)
  assert.equal(mobileResizedPuzzleHeight(total, 350, 540, 250), 490)
  assert.equal(mobileResizedPuzzleHeight(total, 600, 540, 250), 250)
  // A negative space measurement should never increase the budget.
  assert.equal(mobileInputResizeBudget(300, 540, -30), total)
})

test('drag preview grows smoothly when returning from a small grid to full width', () => {
  const chrome = 96
  const columnWidth = 520
  const startingShrunkWidth = 260
  // The drag begins with a 260px grid, but its real upper limit is 520px.
  // If this limit used the starting grid's parent, growth would stay stuck at 260px.
  const expandingHeights = [356, 396, 456, 516, 576, 616]
  const expectedWidths = [260, 300, 360, 420, 480, 520]
  assert.deepEqual(
    expandingHeights.map(height => mobilePreviewGridWidth(columnWidth, height, chrome)),
    expectedWidths,
  )
  assert.deepEqual(
    [...expandingHeights].reverse().map(height => mobilePreviewGridWidth(columnWidth, height, chrome)),
    [...expectedWidths].reverse(),
  )
  assert.equal(mobilePreviewGridWidth(columnWidth, 716, chrome), 520)
})
