import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/anti-king-newman.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, CompletedPuzzle: Component
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
})
after(async () => { await server?.close() })

test('desktop and mobile grids label Anti-King and highlight its actual corner neighbors', () => {
  const board = createElement(Board, { variantPuzzle: fixture.puzzle, givens: fixture.puzzle.givens, values: fixture.puzzle.givens,
    label: 'Anti-King Sudoku grid', showGuides: true, selected: [2], active: 2 })
  const desktop = renderToStaticMarkup(board)
  const mobile = renderToStaticMarkup(createElement(MobilePanelLayout, {
    puzzleId: 'king-mobile', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false,
    panels: { puzzle: { title: 'Puzzle', content: board } },
  }))
  for (const html of [desktop, mobile]) {
    assert.match(html, /aria-label="Anti-King Sudoku grid"/)
    assert.match(html.match(/data-cell="12" class="([^"]+)"/)![1], /\bpeer\b/)
    assert.doesNotMatch(html.match(/data-cell="23" class="([^"]+)"/)![1], /\bpeer\b/)
    assert.match(html, /data-cell="12"[^>]*aria-label="Row 2, column 4, empty/)
  }
})

test('both conflicting corner placements receive the visible conflict class and accessible feedback', () => {
  const values = Array<string>(81).fill('0'); values[2] = values[12] = '5'
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'anti-king' }] }
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: values.join(''),
    errors: conflictsOf(values.join(''), puzzle), showGuides: true }))
  for (const cell of [2, 12]) {
    assert.match(html.match(new RegExp(`data-cell="${cell}" class="([^"]+)"`))![1], /\bconflict\b/)
    assert.match(html.match(new RegExp(`data-cell="${cell}"[^>]*aria-label="([^"]+)"`))![1], /incorrect/)
  }
})

test('sharing retains Anti-King after progress and completion offers the puzzle chooser', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const game = { ...makeGame('king-share', 'King of Diamonds', fixture.puzzle.givens, 'imported'),
      variant: { id: 'anti-king' as const, puzzle: fixture.puzzle, solution: fixture.solution } }
    const progressed = enter(game, [0], 'value', Number(fixture.solution[0]))
    const shared = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
    const payload = shared.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(payload)).variant, { id: 'anti-king', puzzle: fixture.puzzle })
    game.position.entries = [...fixture.solution].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const completed = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
      ratingPending: false, shortcutEnabled: false, showGuides: true, onChooseDifficulty() {}, onChooseVariant() {} }))
    assert.match(completed, /Choose another puzzle/)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
