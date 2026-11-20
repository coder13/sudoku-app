import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictsOf, enter, fillEntries, makeGame, move, redo, restartGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { MINI_GRID } from '../src/sudoku/grid.ts'
import { readGame } from '../src/sudoku/storage.ts'

test('4×4 progress, masks and undo survive a save and reload', () => {
  const original = makeGame('mini', 'Mini Sudoku', '0234341221434321', 'imported', 0, MINI_GRID)
  const candidate = enter(original, [0], 'candidate', 1)
  const played = undo(enter(candidate, [0], 'value', 1))
  const loaded = readGame(played.id, JSON.stringify(played))
  assert.deepEqual(loaded?.grid, MINI_GRID)
  assert.deepEqual(loaded?.position, played.position)
  assert.deepEqual(redo(loaded!).position, redo(played).position)
  assert.equal(restartGame(loaded!).position.entries, '0'.repeat(16))
  assert.equal(readGame(played.id, JSON.stringify({ ...played, grid: undefined })), undefined)
  assert.equal(readGame(played.id, JSON.stringify({
    ...played, position: { ...played.position, corner: [16, ...Array(15).fill(0)] },
  })), undefined)
})

test('an algebraic draft keeps its cages in undo history and rejects overlapping or misplaced cage state', () => {
  const draft = makeGame('cage-draft', 'Cage draft', '0'.repeat(16), 'draft', 0, MINI_GRID)
  draft.position.draftCages = []
  const cage = { type: 'algebraic-cage', cells: [0], label: 'n', total: { type: 'variable', name: 'n', offset: 0 } } as const
  const edited = move(draft, { ...draft.position, draftCages: [cage] })
  const loaded = readGame(edited.id, JSON.stringify(edited))!
  assert.deepEqual(loaded.position.draftCages, [cage])
  assert.deepEqual(undo(loaded).position.draftCages, [])
  assert.deepEqual(redo(undo(loaded)).position.draftCages, [cage])
  assert.equal(readGame(loaded.id, JSON.stringify({ ...loaded, source: 'custom' })), undefined)
  assert.equal(readGame(loaded.id, JSON.stringify({ ...loaded, position: { ...loaded.position, draftCages: [cage, cage] } })), undefined)
})

test('a Mini Arrow clears both kinds of candidates, reports bad sums, and survives history', () => {
  const solution = '1234341221434321'
  const rules = [{ type: 'arrow', circle: 1, cells: [0, 6] }] as const
  const game = { ...makeGame('mini-arrow', 'Mini Arrow', '0'.repeat(16), 'imported', 0, MINI_GRID), sized: { solution, rules } }
  game.position.center.fill(15)
  game.position.corner.fill(15)
  const played = enter(game, [1], 'value', 2)
  for (const cell of [0, 6]) {
    assert.equal(played.position.center[cell], 1)
    assert.equal(played.position.corner[cell], 1)
  }
  const filled = fillEntries(game, '0200000000000000')
  assert.equal(filled.position.entries, played.position.entries)
  for (const cell of [0, 6]) {
    assert.equal(filled.position.center[cell], played.position.center[cell])
    assert.equal(filled.position.corner[cell], played.position.corner[cell])
  }
  const wrong = enter(played, [6], 'value', 2)
  assert.deepEqual(conflictsOf(valuesOf(wrong), undefined, MINI_GRID, rules), new Set([1, 6]))
  const correct = enter(enter(played, [0], 'value', 1), [6], 'value', 1)
  assert.equal(conflictsOf(valuesOf(correct), undefined, MINI_GRID, rules).size, 0)
  const loaded = readGame(correct.id, JSON.stringify(correct))!
  assert.deepEqual(loaded.sized, game.sized)
  assert.deepEqual(redo(undo(loaded)).position, correct.position)
  assert.equal(readGame(game.id, JSON.stringify({ ...game, sized: { solution, rules: [{ ...rules[0], cells: [0, 5] }] } })), undefined)
})

test('Mini Region Sum applies each box visit to Pencil and preserves the rule on reload', () => {
  const solution = '1234341221434321'
  const rules = [{ type: 'region-sum', cells: [0, 4, 9, 13, 10, 5] }] as const
  const game = { ...makeGame('mini-region-sum', 'Mini Region Sum', '0030000000000001', 'imported', 0, MINI_GRID),
    sized: { solution, rules } }
  game.position.center.fill(15)
  game.position.corner.fill(15)
  const played = enter(game, [10], 'value', 4)
  for (const kind of ['center', 'corner'] as const) {
    assert.equal(played.position[kind][0] & 8, 0)
    assert.equal(played.position[kind][5], 8)
    assert.deepEqual(fillEntries(game, valuesOf(played)).position[kind], played.position[kind])
  }
  const wrong = enter(played, [5], 'value', 2)
  assert.deepEqual(conflictsOf(valuesOf(wrong), undefined, MINI_GRID, rules), new Set([10, 5]))
  const correct = enter(played, [5], 'value', 4)
  assert.equal(conflictsOf(valuesOf(correct), undefined, MINI_GRID, rules).size, 0)
  const loaded = readGame(correct.id, JSON.stringify(correct))!
  assert.deepEqual(loaded.sized, game.sized)
  assert.deepEqual(redo(undo(loaded)).position, correct.position)
  const grouped = [{ ...rules[0], groupByRegion: true }]
  assert.equal(readGame(game.id, JSON.stringify({ ...game, sized: { solution, rules: grouped } })), undefined)
})
