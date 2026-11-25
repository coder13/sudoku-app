import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { outsideClueLayout } from '../src/sudoku/outside-clues.ts'

const examples = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples as {
  url: string; code: string; solution: string
}[]
const orderSource = examples.find(example => example.url.endsWith('/7nms'))!
const spiralSource = examples.find(example => example.url.endsWith('/LEjN'))!
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('7nms outside digit-order clues render all seven group markers with accessible descriptions', async () => {
  const imported = await detectPuzzle(orderSource.code)
  assert.ok(imported.variant)
  const rules = imported.variant.puzzle.rules
  const orders = rules.filter(rule => rule.type === 'digit-order')
  assert.equal(orders.length, 7)
  const layout = outsideClueLayout(rules)
  assert.equal(layout.clues.filter(clue => clue.rule.type === 'digit-order').length, 7)
  assert.deepEqual(layout.clues.filter(clue => clue.rule.type === 'digit-order').map(clue => clue.label).sort(), ['H', 'H', 'H', 'L', 'L', 'M', 'M'])
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: imported.variant.puzzle, givens: imported.variant.puzzle.givens, values: orderSource.solution }))
  assert.equal([...html.matchAll(/data-outside-clue="digit-order"/g)].length, 7)
  assert.match(html, /Entropic low group clue outside column 4: digits 1, 2, 3 appear in ascending order from the top/)
  assert.match(html, /Entropic high group clue outside column 6: digits 7, 8, 9 appear in ascending order from the top/)
  assert.ok(html.includes('has-outside-clues'))
})

test('LEjN renders a visible line break at all sixteen forbidden Entropic connections', async () => {
  const imported = await detectPuzzle(spiralSource.code)
  assert.ok(imported.variant)
  const rules = imported.variant.puzzle.rules
  assert.equal(rules.filter(rule => rule.type === 'forbidden-entropic-connection').length, 16)
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: imported.variant.puzzle, givens: imported.variant.puzzle.givens, values: spiralSource.solution }))
  assert.equal([...html.matchAll(/class="variant-entropic-break"/g)].length, 16)
  assert.equal([...html.matchAll(/<line /g)].length, 32)
  assert.match(html, /Broken Entropic connection to row 4, column 6/)
})
