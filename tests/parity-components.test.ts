import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/parity-big-eight.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, CompletedPuzzle: Component
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
})

test('the real sharing and completion screens retain the imported puzzle without an uncalibrated recipe', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { hostname: 'example.test', origin: 'https://example.test' },
  } })
  try {
    const game = { ...makeGame('parity-share', 'Big Eight', fixture.puzzle.givens, 'imported'),
      variant: { id: 'parity' as const, puzzle: fixture.puzzle, solution: fixture.solution } }
    const progressed = enter(game, [0], 'value', Number(fixture.solution[0]))
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
    const shared = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(shared)).variant, { id: 'parity', puzzle: fixture.puzzle })
    game.position.entries = [...fixture.solution].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const completed = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
      ratingPending: false, shortcutEnabled: false, showGuides: true, onChooseDifficulty() {}, onChooseVariant() {} }))
    assert.match(completed, /Choose another puzzle/)
    assert.doesNotMatch(completed, /Next medium puzzle/)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
after(async () => { await server?.close() })

function board(puzzle = fixture.puzzle) {
  return createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens,
    label: 'Odd/Even Sudoku grid', showGuides: true })
}

test('desktop and mobile grids render all published odd circles and even squares with cell labels', () => {
  const desktop = renderToStaticMarkup(board())
  const mobile = renderToStaticMarkup(createElement(MobilePanelLayout, {
    puzzleId: 'parity-mobile', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false,
    panels: { puzzle: { title: 'Puzzle', content: board() } },
  }))
  for (const html of [desktop, mobile]) {
    assert.match(html, /aria-label="Odd\/Even Sudoku grid"/)
    const odd = html.match(/class="variant-parity variant-parity-odd">(.*?)<\/g>/)![1]
    const even = html.match(/class="variant-parity variant-parity-even">(.*?)<\/g>/)![1]
    assert.equal([...odd.matchAll(/<circle /g)].length, 13)
    assert.equal([...even.matchAll(/<rect /g)].length, 10)
    assert.match(odd, /cx="2.5" cy="1.5" r=".36"/)
    const square = even.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/)!
    assert.ok(Math.abs(Number(square[1]) - 5.14) < 1e-9 && Math.abs(Number(square[2]) - 1.14) < 1e-9)
    assert.equal(Number(square[3]), .72)
    assert.equal(Number(square[4]), .72)
    assert.equal([...html.matchAll(/odd circle, digit must be 1, 3, 5, 7, or 9/g)].length, 13)
    assert.equal([...html.matchAll(/even square, digit must be 2, 4, 6, or 8/g)].length, 10)
  }
})

test('cell markers stay behind mixed clues in either rule order and do not hide printed digits', () => {
  const parity: VariantRule = { type: 'parity', cells: [0, 40, 80], parity: 'odd' }
  const foreground: VariantRule[] = [
    { type: 'quadruple', topLeft: 0, digits: [1, 2] },
    { type: 'arrow', circle: 0, cells: [1, 2] },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 10 }] },
  ]
  for (const rules of [[parity, ...foreground], [...foreground, parity]]) {
    const html = renderToStaticMarkup(board({ version: 1, givens: '1' + '0'.repeat(80), rules }))
    assert.match(html, /cx="0.5" cy="0.5"/)
    assert.match(html, /cx="8.5" cy="8.5"/)
    assert.ok(html.indexOf('variant-parity-odd') < html.indexOf('variant-arrow-circle'))
    assert.ok(html.indexOf('variant-parity-odd') < html.indexOf('variant-cage-edge'))
    assert.ok(html.indexOf('variant-cage-edge') < html.indexOf('variant-quadruple'))
    assert.match(html, /class="cell-value"[^>]*>1<\/span>/)
    const cell = html.match(/data-cell="0"[^>]*aria-label="([^"]+)"/)![1]
    assert.match(cell, /odd circle/)
    assert.match(cell, /arrow circle/)
  }
})
