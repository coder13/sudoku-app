import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, enter, makeGame, paintCandidate, paintCandidates, paintCells, redo, replaceCandidates, undo } from '../src/sudoku/game.ts'
import { continueStrongLinkColors } from '../src/sudoku/strong-link-colors.ts'

const masksFor = (cells: number[], digit = 1) => Array.from({ length: 81 }, (_, cell) => cells.includes(cell) ? 1 << (digit - 1) : 0)
const gameFor = (masks: number[]) => replaceCandidates(makeGame('links', 'Strong links', EMPTY, 'custom'), masks)

test('continuing follows every branch using the starting candidate shade, even from the other end', () => {
  const masks = masksFor([0, 4, 36, 10])
  const game = paintCandidate(gameFor(masks), { cell: 4, digit: 1 }, 11)
  const result = continueStrongLinkColors(masks, { cell: 4, digit: 1 }, game.position, 'candidate')
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.marks, [
    { cell: 0, digit: 1, color: 5 }, { cell: 10, digit: 1, color: 11 }, { cell: 36, digit: 1, color: 11 },
  ])
  assert.deepEqual(result.conflicts, [])
})

test('continuing stays within one group and ignores weak links, other digits, and isolated candidates', () => {
  const masks = masksFor([0, 4, 66, 70, 26])
  masks[0] |= 2
  masks[4] |= 2
  const game = paintCandidate(gameFor(masks), { cell: 4, digit: 1 }, 12)
  assert.deepEqual(continueStrongLinkColors(masks, { cell: 4, digit: 1 }, game.position, 'candidate').marks,
    [{ cell: 0, digit: 1, color: 6 }])
  const isolated = paintCandidate(game, { cell: 26, digit: 1 }, 3)
  assert.equal(continueStrongLinkColors(masks, { cell: 26, digit: 1 }, isolated.position, 'candidate').status, 'no-links')
  const weakMasks = masksFor([0, 1, 2])
  const weak = paintCandidate(gameFor(weakMasks), { cell: 0, digit: 1 }, 3)
  assert.equal(continueStrongLinkColors(weakMasks, { cell: 0, digit: 1 }, weak.position, 'candidate').status, 'no-links')
})

test('continuing fills a long branched group and even loop without coloring disconnected groups', () => {
  const cells = [3, 4, 6, 7, 8, 10, 15, 18, 19, 20, 26, 36, 37, 41, 45, 48, 56, 58, 63, 64, 71, 77, 78, 79]
  const masks = masksFor(cells, 3)
  const game = paintCandidate(gameFor(masks), { cell: 20, digit: 3 }, 8)
  const result = continueStrongLinkColors(masks, { cell: 20, digit: 3 }, game.position, 'candidate')
  assert.equal(result.status, 'ready')
  const colors = new Map(result.marks.map(({ cell, color }) => [cell, color]))
  for (const cell of [3, 41, 45, 58]) assert.equal(colors.get(cell), 8)
  for (const cell of [4, 48, 56, 77]) assert.equal(colors.get(cell), 2)
  assert.equal(colors.size, 8)
})

test('existing consistent marks anchor the group and repeated continuation never swaps shades', () => {
  const masks = masksFor([0, 4, 36, 40])
  let game = paintCandidate(gameFor(masks), { cell: 0, digit: 1 }, 5)
  game = paintCandidate(game, { cell: 36, digit: 1 }, 11)
  const result = continueStrongLinkColors(masks, { cell: 36, digit: 1 }, game.position, 'candidate')
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.marks, [{ cell: 40, digit: 1, color: 5 }, { cell: 4, digit: 1, color: 11 }])
  const colored = paintCandidates(game, result.marks)
  for (const cell of [0, 4, 36, 40]) {
    const repeated = continueStrongLinkColors(masks, { cell, digit: 1 }, colored.position, 'candidate')
    assert.equal(repeated.status, 'complete')
    assert.deepEqual(repeated.marks, [])
    assert.equal(paintCandidates(colored, repeated.marks), colored)
  }
})

for (const target of ['cell', 'candidate'] as const) {
  test(`${target} continuation reports conflicting shades or families without partially painting`, () => {
    const masks = masksFor([0, 4, 36, 40])
    for (const conflictingColor of [5, 2]) {
      const marks = [{ cell: 0, digit: 1, color: 5 }, { cell: 4, digit: 1, color: conflictingColor }]
      const game = target === 'cell' ? paintCells(gameFor(masks), marks) : paintCandidates(gameFor(masks), marks)
      const result = continueStrongLinkColors(masks, { cell: 0, digit: 1 }, game.position, target)
      assert.equal(result.status, 'color-conflict')
      assert.deepEqual(result.conflicts, [{ cell: 4, digit: 1 }])
      assert.deepEqual(result.marks, [])
    }
  })

  test(`${target} continuation is one undo step and preserves entries, notes, and unrelated marks`, () => {
    const masks = masksFor([0, 4, 36, 40, 66, 70])
    let game = enter(gameFor(masks), [0], 'corner', 2)
    game = enter(game, [8], 'color', 6)
    game = paintCandidate(game, { cell: 0, digit: 2 }, 9)
    const mark = [{ cell: 0, digit: 1, color: 5 }]
    game = target === 'cell' ? paintCells(game, mark) : paintCandidates(game, mark)
    const result = continueStrongLinkColors(masks, mark[0], game.position, target)
    const colored = target === 'cell' ? paintCells(game, result.marks) : paintCandidates(game, result.marks)
    assert.equal(colored.past.length, game.past.length + 1)
    assert.equal(colored.position.colors[8], 6)
    assert.equal(colored.position.colors[66], 0)
    assert.equal(colored.position.candidateColors?.[0]?.[2], 9)
    assert.equal(colored.position.candidateColors?.[66], undefined)
    assert.equal(colored.position.entries, game.position.entries)
    assert.equal(colored.position.corner, game.position.corner)
    assert.equal(colored.position.center, game.position.center)
    if (target === 'cell') assert.equal(colored.position.candidateColors, game.position.candidateColors)
    else assert.equal(colored.position.colors, game.position.colors)
    assert.deepEqual(undo(colored).position, game.position)
    assert.deepEqual(redo(undo(colored)).position, colored.position)
  })
}

test('variant houses create strong links; knight conflicts alone do not', () => {
  const masks = masksFor([0, 40])
  const start = { cell: 0, digit: 1 }
  const game = paintCandidate(gameFor(masks), start, 3)
  assert.equal(continueStrongLinkColors(masks, start, game.position, 'candidate').status, 'no-links')
  for (const rule of [{ type: 'diagonal', diagonal: 'main' },
    { type: 'extra-house', cells: [0, 1, 2, 3, 4, 5, 6, 7, 40] }] as const) {
    assert.deepEqual(continueStrongLinkColors(masks, start, game.position, 'candidate',
      { version: 1, givens: EMPTY, rules: [rule] }).marks, [{ cell: 40, digit: 1, color: 9 }])
  }
  const knightMasks = masksFor([2, 13])
  const knight = paintCandidate(gameFor(knightMasks), { cell: 2, digit: 1 }, 3)
  assert.equal(continueStrongLinkColors(knightMasks, { cell: 2, digit: 1 }, knight.position, 'candidate',
    { version: 1, givens: EMPTY, rules: [{ type: 'anti-knight' }] }).status, 'no-links')
})

test('an odd cycle blocks only its own group', () => {
  const masks = masksFor([0, 1, 10, 67, 71])
  const game = paintCandidates(gameFor(masks), [{ cell: 0, digit: 1, color: 3 }, { cell: 67, digit: 1, color: 5 }])
  const puzzle = { version: 1, givens: EMPTY, rules: [{ type: 'diagonal', diagonal: 'main' }] } as const
  const conflict = continueStrongLinkColors(masks, { cell: 0, digit: 1 }, game.position, 'candidate', puzzle)
  assert.equal(conflict.status, 'link-conflict')
  assert.deepEqual(conflict.marks, [])
  assert.deepEqual(continueStrongLinkColors(masks, { cell: 67, digit: 1 }, game.position, 'candidate', puzzle).marks,
    [{ cell: 71, digit: 1, color: 11 }])
})

test('continuation needs a visible colored candidate and validates its input', () => {
  const masks = masksFor([0, 1])
  const game = gameFor(masks)
  const start = { cell: 0, digit: 1 }
  assert.equal(continueStrongLinkColors(masks, start, game.position, 'candidate').status, 'uncolored')
  const colored = paintCandidate(game, start, 5)
  const removed = masksFor([1])
  assert.equal(continueStrongLinkColors(removed, start, colored.position, 'candidate').status, 'missing-candidate')
  assert.equal(continueStrongLinkColors([], start, colored.position, 'candidate').status, 'missing-candidate')
  for (const digit of [0, 10, 1.5, NaN]) {
    assert.equal(continueStrongLinkColors(masks, { cell: 0, digit }, colored.position, 'candidate').status, 'missing-candidate')
  }
  for (const cell of [-1, 81, 1.5, NaN]) {
    assert.equal(continueStrongLinkColors(masks, { cell, digit: 1 }, colored.position, 'candidate').status, 'missing-candidate')
    assert.equal(paintCells(colored, [{ cell, color: 1 }]), colored)
  }
  for (const color of [-1, 13, 1.5, NaN]) assert.equal(paintCells(colored, [{ cell: 0, color }]), colored)
})
