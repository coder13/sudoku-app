import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantDifficulties, variantIdForPuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'

const published = JSON.parse(readFileSync(new URL('./fixtures/region-sum-newman.json', import.meta.url), 'utf8'))
const coach = JSON.parse(readFileSync(new URL('./fixtures/region-sum-coach.json', import.meta.url), 'utf8')).examples
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
const board = (puzzle: VariantPuzzle) => createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens })

test('desktop and mobile keep every source path, thermometer and dot with accessible part labels', () => {
  for (const source of [published, ...coach]) {
    const grid = board(source.puzzle)
    const mobile = createElement(MobilePanelLayout, { puzzleId: 'region-sum', rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: false, panels: { puzzle: { title: 'Puzzle', content: grid } } })
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      const rules = source.puzzle.rules.filter((rule: { type: string }) => rule.type === 'region-sum')
      assert.equal([...html.matchAll(/class="variant-region-sum"/g)].length, rules.length)
      for (const rule of rules) {
        assert.ok(html.includes('points="' + rule.cells.map((cell: number) => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' ') + '"'))
        for (const cell of rule.cells) assert.match(html.match(new RegExp(`data-cell="${cell}"[^>]*aria-label="([^"]+)"`))![1], /Region Sum line \d+, part \d+, same total/)
      }
      if (source === coach[0]) assert.equal([...html.matchAll(/class="variant-thermometer"/g)].length, 11)
      if (source === coach[2]) assert.equal([...html.matchAll(/class="variant-dot variant-dot-white"/g)].length, 17)
    }
  }
})

test('cell part descriptions follow Jigsaw borders and explicit combined visits', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), regions: { type: 'jigsaw', regions:
    Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)) },
    rules: [{ type: 'region-sum', cells: [1, 4, 13] }] }
  const cellLabel = (puzzle: VariantPuzzle, cell: number) => renderToStaticMarkup(board(puzzle)).match(new RegExp(`data-cell="${cell}"[^>]*aria-label="([^"]+)"`))![1]
  assert.match(cellLabel(puzzle, 4), /line 1, part 1/)
  assert.match(cellLabel({ ...puzzle, regions: undefined }, 4), /line 1, part 2/)
  const combined: VariantPuzzle = { ...puzzle, regions: undefined, rules: [{ type: 'region-sum', cells: [1, 21, 2], groupByRegion: true }] }
  assert.match(cellLabel(combined, 2), /line 1, part 1.*visits to each region are combined/)
  assert.match(variantRuleDescriptions(combined).join(' '), /combine all visits/)
})

test('closed paths, separated logical cells and overlapping families remain visible in all orientations', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'region-sum', cells: [34, 33, 24, 25], segments: [[25, 34, 33, 24, 25]] },
    { type: 'region-sum', cells: [0, 40, 80] },
    { type: 'renban', cells: [0, 10, 20] }, { type: 'modular', cells: [0, 10, 20] },
    { type: 'between', cells: [0, 10, 20] }, { type: 'thermometer', cells: [0, 10] },
  ] }
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const changed = reflectVariant(puzzle, symmetry), html = renderToStaticMarkup(board(changed))
    const closed = changed.rules![0]
    assert.ok(closed.type === 'region-sum' && closed.segments)
    assert.ok(html.includes('points="' + closed.segments[0].map(cell => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' ') + '"'))
    assert.equal([...html.matchAll(/class="variant-region-sum-jump"/g)].length, 2)
    assert.equal([...html.matchAll(/class="variant-region-sum-node"/g)].length, 3)
    assert.match(html, /class="variant-region-sum-overlap"/)
    assert.match(html, /class="variant-between-overlap"/)
    assert.ok(html.indexOf('class="variant-region-sum"') > html.indexOf('class="variant-thermometer"'))
  }
})

test('sharing after progress preserves all original Region Sum rules and companions', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    for (const source of [published, ...coach]) {
      const id = variantIdForPuzzle(source.puzzle)
      assert.ok(id !== 'classic')
      const variant = { id, puzzle: source.puzzle, solution: source.solution }
      const game = { ...makeGame('region-sum-share', 'Region Sum Lines', source.puzzle.givens, 'imported'), variant }
      const cell = source.puzzle.givens.indexOf('0')
      const progressed = enter(game, [cell], 'value', Number(source.solution[cell]))
      const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
      assert.match(html, /Create link/)
      assert.deepEqual((await publishFixture(progressed)).variant, { id: variant.id, puzzle: variant.puzzle })
    }
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('New Puzzle offers its checked Medium recipe and a visible Region Sum preview', () => {
  assert.deepEqual(variantDifficulties('region-sum'), ['medium'])
  assert.match(renderToStaticMarkup(createElement(VariantPreview, { variant: 'region-sum' })), /class="variant-region-sum"/)
})
