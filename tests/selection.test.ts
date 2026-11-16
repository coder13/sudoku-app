import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellsOnDragPath } from '../src/sudoku/selection.ts'

test('candidate drags include cells between mouse or touch pointer samples', () => {
  assert.deepEqual(cellsOnDragPath(0, 4), [0, 1, 2, 3, 4])
  assert.deepEqual(cellsOnDragPath(4, 0), [4, 3, 2, 1, 0])
  assert.deepEqual(cellsOnDragPath(0, 20), [0, 10, 20])
  assert.deepEqual(cellsOnDragPath(31, 31), [31])
})
