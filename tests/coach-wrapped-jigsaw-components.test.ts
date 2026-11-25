import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-mini-wrapped-jigsaw.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('#458 draws matching wraparound seams on the published Mini Jigsaw board', async () => {
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.grid && 'regions' in imported.grid && imported.sizedRules)
  assert.equal(imported.grid.wrapAround, true)
  const render = (values: string) => renderToStaticMarkup(createElement(Board, {
    grid: imported.grid, givens: imported.givens, values, sizedRules: imported.sizedRules, showGuides: true,
  }))
  const unfinished = render(imported.givens)
  const finished = render(source.solution)
  for (const [edge, expected] of Object.entries({ top: 1, right: 2, bottom: 1, left: 2 })) {
    assert.equal([...unfinished.matchAll(new RegExp(`data-wrap-${edge}=`, 'g'))].length, expected)
    assert.equal([...finished.matchAll(new RegExp(`data-wrap-${edge}=`, 'g'))].length, expected)
  }
  assert.match(unfinished, /Whispers/)
  assert.match(unfinished, /Region Sum/)
})
