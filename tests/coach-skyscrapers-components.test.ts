import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { coachSkyscrapersRules } from '../src/sudoku/coach-skyscrapers.ts'
import { SEVEN_BOXLESS_GRID } from '../src/sudoku/grid.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-coach-9W3o.json', import.meta.url), 'utf8')) as {
  metadata: { sudoku: string; description: string; solution: string }
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
let givens = ''
let rules: ReturnType<typeof coachSkyscrapersRules>

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  const payload = await decodeSudokuCoachPayload(source.metadata.sudoku)
  givens = String(payload.givenDigits)
  rules = coachSkyscrapersRules(payload.givenConstraints as unknown[], 7, source.metadata.description)
})
after(async () => { await server?.close() })

test('#382 Board renders the published seven-by-seven Skyscrapers clues on every side', () => {
  const html = renderToStaticMarkup(createElement(Board, {
    grid: SEVEN_BOXLESS_GRID, givens, values: givens, sizedRules: rules, showGuides: true,
  }))
  assert.equal([...html.matchAll(/data-outside-clue="skyscrapers"/g)].length, 12)
  assert.ok(!html.includes('class="col-labels"'))
  assert.ok(!html.includes('class="row-labels"'))
  assert.ok(html.includes('Skyscrapers 3, top of column 4'))
  assert.ok(html.includes('Skyscrapers 5, left of row 3'))
  assert.ok(html.includes('count the first building and each new tallest building'))
  assert.ok(html.includes('has-outside-clues'))
  assert.ok(sizedRuleDescriptions(SEVEN_BOXLESS_GRID, rules).some(description =>
    description.includes('A digit is visible when it is taller than every digit between it and that side.')))
  assert.equal(sizedRuleDescriptions(SEVEN_BOXLESS_GRID, rules).filter(description =>
    description.includes('Each outside clue shows how many buildings')).length, 1)
})
