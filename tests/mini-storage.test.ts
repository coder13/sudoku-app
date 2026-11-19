import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enter, makeGame, move, redo, restartGame, undo } from '../src/sudoku/game.ts'
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
