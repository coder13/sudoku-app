import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { coachNonogramRules } from '../src/sudoku/coach-nonogram.ts'
import { SIX_BOXLESS_GRID } from '../src/sudoku/grid.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'
import { outsideClueLayout } from '../src/sudoku/outside-clues.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sized-coach-nonogram.json', import.meta.url), 'utf8')) as {
  sudoku: string; description: string
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
let givens = ''
let rules: ReturnType<typeof coachNonogramRules>

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  const payload = await decodeSudokuCoachPayload(source.sudoku)
  givens = String(payload.givenDigits)
  rules = coachNonogramRules(payload.givenConstraints as unknown[], 6, source.description)
})
after(async () => { await server?.close() })

test('#381 Board shows every row and column run count outside the boxless grid', () => {
  const html = renderToStaticMarkup(createElement(Board, {
    grid: SIX_BOXLESS_GRID, givens, values: givens, sizedRules: rules, showGuides: true,
  }))
  assert.equal([...html.matchAll(/data-outside-clue="nonogram"/g)].length, 12)
  assert.ok(!html.includes('class="col-labels"'))
  assert.ok(!html.includes('class="row-labels"'))
  assert.ok(html.includes('Nonogram row 1: selected digits 2, 4, 6'))
  assert.ok(html.includes('Nonogram column 6: selected digits 2, 4, 6'))
  assert.ok(html.includes('has-outside-clues'))
  assert.ok(html.includes('row 1 Nonogram clue'))
  assert.ok(html.includes('column 6 Nonogram clue'))
  assert.ok(sizedRuleDescriptions(SIX_BOXLESS_GRID, rules).some(description =>
    description.includes('selected digits (2, 4, 6)') && description.includes('outside that set (1, 3, 5)')))
  const layout = outsideClueLayout(rules, 6)
  const row = layout.clues.find(clue => clue.rule.type === 'nonogram' && clue.rule.axis === 'row')!
  const column = layout.clues.find(clue => clue.rule.type === 'nonogram' && clue.rule.axis === 'column')!
  assert.ok(Math.abs(row.x + .18) < 1e-9)
  assert.ok(html.includes('class="outside-clue-row"'))
  assert.ok(layout.clues.filter(clue => clue.rule.type === 'nonogram' && clue.rule.axis === 'row').every(clue => clue.x === row.x))
  assert.ok(Math.abs(Math.abs(column.y) - .18 - .18) < 1e-9)
})
