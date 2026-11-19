import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { boardLinkEndpoints } from '../src/sudoku/board-link-geometry.ts'

const sources = ['murphy', 'newman', 'mixed'].map(name => JSON.parse(readFileSync(new URL('./fixtures/clone-' + name + '.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string })
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
const board = (puzzle: VariantPuzzle, extra = {}) => createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens, ...extra })

test('desktop and mobile preserve every published Clone cell, matching letter and accessible partner address', () => {
  for (const source of sources) {
    const grid = board(source.puzzle)
    const mobile = createElement(MobilePanelLayout, { puzzleId: 'clone', rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: false, panels: { puzzle: { title: 'Puzzle', content: grid } } })
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      const rules = source.puzzle.rules!.filter(rule => rule.type === 'clone')
      assert.equal([...html.matchAll(/class="variant-clone"/g)].length, rules.length)
      for (const [i, cells] of rules.flatMap(rule => rule.groups).entries()) for (const cell of cells) {
        const letter = String.fromCharCode(65 + i)
        assert.ok(html.includes('data-clone-cell="' + cell + '"'))
        assert.ok(html.includes('data-cell="' + cell + '" data-clone="' + letter + '"'))
        const label = html.match(new RegExp('data-cell="' + cell + '"[^>]*aria-label="([^"]+)"'))![1]
        assert.ok(label.includes('Clone ' + letter + ', same digit as'))
        for (const partner of cells.filter(other => other !== cell)) assert.ok(label.includes('row ' + (Math.floor(partner / 9) + 1) + ', column ' + (partner % 9 + 1)))
        assert.ok(html.includes('data-clone-label-cell="' + cell + '"'))
      }
      if (source === sources[2]) {
        for (const name of ['variant-thermometer', 'variant-parity', 'variant-cage-edge', 'variant-dot-white', 'variant-dot-black']) assert.ok(html.includes(name))
        assert.ok(html.indexOf('class="variant-clone"') < html.indexOf('class="variant-thermometer"'))
      }
    }
  }
})

test('overlapping sets use one transitive label, preserve three-way copies and keep every candidate button', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'clone', groups: [[0,40], [8,30,52]] }, { type: 'clone', groups: [[40,80]] },
  ] }
  const html = renderToStaticMarkup(board(puzzle, { candidates: Array(81).fill(511), onCandidate() {} }))
  for (const cell of [0,40,80]) assert.ok(html.includes('data-cell="' + cell + '" data-clone="A"'))
  for (const cell of [8,30,52]) assert.ok(html.includes('data-cell="' + cell + '" data-clone="B"'))
  assert.equal([...html.matchAll(/class="variant-clone-label"/g)].length, 2)
  assert.equal([...html.matchAll(/class="board-candidate candidate-button/g)].length, 81 * 9)
  const dense: VariantPuzzle = { version: 1, givens: puzzle.givens, rules: [{ type: 'clone', groups:
    Array.from({ length: 40 }, (_, i) => [i, i + 40]) }] }
  const denseHtml = renderToStaticMarkup(board(dense))
  assert.ok(denseHtml.includes('data-cell="26" data-clone="AA"'))
  assert.ok(denseHtml.includes('data-cell="39" data-clone="AN"'))
})

test('every grid transform keeps visible Clone labels at the declared cells', () => {
  for (const source of sources) for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(source.puzzle, symmetry), html = renderToStaticMarkup(board(puzzle))
    for (const [i, cells] of puzzle.rules!.flatMap(rule => rule.type === 'clone' ? rule.groups : []).entries()) for (const cell of cells) {
      assert.ok(html.includes('data-cell="' + cell + '" data-clone="' + String.fromCharCode(65 + i) + '"'))
    }
  }
})

test('sharing after progress keeps the original Clone definition and every companion', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    for (const source of sources) {
      const id = variantIdForPuzzle(source.puzzle)
      assert.ok(id !== 'classic')
      const variant = { id, puzzle: source.puzzle, solution: source.solution }
      const game = { ...makeGame('clone-share', 'Clone', source.puzzle.givens, 'imported'), variant }
      const cell = source.puzzle.givens.indexOf('0')
      const progressed = enter(game, [cell], 'value', Number(source.solution[cell]))
      const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
      assert.match(html, /Create link/)
      assert.deepEqual((await publishFixture(progressed)).variant, { id, puzzle: source.puzzle })
    }
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('New Puzzle exposes the checked Easy level and a preview with matching Clone letters', () => {
  assert.deepEqual(variantDifficulties('clone'), ['easy'])
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'clone' }))
  assert.match(html, /class="variant-clone"/)
  assert.equal([...html.matchAll(/data-clone-label-cell/g)].length, 8)
})

test('advanced candidate links follow Clone and cage caption insets while cell links retain their centers', () => {
  const insets = new Map([[0, { top: .07, bottom: .28 }], [40, { top: .3, bottom: .28 }]])
  const endpoints = boardLinkEndpoints({ cell: 0, digit: 1 }, { cell: 40, digit: 9 }, insets)!
  assert.ok(Math.abs(endpoints.start.x - 2.1333333333333333) < 1e-10)
  assert.ok(Math.abs(endpoints.start.y - 1.7833333333333334) < 1e-10)
  assert.ok(Math.abs(endpoints.end.x - 47.86666666666667) < 1e-10)
  assert.ok(Math.abs(endpoints.end.y - 46.5) < 1e-10)
  assert.deepEqual(boardLinkEndpoints({ cell: 0 }, { cell: 40 }, insets), { start: { x: 5, y: 5 }, end: { x: 45, y: 45 } })
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'clone', groups: [[0,40]] }, { type: 'killer-cages', cages: [{ cells: [40,41], sum: 7 }] },
  ] }
  const html = renderToStaticMarkup(board(puzzle, { candidates: Array(81).fill(511), annotations: { links: [
    { from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' },
  ] } }))
  const points = html.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1].split(' ').map(pair => pair.split(',').map(Number))
  // Trimmed endpoints remain on the line joining the displayed candidate centers.
  for (const [x, y] of points) assert.ok(Math.abs((y - endpoints.start.y) * (endpoints.end.x - endpoints.start.x)
    - (x - endpoints.start.x) * (endpoints.end.y - endpoints.start.y)) < 1e-8)
})
