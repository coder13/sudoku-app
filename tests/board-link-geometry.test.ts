import assert from 'node:assert/strict'
import test from 'node:test'
import { boardLinkEndpoints } from '../src/sudoku/board-link-geometry.ts'

test('a group link starts at the near member instead of crossing its digit', () => {
  assert.deepEqual(boardLinkEndpoints({ cells: [18, 19], digit: 5 }, { cell: 25, digit: 5 }), {
    start: { x: 15, y: 25 }, end: { x: 75, y: 25 },
  })
  assert.deepEqual(boardLinkEndpoints({ cell: 25, digit: 5 }, { cells: [18, 19], digit: 5 }), {
    start: { x: 75, y: 25 }, end: { x: 15, y: 25 },
  })
})

test('links between groups use their closest members, including mixed-digit groups', () => {
  assert.deepEqual(boardLinkEndpoints({ cells: [0, 9], digit: 5 }, { candidates: [{ cell: 36, digit: 5 }, { cell: 45, digit: 8 }] }), {
    start: { x: 5, y: 15 }, end: { x: 5, y: 45 },
  })
  assert.equal(boardLinkEndpoints({ cells: [], digit: 5 }, { cell: 0, digit: 5 }), undefined)
})

test('ordinary candidate and cell links keep the board coordinate system', () => {
  assert.deepEqual(boardLinkEndpoints({ cell: 0, digit: 5 }, { cell: 80 }), {
    start: { x: 5, y: 5 }, end: { x: 85, y: 85 },
  })
  const within = boardLinkEndpoints({ cell: 48, digit: 2 }, { cell: 48, digit: 7 })!
  assert.ok(within.start.y < within.end.y)
  assert.ok(within.start.x > within.end.x)
})
