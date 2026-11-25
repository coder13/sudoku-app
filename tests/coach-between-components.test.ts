import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { after, before, test } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { decodeCoachSix } from '../src/sudoku/puzzle-import.ts'
import { readFileSync } from 'node:fs'

const source = JSON.parse(readFileSync(new URL('./fixtures/little-killer-between-GJBz.json', import.meta.url), 'utf8'))
let Board: (props: Record<string, unknown>) => ReturnType<typeof createElement>
let server: ViteDevServer

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('6 × 6 Between lines render their ordered paths and endpoint roles accessibly', async () => {
  const imported = await decodeCoachSix(source.metadata.sudoku)
  assert.ok(imported.grid)
  const html = renderToStaticMarkup(createElement(Board, {
    grid: { size: 6, boxRows: 2, boxColumns: 3 },
    givens: imported.givens,
    values: imported.givens,
    sizedRules: imported.rules,
    showGuides: true,
  }))
  assert.equal([...html.matchAll(/class="variant-between"/g)].length, 2)
  assert.equal([...html.matchAll(/class="variant-between-endpoints"/g)].length, 2)
  assert.match(html, /Between line endpoint, other endpoint at row 1, column 5/)
  assert.match(html, /Between line interior with endpoints at row 4, column 3 and row 1, column 5/)
})
