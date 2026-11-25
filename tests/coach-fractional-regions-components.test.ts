import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { sizedRuleDescriptions } from '../src/sudoku/sized-rule-game.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-fractional-regions.json', import.meta.url), 'utf8')) as {
  code: string; solution: string
}
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('#453 Board shades the four fractional regions and labels each cell share', async () => {
  const puzzle = await detectPuzzle(source.code)
  assert.ok(puzzle.grid && puzzle.sizedRules)
  const render = (values: string) => renderToStaticMarkup(createElement(Board, {
    grid: puzzle.grid, givens: puzzle.givens, values, sizedRules: puzzle.sizedRules, showGuides: true,
  }))
  const unfinished = render(puzzle.givens), finished = render(source.solution)
  assert.equal([...unfinished.matchAll(/data-fractional-regions/g)].length, 1)
  assert.equal([...unfinished.matchAll(/class="variant-fractional-region-fill"/g)].length, 100)
  const unfinishedLines = [...unfinished.matchAll(/<line[^>]*class="variant-fractional-region-edge"[^>]*>/g)].map(([line]) => line)
  assert.ok(unfinishedLines.length > 0)
  assert.ok(unfinishedLines.some(line => /x1="(?:0\.5|1\.5|2\.5|3\.5|4\.5)" y1="(?:0\.5|1\.5|2\.5|3\.5|4\.5)"/.test(line)))
  const boundaryLines = [...finished.matchAll(/<line[^>]*class="variant-fractional-region-edge"[^>]*>/g)].map(([line]) => line)
  assert.ok(boundaryLines.length > 0)
  for (const line of boundaryLines) {
    const attributes = Object.fromEntries([...line.matchAll(/(x1|y1|x2|y2)="([0-9.]+)"/g)].map(([, name, value]) => [name, Number(value)]))
    for (const [x, y] of [[attributes.x1, attributes.y1], [attributes.x2, attributes.y2]]) {
      assert.ok(!(Number.isInteger(x - .5) && Number.isInteger(y - .5)), 'region borders leave room around cell-center digits')
      const distanceToCenter = (value: number) => Math.abs(value - (Math.floor(value) + .5))
      if (Number.isInteger(x - .5) && !Number.isInteger(y)) {
        assert.ok(distanceToCenter(y) >= .29, 'vertical borders leave a clear gap around placed digits')
      }
      if (Number.isInteger(y - .5) && !Number.isInteger(x)) {
        assert.ok(distanceToCenter(x) >= .29, 'horizontal borders leave a clear gap around placed digits')
      }
    }
  }
  assert.ok(finished.includes('fractional region A, 1/4 of the cell'))
  assert.ok(sizedRuleDescriptions(puzzle.grid, puzzle.sizedRules).some(text =>
    text.includes('All pieces have the same total') && text.includes('fraction of its digit covered by each piece')))
})
