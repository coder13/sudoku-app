import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/inequality-palindrome14.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle }
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
})
after(async () => { await server?.close() })

test('the desktop and mobile grids draw every published sign, line and dot with directed cell labels', () => {
  const { puzzle } = fixture
  const board = createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens, label: 'Inequality Sudoku grid' })
  const mobile = createElement(MobilePanelLayout, { puzzleId: 'FzzD', rearranging: false, onRearrangingChange() {}, blocked: false,
    withHint: false, panels: { puzzle: { title: 'Puzzle', content: board } } })
  for (const node of [board, mobile]) {
    const html = renderToStaticMarkup(node)
    assert.equal([...html.matchAll(/class="variant-inequality"/g)].length, 7)
    assert.equal([...html.matchAll(/class="variant-dot variant-dot-white"/g)].length, 5)
    assert.equal([...html.matchAll(/class="variant-palindrome"/g)].length, 3)
    for (const rule of puzzle.rules!) if (rule.type === 'inequality') {
      assert.ok(html.includes(`data-less="${rule.less}" data-greater="${rule.greater}"`))
      assert.ok(html.includes(`inequality, smaller than row ${Math.floor(rule.greater / 9) + 1}, column ${rule.greater % 9 + 1}`))
      assert.ok(html.includes(`inequality, larger than row ${Math.floor(rule.less / 9) + 1}, column ${rule.less % 9 + 1}`))
    }
  }
})

test('sign vertices face the smaller cell after every transform, including distant and dotted endpoints', () => {
  const rules: VariantRule[] = [
    { type: 'inequality', less: 0, greater: 1 }, { type: 'inequality', less: 22, greater: 13 },
    { type: 'inequality', less: 28, greater: 70 }, { type: 'kropki', consecutive: { pairs: [[0, 1]] } },
  ]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant({ version: 1, givens: '0'.repeat(81), rules }, symmetry)
    const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
    const signs = [...html.matchAll(/class="variant-inequality" data-less="(\d+)" data-greater="(\d+)">([\s\S]*?)<\/g>/g)]
    assert.equal(signs.length, 3)
    assert.equal([...html.matchAll(/class="variant-inequality-connector"/g)].length, 1)
    assert.equal([...html.matchAll(/class="variant-dot variant-dot-white"/g)].length, 1)
    for (const [, small, large, drawing] of signs) {
      const points = drawing.match(/class="variant-inequality-sign" points="([^"]+)"/)![1].split(' ').map(point => point.split(',').map(Number))
      const dx = Number(large) % 9 - Number(small) % 9, dy = Math.floor(Number(large) / 9) - Math.floor(Number(small) / 9)
      // Independent geometric direction: the vertex projects closer to the
      // smaller cell than either arm does, even when a dot shifts the symbol.
      for (const arm of [points[0], points[2]]) assert.ok((arm[0] - points[1][0]) * dx + (arm[1] - points[1][1]) * dy > 0)
    }
  }
})
