import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, enter, makeGame, paintCandidate, paintCandidates, paintCells, redo, replaceCandidates, undo } from '../src/sudoku/game.ts'
import { findStrongLinkGroups, strongLinkColorMarks } from '../src/sudoku/strong-link-colors.ts'

const masksFor = (cells: number[], digit = 1) => Array.from({ length: 81 }, (_, cell) => cells.includes(cell) ? 1 << (digit - 1) : 0)

test('strong-link coloring follows branches with opposite shades across each strong link', () => {
  const { groups, conflictingGroups } = findStrongLinkGroups(masksFor([0, 4, 36, 10]), 1)
  assert.equal(conflictingGroups, 0)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].links, 3)
  const colors = new Map(strongLinkColorMarks(groups, 5).map(({ cell, color }) => [cell, color]))
  assert.equal(colors.get(0), 5)
  for (const cell of [4, 36, 10]) assert.equal(colors.get(cell), 11)
})

test('separate groups get separate color pairs while weak links and isolated candidates stay uncolored', () => {
  const { groups } = findStrongLinkGroups(masksFor([0, 4, 66, 70, 26]), 1)
  assert.equal(groups.length, 2)
  const marks = strongLinkColorMarks(groups, 12)
  assert.deepEqual(marks.map(({ cell, color }) => [cell, color]), [[0, 12], [4, 6], [66, 7], [70, 1]])
  assert.equal(marks.some(({ cell }) => cell === 26), false)
  assert.deepEqual(findStrongLinkGroups(masksFor([0, 1, 2]), 1).groups, [])
  assert.deepEqual(findStrongLinkGroups(masksFor([0, 4]), 2).groups, [])
})

test('coloring follows a long branched group through multiple houses and an even loop', () => {
  const cells = [3, 4, 6, 7, 8, 10, 15, 18, 19, 20, 26, 36, 37, 41, 45, 48, 56, 58, 63, 64, 71, 77, 78, 79]
  const { groups, conflictingGroups } = findStrongLinkGroups(masksFor(cells, 3), 3)
  assert.equal(conflictingGroups, 0)
  assert.equal(groups.length, 3)
  const colors = new Map(strongLinkColorMarks(groups, 8).map(({ cell, color }) => [cell, color]))
  for (const cell of [3, 20, 41, 45, 58]) assert.equal(colors.get(cell), 8)
  for (const cell of [4, 48, 56, 77]) assert.equal(colors.get(cell), 2)
  assert.equal(groups[0].links, 9)
  assert.equal(colors.get(7), 9)
  assert.equal(colors.get(79), 3)
  assert.equal(colors.get(10), 10)
  assert.equal(colors.get(15), 4)
  assert.equal(colors.size, 13)
})

test('a pair in both a row and a box counts as one link, and even loops alternate consistently', () => {
  const pair = findStrongLinkGroups(masksFor([0, 1]), 1)
  assert.equal(pair.groups[0].links, 1)
  const loop = findStrongLinkGroups(masksFor([0, 4, 36, 40]), 1)
  assert.equal(loop.conflictingGroups, 0)
  assert.equal(loop.groups[0].links, 4)
  const colors = new Map(strongLinkColorMarks(loop.groups, 1).map(({ cell, color }) => [cell, color]))
  assert.equal(colors.get(0), colors.get(40))
  assert.equal(colors.get(4), colors.get(36))
  assert.notEqual(colors.get(0), colors.get(4))
})

test('variant houses can create strong links, but knight conflicts alone cannot', () => {
  const masks = masksFor([0, 40])
  assert.equal(findStrongLinkGroups(masks, 1).groups.length, 0)
  assert.equal(findStrongLinkGroups(masks, 1, { version: 1, givens: EMPTY,
    rules: [{ type: 'diagonal', diagonal: 'main' }] }).groups.length, 1)
  assert.equal(findStrongLinkGroups(masks, 1, { version: 1, givens: EMPTY,
    rules: [{ type: 'extra-house', cells: [0, 1, 2, 3, 4, 5, 6, 7, 40] }] }).groups.length, 1)
  assert.equal(findStrongLinkGroups(masksFor([2, 13]), 1, { version: 1, givens: EMPTY,
    rules: [{ type: 'anti-knight' }] }).groups.length, 0)
})

test('an odd cycle is reported instead of painting a false two-color group', () => {
  const result = findStrongLinkGroups(masksFor([0, 1, 10]), 1, { version: 1, givens: EMPTY,
    rules: [{ type: 'diagonal', diagonal: 'main' }] })
  assert.equal(result.conflictingGroups, 1)
  assert.deepEqual(result.groups, [])
})

test('automatic coloring is one undo step and preserves unrelated marks, candidates, and entries', () => {
  let game = replaceCandidates(makeGame('links', 'Strong links', EMPTY, 'custom'), masksFor([0, 4, 36, 40]))
  game = enter(game, [0], 'corner', 2)
  game = enter(game, [8], 'color', 6)
  game = paintCandidate(game, { cell: 0, digit: 2 }, 9)
  const { groups } = findStrongLinkGroups(masksFor([0, 4, 36, 40]), 1)
  const marks = strongLinkColorMarks(groups, 3)
  const colored = paintCandidates(game, marks)
  assert.equal(colored.past.length, game.past.length + 1)
  assert.equal(colored.position.candidateColors?.[0]?.[2], 9)
  assert.equal(colored.position.colors, game.position.colors)
  assert.equal(colored.position.entries, game.position.entries)
  assert.equal(colored.position.corner, game.position.corner)
  assert.equal(colored.position.center, game.position.center)
  assert.deepEqual(undo(colored).position, game.position)
  assert.deepEqual(redo(undo(colored)).position, colored.position)
  assert.equal(paintCandidates(colored, marks), colored)
  assert.equal(paintCandidates(colored, [{ cell: 0, digit: 9, color: 1 }]), colored)
})

test('unrelated groups cannot silently reuse a color pair, and invalid inputs produce no marks', () => {
  const { groups } = findStrongLinkGroups(masksFor([0, 1]), 1)
  assert.deepEqual(strongLinkColorMarks(Array(7).fill(groups[0]), 1), [])
  for (const color of [0, 13, -1, 1.5, NaN]) assert.deepEqual(strongLinkColorMarks(groups, color), [])
  for (const digit of [0, 10, 1.5, NaN]) assert.deepEqual(findStrongLinkGroups(masksFor([0, 1]), digit).groups, [])
})

test('automatic cell coloring is one undo step, keeps candidate marks, and is safe to repeat', () => {
  let game = replaceCandidates(makeGame('links', 'Strong links', EMPTY, 'custom'), masksFor([0, 4, 36, 40]))
  game = paintCandidate(game, { cell: 0, digit: 1 }, 9)
  game = enter(game, [8], 'color', 6)
  const { groups } = findStrongLinkGroups(masksFor([0, 4, 36, 40]), 1)
  const marks = strongLinkColorMarks(groups, 5)
  const colored = paintCells(game, marks)
  assert.equal(colored.past.length, game.past.length + 1)
  for (const { cell, color } of marks) assert.equal(colored.position.colors[cell], color)
  assert.equal(colored.position.colors[8], 6)
  assert.equal(colored.position.candidateColors, game.position.candidateColors)
  assert.equal(colored.position.entries, game.position.entries)
  assert.equal(colored.position.corner, game.position.corner)
  assert.equal(colored.position.center, game.position.center)
  assert.deepEqual(undo(colored).position, game.position)
  assert.deepEqual(redo(undo(colored)).position, colored.position)
  assert.equal(paintCells(colored, marks), colored)
  for (const cell of [-1, 81, 1.5, NaN]) assert.equal(paintCells(colored, [{ cell, color: 1 }]), colored)
  for (const color of [-1, 13, 1.5, NaN]) assert.equal(paintCells(colored, [{ cell: 0, color }]), colored)
})
