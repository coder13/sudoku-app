import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { fogView } from '../src/sudoku/fog.ts'
import { EMPTY, enter, makeGame, valuesOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

test('the Fog grid omits covered givens, candidates and rule labels and displays only the revealed companions', async () => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8'))
  const source = examples.find(({ url }: { url: string }) => url.endsWith('/Fnxt'))
  const { variant } = await detectPuzzle(source.code)
  assert.ok(variant?.fog)
  const givens = EMPTY.slice(0, 25) + source.solution[25] + EMPTY.slice(26)
  const game = { ...makeGame('fog', 'Fog of War', givens, 'imported'),
    variant: { ...variant, puzzle: { ...variant.puzzle, givens }, solution: source.solution } }
  const candidates = Array(81).fill(0)
  candidates[25] = 0x1ff
  const labelOf = (html: string, cell: number) => html.match(new RegExp('data-cell="' + cell + '"[^>]+aria-label="([^"]+)"'))?.[1] ?? ''
  const grid = (current: typeof game, values: string) => renderToStaticMarkup(createElement(Board, {
    givens, variantPuzzle: current.variant.puzzle, fog: fogView(current.variant, current.position.entries), values,
    candidates, showGuides: true,
  }))

  const before = grid(game, givens)
  assert.equal([...before.matchAll(/data-fogged="true"/g)].length, 80)
  assert.match(labelOf(before, 63), /odd/i)
  assert.match(labelOf(before, 25), /covered by fog, empty/)
  assert.doesNotMatch(labelOf(before, 25), /given|candidates|ratio/i)
  assert.doesNotMatch(labelOf(before, 64), /Whispers|sum 10/)
  assert.doesNotMatch(labelOf(before, 72), /ratio|black dot/i)

  const placed = enter(game, [63], 'value', 1)
  const after = grid(placed as typeof game, valuesOf(placed))
  assert.equal([...after.matchAll(/data-fogged="true"/g)].length, 75)
  assert.match(labelOf(after, 63), /digit 1/)
  assert.match(labelOf(after, 64), /X clue, sum 10/)
  assert.match(labelOf(after, 72), /ratio|black dot/i)
  assert.doesNotMatch(labelOf(after, 25), /given|candidates|ratio/i)
})
