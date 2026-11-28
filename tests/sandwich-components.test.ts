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

const sources = ['murphy', 'newman', 'coach-9VLq'].map(name => JSON.parse(readFileSync(new URL('./fixtures/sandwich-' + name + '.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string })
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

test('desktop, mobile and preview preserve every outside total with accessible row, column and zero labels', () => {
  for (const source of sources) {
    const grid = board(source.puzzle)
    const mobile = createElement(MobilePanelLayout, { puzzleId: 'sandwich', rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: false, panels: { puzzle: { title: 'Puzzle', content: grid } } })
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      const clues = source.puzzle.rules!.flatMap(rule => rule.type === 'sandwich' ? [rule] : [])
      assert.equal([...html.matchAll(/data-outside-clue="sandwich"/g)].length, clues.length)
      for (const rule of clues) {
        const side = rule.direction === 'south' ? 'top' : rule.direction === 'north' ? 'bottom' : rule.direction === 'east' ? 'left' : 'right'
        const name = side === 'top' || side === 'bottom' ? 'column ' + (rule.cells[0] % 9 + 1) : 'row ' + (Math.floor(rule.cells[0] / 9) + 1)
        assert.ok(html.includes('Sandwich ' + rule.sum + ', ' + side + ' of ' + name))
      }
      assert.ok(html.includes('has-outside-clues'))
      if (source === sources[2]) assert.ok(html.includes('class="variant-thermometer"'))
    }
  }
})

test('all four gutters retain zero, repeated labels and every candidate and link with guides hidden', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'sandwich', direction: 'south', cells: [0,9,18,27,36,45,54,63,72], sum: 0 },
    { type: 'sandwich', direction: 'north', cells: [80,71,62,53,44,35,26,17,8], sum: 35 },
    { type: 'sandwich', direction: 'east', cells: [0,1,2,3,4,5,6,7,8], sum: 0 },
    { type: 'sandwich', direction: 'east', cells: [0,1,2,3,4,5,6,7,8], sum: 0 },
    { type: 'sandwich', direction: 'west', cells: [80,79,78,77,76,75,74,73,72], sum: 35 },
  ] }
  const html = renderToStaticMarkup(board(puzzle, { showGuides: false, candidates: Array(81).fill(511), onCandidate() {}, annotations: { links: [
    { from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' },
  ] } }))
  assert.ok(html.includes('class="board-outside-clues" viewBox="0 0 9 9"'))
  assert.equal([...html.matchAll(/data-outside-clue="sandwich"/g)].length, 5)
  assert.ok(html.includes('--outside-left-track:1.4fr'))
  assert.ok(html.includes('data-outside-lane="1"'))
  assert.ok(html.includes('guides-hidden has-outside-clues'))
  assert.equal([...html.matchAll(/class="board-candidate candidate-button/g)].length, 729)
  const classic = renderToStaticMarkup(board({ ...puzzle, rules: [] }, { candidates: Array(81).fill(511), annotations: { links: [
    { from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' },
  ] } }))
  assert.equal(html.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1], classic.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1])
})

test('every grid transform retains outside labels and the complete published clue count', () => {
  for (const source of sources) for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(source.puzzle, symmetry), html = renderToStaticMarkup(board(puzzle))
    assert.equal([...html.matchAll(/data-outside-clue="sandwich"/g)].length, puzzle.rules!.filter(rule => rule.type === 'sandwich').length)
  }
})

test('sharing after progress preserves all outside clues and companion thermometers', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    for (const source of sources) {
      const id = variantIdForPuzzle(source.puzzle)
      assert.ok(id !== 'classic')
      const variant = { id, puzzle: source.puzzle, solution: source.solution }
      const game = { ...makeGame('sandwich-share', 'Sandwich', source.puzzle.givens, 'imported'), variant }
      const cell = source.puzzle.givens.indexOf('0')
      const progressed = enter(game, [cell], 'value', Number(source.solution[cell]))
      const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
      assert.match(html, /Create link/)
      assert.deepEqual((await publishFixture(progressed)).variant, { id, puzzle: source.puzzle })
    }
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('New Puzzle exposes the calibrated Hard level and a preview explaining an outside total', () => {
  assert.deepEqual(variantDifficulties('sandwich'), variantDifficulties('classic'))
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'sandwich' }))
  assert.match(html, /variant-sandwich-preview/)
  assert.ok(html.includes('1 · 2 3 5 · 9'))
})

test('Jigsaw teaching diagrams retain complete outside rays, region borders and caption-adjusted links', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sandwich-jigsaw-mixed.json', import.meta.url), 'utf8'))
  const html = renderToStaticMarkup(board(source.puzzle, { region: { row: 0, column: 0, rows: 3, columns: 3 }, showGuides: true,
    candidates: Array(81).fill(511), annotations: { links: [{ from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' }] } }))
  assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
  assert.ok(html.includes('jigsaw-board'))
  assert.ok(html.includes('variant-cage-edge'))
  assert.equal([...html.matchAll(/data-outside-clue="sandwich"/g)].length, 4)
  assert.ok(html.includes('viewBox="0 0 90 90"'))
  assert.ok(!html.includes('--board-rows:3'))
})
