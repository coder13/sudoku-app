import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { NINE_BOXLESS_GRID } from '../src/sudoku/grid.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-crust.json', import.meta.url), 'utf8')) as {
  id: string; code: string; solution?: string
}[]
const source = sources.find(item => item.id === '9Z8C')!
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
let givens = ''
let rules: NonNullable<Awaited<ReturnType<typeof detectPuzzle>>['sizedRules']>

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  const imported = await detectPuzzle(source.code)
  givens = imported.givens
  rules = imported.sizedRules ?? []
})
after(async () => { await server?.close() })

test('#424 Board shows Crust totals, edge counts and the authored region clues', () => {
  const html = renderToStaticMarkup(createElement(Board, {
    grid: NINE_BOXLESS_GRID, givens, values: givens, sizedRules: rules, showGuides: true,
  }))
  assert.equal([...html.matchAll(/data-outside-clue="crust-clue"/g)].length, 27)
  assert.equal([...html.matchAll(/class="outside-clue-secondary"/g)].length, 27)
  assert.match(html, /class="outside-clue-secondary"[^>]*>0<\/text>/)
  assert.equal([...html.matchAll(/data-crust-region="A"/g)].length, 2)
  assert.equal([...html.matchAll(/class="variant-crust-fixed-edge"/g)].length, 1)
  assert.ok(html.includes('Crust total 35, top of column 1'))
  assert.ok(html.includes('small clue counts 1 earlier region boundary crossed'))
  assert.ok(html.includes('Crust region A, also at row 9, column 1'))
  assert.ok(html.includes('has-outside-clues'))
  const explanation = sizedRuleDescriptions(NINE_BOXLESS_GRID, rules)
  assert.ok(explanation.some(description => description.includes('inferred region')))
  assert.ok(!html.includes('class="col-labels"'))
  assert.ok(!html.includes('class="row-labels"'))
})
