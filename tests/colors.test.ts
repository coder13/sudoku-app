import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alternateColorShade, COLORS, EMPTY, enter, makeGame, paintCandidate, redo, undo } from '../src/sudoku/game.ts'
import { createPlayPreferenceStore, PLAY_PREFERENCES_KEY } from '../src/sudoku/play-preferences.ts'

test('saved color IDs retain their shades and each color has a reversible light/dark pair', () => {
  assert.deepEqual(COLORS.slice(0, 6), ['Rose', 'Peach', 'Yellow', 'Mint', 'Blue', 'Lavender'])
  for (let color = 1; color <= 6; color++) {
    const dark = alternateColorShade(color)!
    assert.equal(COLORS[dark - 1], `Dark ${COLORS[color - 1].toLowerCase()}`)
    assert.equal(alternateColorShade(dark), color)
  }
  for (const value of [0, -1, 13, 1.5, NaN]) assert.equal(alternateColorShade(value), null)
})

test('both shades work on cells and candidates without changing puzzle digits, with undo and redo', () => {
  let game = makeGame('colors', 'Colors', EMPTY, 'custom')
  game = enter(game, [0, 1], 'corner', 3)
  game = enter(game, [0], 'color', 5)
  game = enter(game, [1], 'color', 11)
  game = paintCandidate(game, { cell: 0, digit: 3 }, 5)
  game = paintCandidate(game, { cell: 1, digit: 3 }, 11)
  assert.deepEqual(game.position.colors.slice(0, 2), [5, 11])
  assert.deepEqual(game.position.candidateColors, { 0: { 3: 5 }, 1: { 3: 11 } })
  assert.equal(game.position.entries, EMPTY)
  assert.deepEqual(undo(game).position.candidateColors, { 0: { 3: 5 } })
  assert.deepEqual(redo(undo(game)).position, game.position)
  for (const invalid of [-1, 13, 1.5, NaN]) {
    assert.equal(enter(game, [0], 'color', invalid), game)
    assert.equal(paintCandidate(game, { cell: 0, digit: 3 }, invalid), game)
  }
})

test('the dark brush and color target survive a reload', () => {
  const saved = new Map<string, string>()
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value) },
  }
  const store = createPlayPreferenceStore(storage)
  store.set('selectedColor', 12)
  store.set('colorBrush', 12)
  store.set('colorTarget', 'candidate')
  const reloaded = createPlayPreferenceStore(storage).getSnapshot()
  assert.equal(reloaded.selectedColor, 12)
  assert.equal(reloaded.colorBrush, 12)
  assert.equal(reloaded.colorTarget, 'candidate')
  assert.ok(storage.getItem(PLAY_PREFERENCES_KEY))
})
