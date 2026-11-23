import assert from 'node:assert/strict'
import test from 'node:test'
import { boardGroupKey, boardGroupOutline, boardLinkEndpoints, boardLinkRoutes, boardPointCandidates } from '../src/sudoku/board-link-geometry.ts'

test('group membership is stable across endpoint order and wire shapes', () => {
  const point = { cells: [19, 18, 19], digit: 5 }
  assert.equal(boardGroupKey(point), boardGroupKey({ candidates: [{ cell: 18, digit: 5 }, { cell: 19, digit: 5 }] }))
  assert.deepEqual(boardPointCandidates(point), [{ cell: 18, digit: 5 }, { cell: 19, digit: 5 }])
  assert.equal(boardGroupKey({ cell: 18, digit: 5 }), undefined)
  assert.deepEqual(boardGroupOutline({ cells: [18, 18], digit: 5 }), [])
  assert.deepEqual(boardGroupOutline({ candidates: [] }), [])
})

test('group outlines enclose every member and follow candidate caption insets', () => {
  const members = [{ cell: 0, digit: 1 }, { cell: 9, digit: 7 }, { cell: 10, digit: 5 }]
  const insets = new Map([[0, { top: .3, bottom: .28 }]])
  const outline = boardGroupOutline({ candidates: members }, insets)
  assert.ok(outline.length >= 4)
  for (const candidate of members) {
    const { start } = boardLinkEndpoints(candidate, { cell: 80 }, insets)!
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length]
      assert.ok((b.x - a.x) * (start.y - a.y) - (b.y - a.y) * (start.x - a.x) > 0)
    }
  }
  assert.notDeepEqual(outline, boardGroupOutline({ candidates: members }))
  assert.deepEqual(boardGroupOutline({ cells: [18, 19], digit: 5 }), [
    { x: 3.45, y: 23.45 }, { x: 16.55, y: 23.45 }, { x: 16.55, y: 26.55 }, { x: 3.45, y: 26.55 },
  ])
})

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

test('overlapping links use separate lanes, including reversed links', () => {
  const routes = boardLinkRoutes([
    { from: { cell: 0, digit: 5 }, to: { cell: 8, digit: 5 } },
    { from: { cell: 7, digit: 5 }, to: { cell: 1, digit: 5 } },
    { from: { cell: 2, digit: 5 }, to: { cell: 6, digit: 5 } },
  ])
  const lanes = routes.map(points => points.length === 4 ? points[1].y : points[0].y)
  assert.equal(new Set(lanes).size, 3)
  for (const points of routes) {
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
    assert.ok(Math.abs(points[0].y - 5) < 1.4)
    assert.ok(Math.abs(points.at(-1)!.y - 5) < 1.4)
  }
})

test('separate links stay straight and empty or zero-length links stay hidden', () => {
  assert.deepEqual(boardLinkRoutes([
    { from: { cell: 0, digit: 5 }, to: { cell: 2, digit: 5 } },
    { from: { cell: 6, digit: 5 }, to: { cell: 8, digit: 5 } },
    { from: { cells: [], digit: 5 }, to: { cell: 0, digit: 5 } },
    { from: { cell: 0, digit: 5 }, to: { cell: 0, digit: 5 } },
  ]), [
    [{ x: 6.4, y: 5 }, { x: 23.6, y: 5 }],
    [{ x: 66.4, y: 5 }, { x: 83.6, y: 5 }],
    [], [],
  ])
})
