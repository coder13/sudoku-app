import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { SizedGrid } from '../src/sudoku/grid.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'

let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('sized shaded Maximum clues render a chevron and name their edge comparisons accessibly', () => {
  const grid: SizedGrid = { size: 3, regions: [[0, 1, 2], [3, 6, 7], [4, 5, 8]] }
  const rules = [{ type: 'maximum', cells: [0], ignoreMarkedNeighbors: true, shaded: true }]
  const html = renderToStaticMarkup(createElement(Board, {
    grid, givens: '000000000', values: '000000000', sizedRules: rules, showGuides: true,
  }))
  assert.match(html, /class="variant-extremum" data-extremum="maximum" data-extremum-cell="0"/)
  assert.match(html, /Shaded Maximum mark, larger than each orthogonally adjacent unshaded cell/)
  assert.ok(sizedRuleDescriptions(grid, rules).includes('Each shaded cell has a higher digit than every unshaded cell that shares an edge with it.'))
})
