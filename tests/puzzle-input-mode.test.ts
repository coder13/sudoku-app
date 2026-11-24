import assert from 'node:assert/strict'
import { test } from 'node:test'
import { puzzleInputMode, type PuzzleInputMode } from '../src/sudoku/puzzle-input-mode.ts'

const blank = {
  drawingLinks: false, browsingStrongLinks: false,
  erasing: false, coloring: false, highlighting: false, penciling: false,
}

test('puzzle always has an active input mode', () => {
  const valid: readonly PuzzleInputMode[] = ['pen', 'pencil', 'highlight', 'erase', 'color', 'chain']
  for (let flags = 0; flags < 1 << Object.keys(blank).length; flags++) {
    const options = Object.fromEntries(
      Object.keys(blank).map((key, index) => [key, Boolean(flags & (1 << index))]),
    ) as typeof blank
    assert.ok(valid.includes(puzzleInputMode(options)), `flags ${flags} produced no active mode`)
  }
  assert.equal(puzzleInputMode(blank), 'pen')
})

test('mode icon follows the current grid action, not the selected tool tab', () => {
  assert.equal(puzzleInputMode({ ...blank, penciling: true }), 'pencil')
  assert.equal(puzzleInputMode({ ...blank, highlighting: true }), 'highlight')
  assert.equal(puzzleInputMode({ ...blank, erasing: true }), 'erase')
  assert.equal(puzzleInputMode({ ...blank, coloring: true }), 'color')
  assert.equal(puzzleInputMode({ ...blank, drawingLinks: true }), 'chain')
  assert.equal(puzzleInputMode({ ...blank, browsingStrongLinks: true }), 'chain')
  assert.equal(puzzleInputMode({ ...blank, drawingLinks: true, coloring: true, penciling: true }), 'chain')
  assert.equal(puzzleInputMode({ ...blank, coloring: true, highlighting: true }), 'color')
  assert.equal(puzzleInputMode({ ...blank, erasing: true, coloring: true }), 'erase')
})
