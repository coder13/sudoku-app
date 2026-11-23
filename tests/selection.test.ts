import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canStartCellSelectionDrag, cellSelectionEdges, cellsOnDragPath, extendCellSelectionPath, rectangleSelection } from '../src/sudoku/selection.ts'

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

test('cell selection can start by dragging without a selected digit in pen and pencil modes', () => {
  for (const mode of ['pen', 'pencil']) {
    assert.equal(canStartCellSelectionDrag({ highlightMode: false, penOrPencil: true, selectedDigit: null }), true, mode)
  }
  assert.equal(canStartCellSelectionDrag({ highlightMode: true, penOrPencil: false, selectedDigit: null }), true, 'highlight mode')
  assert.equal(canStartCellSelectionDrag({ highlightMode: false, penOrPencil: true, selectedDigit: 4 }), false,
    'a selected digit keeps its existing input behavior')
  assert.equal(canStartCellSelectionDrag({ highlightMode: false, penOrPencil: false, selectedDigit: null }), false,
    'other tool modes do not start a cell selection')
})

test('connected cell selection exposes only the outside border', () => {
  assert.deepEqual([...cellSelectionEdges([0, 1, 4], 4)], [
    [0, ['top', 'left']],
    [1, ['top', 'right', 'bottom']],
    [4, ['right', 'bottom', 'left']],
  ])
})

test('freehand cell selection follows an L path without filling its bounding rectangle', () => {
  let cells = new Set([0])
  cells = extendCellSelectionPath(cells, 0, 9)
  cells = extendCellSelectionPath(cells, 9, 10)
  assert.deepEqual([...cells], [0, 9, 10])
  assert.equal(cells.has(1), false, 'R1C2 is outside the pointer path')
})
