import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellsOnDragPath, rectangleSelection } from '../src/sudoku/selection.ts'

test('drag selection covers the rectangle between two cells in either direction', () => {
  const expected = [10, 11, 12, 19, 20, 21, 28, 29, 30]
  assert.deepEqual(rectangleSelection(10, 30), expected)
  assert.deepEqual(rectangleSelection(30, 10), expected)
})

test('candidate drags include cells between mouse or touch pointer samples', () => {
  assert.deepEqual(cellsOnDragPath(0, 4), [0, 1, 2, 3, 4])
  assert.deepEqual(cellsOnDragPath(4, 0), [4, 3, 2, 1, 0])
  assert.deepEqual(cellsOnDragPath(0, 20), [0, 10, 20])
  assert.deepEqual(cellsOnDragPath(31, 31), [31])
})
