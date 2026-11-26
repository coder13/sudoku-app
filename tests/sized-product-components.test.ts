import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { SizedConstraintRule } from '../src/sudoku/engine.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'

let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('#439 product cage shading, caption, and corner-rule descriptions render accessibly', () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  const rules: readonly SizedConstraintRule[] = [
    { type: 'product-cage', cells: [8, 10, 13, 14, 15, 16, 22, 26, 27, 28], product: 10_000, color: '#ffbfffff' },
    { type: 'digit-count', cells: [0, 5, 30, 35], digit: 3, minimum: 1 },
  ]
  const html = renderToStaticMarkup(createElement(Board, {
    grid, givens: '0'.repeat(36), values: '0'.repeat(36), sizedRules: rules, showGuides: true,
  }))
  assert.match(html, /class="variant-product-cage" data-product-cage="10000"/)
  assert.equal((html.match(/data-product-cage-cell=/g) ?? []).length, 10)
  assert.match(html, /fill="#ffbfffff" fill-opacity="\.4"/)
  assert.match(html, /product cage with product 10000/)
  assert.match(html, /corner cell, at least one corner contains 3/)
  assert.ok(sizedRuleDescriptions(grid, rules).includes('At least one of the four corner cells must contain 3.'))
})
