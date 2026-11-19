import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame } from '../src/sudoku/game.ts'
import { isVariantId, VARIANTS, variantDifficulties } from '../src/sudoku/variants.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-coach.json', import.meta.url), 'utf8')).examples[0] as {
  code: string; solution: string
}
let puzzle: VariantPuzzle, server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, CompletedPuzzle: Component, VariantPreview: Component
before(async () => {
  puzzle = (await detectPuzzle(fixture.code)).variant!.puzzle
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
})
after(async () => { await server?.close() })

test('New Puzzle offers Non-Consecutive with its neighbor rule and verified Easy/Medium choices', () => {
  assert.ok(isVariantId('non-consecutive'))
  assert.match(VARIANTS['non-consecutive'].rule, /1 and 9 are not consecutive/)
  assert.deepEqual(variantDifficulties('non-consecutive'), ['easy', 'medium'])
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'non-consecutive' }))
  assert.match(html, /data-variant="non-consecutive"/)
  assert.match(html, /No ±1 neighbors/)
  const digits = [...html.matchAll(/>([1-9])<\/text>/g)].map(match => Number(match[1]))
  assert.deepEqual(digits, [4, 8, 2])
  assert.ok(digits.slice(1).every((digit, i) => Math.abs(digit - digits[i]) > 1))
})

test('completed pure Non-Consecutive offers another calibrated puzzle while mixed exceptions keep their chooser', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-newman.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
  const game = { ...makeGame('nc-completed', 'Literally No One', source.puzzle.givens, 'imported'),
    variant: { id: 'non-consecutive' as const, puzzle: source.puzzle, solution: source.solution } }
  game.position.entries = [...source.solution].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
  const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
    ratingPending: false, shortcutEnabled: false, showGuides: true, onChooseDifficulty() {}, onChooseVariant() {} }))
  assert.match(html, /Next medium puzzle/)
  assert.match(html, /Choose difficulty/)
  assert.match(html, /Choose variant/)
})

test('desktop and mobile grids retain every real Coach dot and label its Non-Consecutive exception', () => {
  const board = createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens,
    label: 'Non-Consecutive and Kropki Sudoku grid', showGuides: true })
  const desktop = renderToStaticMarkup(board)
  const mobile = renderToStaticMarkup(createElement(MobilePanelLayout, {
    puzzleId: 'nc-mobile', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false,
    panels: { puzzle: { title: 'Puzzle', content: board } },
  }))
  for (const html of [desktop, mobile]) {
    assert.match(html, /aria-label="Non-Consecutive and Kropki Sudoku grid"/)
    assert.equal([...html.matchAll(/class="variant-dot variant-dot-white"/g)].length, 38)
    const first = html.match(/data-cell="0"[^>]*aria-label="([^"]+)"/)![1]
    assert.match(first, /white dot with row 1, column 2/)
    assert.match(first, /Non-Consecutive exception with row 1, column 2/)
  }
})

test('consecutive neighbors receive visible conflict feedback while an exempt pair remains valid', () => {
  const local: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'non-consecutive', except: [[0, 1]] }] }
  const values = Array<string>(81).fill('0'); values[0] = '4'; values[9] = '5'
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: local, givens: local.givens, values: values.join(''),
    errors: conflictsOf(values.join(''), local), showGuides: true }))
  for (const cell of [0, 9]) {
    assert.match(html.match(new RegExp(`data-cell="${cell}" class="([^"]+)"`))![1], /\bconflict\b/)
    assert.match(html.match(new RegExp(`data-cell="${cell}"[^>]*aria-label="([^"]+)"`))![1], /incorrect/)
  }
  values[9] = '0'; values[1] = '5'
  const exempt = renderToStaticMarkup(createElement(Board, { variantPuzzle: local, givens: local.givens, values: values.join(''),
    errors: conflictsOf(values.join(''), local), showGuides: true }))
  assert.doesNotMatch(exempt.match(/data-cell="1" class="([^"]+)"/)![1], /\bconflict\b/)
})

test('sharing after a move preserves mixed exceptions and completion retains the puzzle chooser', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const game = { ...makeGame('nc-share', 'Consecudoku', puzzle.givens, 'imported'),
      variant: { id: 'mixed' as const, puzzle, solution: fixture.solution } }
    const progressed = enter(game, [1], 'value', Number(fixture.solution[1]))
    const shared = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
    assert.match(shared, /Create link/)
    assert.doesNotMatch(shared, /id="share-output"/)
    assert.deepEqual((await publishFixture(progressed)).variant, { id: 'mixed', puzzle })
    game.position.entries = [...fixture.solution].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const completed = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
      ratingPending: false, shortcutEnabled: false, showGuides: true, onChooseDifficulty() {}, onChooseVariant() {} }))
    assert.match(completed, /Choose another puzzle/)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
