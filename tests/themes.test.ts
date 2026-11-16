import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { THEME_IDS, THEME_OPTIONS, THEME_TOKENS, contrast } from '../src/sudoku/themes.ts'

function distance(first: string, second: string) {
  const channels = (color: string) => [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
  const a = channels(first)
  const b = channels(second)
  return Math.sqrt(a.reduce((total, value, index) => total + (value - b[index]) ** 2, 0))
}

describe('theme palette system', () => {
  test('every selectable theme has a named light and dark palette', () => {
    assert.deepEqual(THEME_OPTIONS.map(({ id }) => id), [...THEME_IDS])
    for (const { id, name } of THEME_OPTIONS) {
      assert.ok(name.length > 0)
      assert.ok(THEME_TOKENS[id].light)
      assert.ok(THEME_TOKENS[id].dark)
    }
  })

  for (const { id, name } of THEME_OPTIONS) {
    for (const mode of ['light', 'dark'] as const) {
      test(`${name} ${mode} keeps text and controls readable`, () => {
        const theme = THEME_TOKENS[id][mode]
        assert.ok(contrast(theme.ink, theme.surface) >= 4.5, 'main text on cards')
        assert.ok(contrast(theme.keyInk, theme.keyBg) >= 4.5, 'digits on keypad buttons')
        assert.ok(contrast(theme.primaryInk, theme.purple) >= 4.5, 'primary button label')
        assert.ok(contrast(theme.dangerInk, theme.dangerBg) >= 4.5, 'error text')
        assert.ok(contrast(theme.gridStrong, theme.boardBg) >= 3, '3×3 box lines')
        assert.ok(contrast(theme.selectedBorder, theme.selectedBg) >= 3, 'selected-cell boundary')
      })

      test(`${name} ${mode} separates nested interface layers`, () => {
        const theme = THEME_TOKENS[id][mode]
        const pairs: [string, string, string][] = [
          ['page and card', theme.pageBg, theme.surface],
          ['card and raised control', theme.surface, theme.surfaceRaised],
          ['card and recessed control', theme.surface, theme.surfaceMuted],
          ['input panel and digit button', theme.surface, theme.keyBg],
          ['board and givens', theme.boardBg, theme.givenBg],
          ['peer and matching cells', theme.peerBg, theme.matchingBg],
          ['matching and selected cells', theme.matchingBg, theme.selectedBg],
        ]
        for (const [label, first, second] of pairs) {
          assert.ok(distance(first, second) >= 7, `${label}: ${first} and ${second}`)
        }
      })
    }
  }
})
