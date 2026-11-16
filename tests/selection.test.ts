import assert from 'node:assert/strict'
import test from 'node:test'
import { rectangleSelection } from '../src/sudoku/selection.ts'

test('drag selection covers the rectangle between two cells in either direction', () => {
  const expected = [10, 11, 12, 19, 20, 21, 28, 29, 30]
  assert.deepEqual(rectangleSelection(10, 30), expected)
  assert.deepEqual(rectangleSelection(30, 10), expected)
})
