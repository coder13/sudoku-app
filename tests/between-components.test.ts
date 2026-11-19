import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantDifficulties, variantIdForPuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'

const published = JSON.parse(readFileSync(new URL('./fixtures/between-newman.json', import.meta.url), 'utf8'))
const mixed = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, VariantPreview: Component
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
})
after(async () => { await server?.close() })

test('every original path and both endpoint circles appear on desktop and mobile grids', () => {
  for (const source of [published, mixed]) {
    const grid = createElement(Board, { variantPuzzle: source.puzzle, givens: source.puzzle.givens, values: source.puzzle.givens })
    const mobile = createElement(MobilePanelLayout, { puzzleId: 'between', rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: false, panels: { puzzle: { title: 'Puzzle', content: grid } } })
    const lines = source.puzzle.rules.filter((rule: { type: string }) => rule.type === 'between')
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      assert.equal([...html.matchAll(/class="variant-between"/g)].length, lines.length)
      assert.equal([...html.matchAll(/class="variant-between-endpoints"/g)].length, lines.length)
      for (const rule of lines) {
        const points = rule.cells.map((cell: number) => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' ')
        assert.ok(html.includes(`points="${points}"`))
        for (const cell of [rule.cells[0], rule.cells.at(-1)]) {
          const label = html.match(new RegExp(`data-cell="${cell}"[^>]*aria-label="([^"]+)"`))![1]
          assert.match(label, /Between line \d+ endpoint circle, other endpoint at row/)
        }
      }
      if (source === mixed) assert.equal([...html.matchAll(/class="variant-dot variant-dot-black"/g)].length, 11)
    }
  }
})

test('overlapping line families stay visible and endpoint rings are above the line overlays in every orientation', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'between', cells: [0, 10, 20, 30, 40] },
    { type: 'modular', cells: [0, 20] },
    { type: 'entropic', cells: [0, 10, 20] },
    { type: 'renban', cells: [0, 10, 20] },
    { type: 'thermometer', cells: [0, 10] },
    { type: 'palindrome', cells: [10, 20] },
    { type: 'whispers', cells: [0, 10], minDifference: 4 },
  ] }
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const changed = reflectVariant(puzzle, symmetry)
    const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: changed, givens: changed.givens, values: changed.givens }))
    for (const family of ['between', 'modular', 'entropic', 'renban']) assert.match(html, new RegExp(`class="variant-${family}-overlap"`))
    assert.ok(html.indexOf('variant-between-endpoints') > html.indexOf('variant-between-overlap'))
    assert.ok(html.indexOf('variant-between-endpoints') > html.indexOf('variant-palindrome-overlap'))
    assert.ok(html.indexOf('variant-between-endpoints') > html.indexOf('variant-thermometer'))
    const between = changed.rules![0]
    assert.ok('cells' in between)
    const interior = between.cells[1]
    assert.match(html.match(new RegExp(`data-cell="${interior}"[^>]*aria-label="([^"]+)"`))![1], /Between line 1 interior, digit strictly between the circles/)
  }
})

test('sharing after progress preserves the original givens, independent paths and all black dots', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    for (const source of [published, mixed]) {
      const variant = { id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle, solution: source.solution }
      const game = { ...makeGame('between-share', 'Between Lines', source.puzzle.givens, 'imported'), variant }
      const cell = source.puzzle.givens.indexOf('0')
      const html = renderToStaticMarkup(createElement(SharePuzzle, { game: enter(game, [cell], 'value', Number(source.solution[cell])), close() {} }))
      const code = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
      assert.deepEqual((await detectPuzzle(code)).variant, { id: variant.id, puzzle: variant.puzzle })
    }
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('native separated cells use explicit nodes and dashed connectors without constraining crossed cells', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'between', cells: [0, 40, 80] }] }
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
  assert.equal([...html.matchAll(/class="variant-between-jump"/g)].length, 2)
  assert.equal([...html.matchAll(/class="variant-between-node"/g)].length, 1)
  assert.match(html.match(/data-cell="40"[^>]*aria-label="([^"]+)"/)![1], /Between line 1 interior/)
  assert.doesNotMatch(html.match(/data-cell="20"[^>]*aria-label="([^"]+)"/)![1], /Between/)
  assert.match(variantRuleDescriptions(puzzle).join(' '), /connector skips cells/)
})

test('the New Puzzle choice has a real clue preview and offers its checked Easy and Medium levels', () => {
  assert.deepEqual(variantDifficulties('between'), ['easy', 'medium'])
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'between' }))
  assert.match(html, /data-variant="between"/)
  assert.equal([...html.matchAll(/class="variant-between-endpoints"/g)].length, 2)
})
