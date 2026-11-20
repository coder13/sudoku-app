import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DEFAULT_DARK_THEME, THEME_IDS, THEME_OPTIONS, THEME_TOKENS, contrast } from '../src/sudoku/themes.ts'

const standardThemeIds = THEME_IDS.filter((id) => id !== 'andoku')

function distance(first: string, second: string) {
  const channels = (color: string) => [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
  const a = channels(first)
  const b = channels(second)
  return Math.sqrt(a.reduce((total, value, index) => total + (value - b[index]) ** 2, 0))
}

describe('theme palette system', () => {
  test('uses GitHub accents in dark mode by default', () => {
    assert.equal(DEFAULT_DARK_THEME, 'github')
  })

  test('every selectable theme has a named light and dark palette', () => {
    assert.deepEqual(THEME_OPTIONS.map(({ id }) => id), [...THEME_IDS])
    for (const { id, name } of THEME_OPTIONS) {
      assert.ok(name.length > 0)
      assert.ok(THEME_TOKENS[id].light)
      assert.ok(THEME_TOKENS[id].dark)
    }
  })

  test('standard themes share grayscale surfaces in each color mode', () => {
    const backgrounds = [
      'pageBg', 'surface', 'surfaceRaised', 'surfaceSoft', 'surfaceMuted', 'surfaceHover',
      'surfaceHoverStrong', 'surfaceActive', 'boardBg', 'givenBg', 'peerBg', 'keyBg', 'centerNoteBg',
    ] as const
    for (const key of backgrounds) {
      const { light, dark } = THEME_TOKENS.violet
      assert.notEqual(light[key], dark[key], key)
      for (const mode of ['light', 'dark'] as const) {
        const expected = THEME_TOKENS.violet[mode][key]
        assert.match(expected, /^#([0-9a-f]{2})\1\1$/)
        for (const id of standardThemeIds) {
          assert.equal(THEME_TOKENS[id][mode][key], expected, `${id} ${mode} ${key}`)
        }
      }
    }
  })

  test('Andoku uses a light grid and distinct yellow highlights in both modes', () => {
    const { light, dark } = THEME_TOKENS.andoku
    assert.deepEqual(light, dark)
    assert.ok(contrast(light.boardBg, light.pageBg) >= 8, 'grid against the charcoal background')
    assert.ok(contrast(light.gridStrong, light.boardBoxBg) >= 3, 'box border against the shaded boxes')
    assert.ok(distance(light.boardBoxBg, light.boardBg) >= 7, 'alternating box backgrounds')
    assert.ok(contrast(light.matchingBg, light.boardBg) >= 1.4, 'candidate highlight against the grid')
    assert.ok(contrast(light.matchingDigitBg, light.boardBg) >= 1.3, 'digit highlight against the grid')
    assert.ok(distance(light.matchingBg, light.matchingDigitBg) >= 7, 'candidate and digit highlights')
    assert.ok(contrast(light.purple, light.keyBg) >= 4.5, 'pressed keypad digit')
  })

  test('standard light palettes distinguish cell highlights from the grid background', () => {
    const highlights = [
      ['peerBg', 1.3], ['matchingBg', 1.4], ['boardSelectedBg', 1.7], ['candidateCountBg', 1.6],
    ] as const
    for (const id of standardThemeIds) {
      const theme = THEME_TOKENS[id].light
      for (const [key, minimum] of highlights) {
        assert.ok(contrast(theme[key], theme.boardBg) >= minimum, `${id} ${key}`)
      }
    }
  })

  test('light board selections keep given and entered digits legible', () => {
    for (const id of THEME_IDS) {
      const theme = THEME_TOKENS[id].light
      assert.ok(contrast(theme.boardInk, theme.boardSelectedBg) >= 7, id)
      const entryMinimum = id === 'high-contrast' ? 7 : 4.9
      assert.ok(contrast(theme.entryInk, theme.boardSelectedBg) >= entryMinimum, id)
    }
  })

  test('standard dark palettes give highlights contrast against their surroundings', () => {
    for (const id of standardThemeIds) {
      const theme = THEME_TOKENS[id].dark
      const highlights = [
        ['related cells', theme.peerBg, theme.boardBg, 1.45],
        ['matching cells', theme.matchingBg, theme.boardBg, 2.2],
        ['matching and related cells', theme.matchingBg, theme.peerBg, 1.45],
        ['two-candidate cells', theme.candidateCountBg, theme.boardBg, 2.4],
        ['selected and matching cells', theme.boardSelectedBg, theme.matchingBg, 1.25],
        ['selected keypad digit', theme.selectedBg, theme.keyBg, 2.4],
        ['active surfaces', theme.surfaceActive, theme.surface, 1.6],
      ] as const
      for (const [label, fill, background, minimum] of highlights) {
        assert.ok(contrast(fill, background) >= minimum, `${id} ${label}`)
      }
    }
  })

  for (const { id, name } of THEME_OPTIONS) {
    for (const mode of ['light', 'dark'] as const) {
      test(`${name} ${mode} keeps text and controls readable`, () => {
        const theme = THEME_TOKENS[id][mode]
        assert.ok(contrast(theme.ink, theme.surface) >= 4.5, 'main text on cards')
        assert.ok(contrast(theme.keyInk, theme.keyBg) >= 4.5, 'digits on keypad buttons')
        assert.equal(theme.primaryInk, '#ffffff', 'primary button label color')
        assert.ok(contrast(theme.primaryInk, theme.primaryBg) >= 5, 'primary button label')
        assert.ok(contrast(theme.primaryInk, theme.primaryHover) >= 5, 'primary button label on hover')
        assert.ok(contrast(theme.darkPurple, theme.selectedBg) >= 4.5, 'selected controls')
        assert.ok(contrast(theme.entryInk, theme.boardSelectedBg) >= 4.5, 'placed digits in selected cells')
        assert.ok(contrast(theme.boardInk, theme.matchingDigitBg) >= 4.5, 'matching givens')
        assert.match(theme.candidateInk, /^#([0-9a-f]{2})\1\1$/, 'neutral candidate text')
        for (const background of [theme.boardBg, theme.boardBoxBg, theme.peerBg, theme.matchingBg, theme.boardSelectedBg, theme.candidateCountBg]) {
          assert.ok(contrast(theme.candidateInk, background) >= 4.5, `candidate text on ${background}`)
        }
        assert.ok(contrast(theme.dangerInk, theme.dangerBg) >= 4.5, 'error text')
        assert.ok(contrast(theme.gridStrong, theme.boardBg) >= 3, '3×3 box lines')
        assert.ok(contrast(theme.selectedBorder, theme.selectedBg) >= 3, 'selected-control boundary')
        assert.ok(contrast(theme.boardSelectedBorder, theme.boardSelectedBg) >= 3, 'selected-cell boundary against the grid highlight')
      })

      test(`${name} ${mode} separates nested interface layers`, () => {
        const theme = THEME_TOKENS[id][mode]
        const pairs: [string, string, string][] = [
          ['page and card', theme.pageBg, theme.surface],
          ['card and raised control', theme.surface, theme.surfaceRaised],
          ['card and recessed control', theme.surface, theme.surfaceMuted],
          ['input panel and digit button', theme.surface, theme.keyBg],
          ['grid backgrounds', theme.boardBg, id === 'andoku' ? theme.boardBoxBg : theme.givenBg],
          ['board and two-candidate cells', theme.boardBg, theme.candidateCountBg],
          ['peer and matching cells', theme.peerBg, theme.matchingBg],
          ['digit and two-candidate highlights', theme.matchingBg, theme.candidateCountBg],
          ['matching candidates and selected cells', theme.matchingBg, theme.boardSelectedBg],
        ]
        for (const [label, first, second] of pairs) {
          assert.ok(distance(first, second) >= 7, `${label}: ${first} and ${second}`)
        }
      })
    }
  }
})
