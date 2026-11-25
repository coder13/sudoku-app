import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-distant-neighbors.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('#434 marks all nine box identities and explains their neighboring restrictions', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  const puzzle = imported.variant.puzzle
  const render = (values: string) => renderToStaticMarkup(createElement(Board, {
    variantPuzzle: puzzle, givens: puzzle.givens, values, showGuides: true,
  }))
  const unfinished = render(puzzle.givens)
  const finished = render(source.solution)

  assert.equal([...unfinished.matchAll(/data-distant-neighbor-identity=/g)].length, 9)
  assert.ok(unfinished.includes('Distant Neighbors identity cell for box row 1, box column 1'))
  const descriptions = variantRuleDescriptions(puzzle)
  assert.ok(descriptions.some(description => description.includes('share an edge') && description.includes('consecutive identities')))
  assert.ok(descriptions.some(description => description.includes('orthogonally next to a marked cell') && description.includes('consecutive')))
  assert.ok(descriptions.some(description => description.includes('three cells') && description.includes('neighboring box') && description.includes('identity')))
  assert.ok(finished.includes('Distant Neighbors identity cell for box row 3, box column 3'))
})
