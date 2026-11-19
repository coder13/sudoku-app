import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enter, makeGame, redo, restartGame, undo } from '../src/sudoku/game.ts'
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
