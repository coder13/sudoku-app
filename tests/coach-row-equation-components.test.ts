import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-row-equations.json', import.meta.url), 'utf8')) as {
  code: string
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('#409 Board shows the authored operators and describes each equation accessibly', async () => {
  const puzzle = await detectPuzzle(source.code)
  assert.ok(puzzle.grid && puzzle.sizedRules)
  const html = renderToStaticMarkup(createElement(Board, {
    grid: puzzle.grid, givens: puzzle.givens, values: puzzle.givens, sizedRules: puzzle.sizedRules, showGuides: true,
  }))
  assert.equal([...html.matchAll(/data-row-equation/g)].length, 5)
  for (const glyph of ['×', '−', '÷', '=', '+']) assert.ok(html.includes(`>${glyph}</text>`))
  assert.ok(html.includes('row equation from row 1, column 1'))
  assert.ok(sizedRuleDescriptions(puzzle.grid, puzzle.sizedRules).some(text =>
    text.includes('joined without an operator form one multi-digit number') &&
    text.includes('Multiplication and division come before addition and subtraction')))
})
