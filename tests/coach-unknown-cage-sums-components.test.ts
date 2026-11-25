import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-unknown-cage-totals.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('#433 renders unsummed cages and every authored C link accessibly', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  const puzzle = imported.variant.puzzle
  const render = (values: string) => renderToStaticMarkup(createElement(Board, {
    variantPuzzle: puzzle, givens: puzzle.givens, values, showGuides: true,
  }))
  const unfinished = render(puzzle.givens)
  const finished = render(source.solution)

  assert.equal([...unfinished.matchAll(/data-unknown-cage=/g)].length, 15)
  assert.equal([...unfinished.matchAll(/data-consecutive-cage-link=/g)].length, 9)
  assert.equal([...unfinished.matchAll(/class="variant-cage-consecutive-label"/g)].length, 9)
  assert.ok(!unfinished.includes('data-killer-cage='), 'unknown totals must not be shown as ordinary Killer cages')
  assert.ok(unfinished.includes('Unknown-sum cage 1'))
  assert.ok(unfinished.includes('C link to cage'))
  assert.ok(finished.includes('C link to cage'))
  const descriptions = variantRuleDescriptions(puzzle)
  assert.ok(descriptions.some(description => description.includes('unknown totals') && description.includes('consecutive sequence')))
})
