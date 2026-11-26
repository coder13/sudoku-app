import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { BoardGroup, BoardLink } from '../src/components/BoardAnnotations.tsx'

let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
})
after(async () => { await server?.close() })

function render(links: BoardLink[] = [], groups: BoardGroup[] = [], extra = {}) {
  return renderToStaticMarkup(createElement(Board, {
    givens: '0'.repeat(81), values: '0'.repeat(81), candidates: Array(81).fill(511),
    showGuides: true, annotations: { links, groups }, descriptionId: 'hint-instructions', ...extra,
  }))
}

test('shared grouped endpoints get one outline and retain every candidate control', () => {
  const html = render([
    { from: { cell: 8, digit: 5 }, to: { cells: [0, 1], digit: 5 }, color: 'blue' },
    { from: { cells: [1, 0], digit: 5 }, to: { candidates: [{ cell: 27, digit: 5 }, { cell: 36, digit: 5 }] }, color: 'blue', dashed: true },
  ], [], { onCandidate() {}, selectedCandidates: [{ cell: 0, digit: 5 }, { cell: 1, digit: 5 }] })
  assert.equal([...html.matchAll(/class="board-chain-group"/g)].length, 2)
  assert.equal([...html.matchAll(/class="board-candidate candidate-button/g)].length, 729)
  assert.equal([...html.matchAll(/aria-pressed="true"/g)].length, 2)
  assert.match(html, /data-chain-group="0:5\|1:5"/)
  assert.match(html, /data-chain-group="27:5\|36:5"/)
  const description = html.match(/<p id="([^"]+)" class="sr-only">/)![1]
  assert.ok(html.includes(`aria-describedby="hint-instructions ${description}"`))
  assert.match(html, /Group 1: 5 in row 1, column 1 or 5 in row 1, column 2/)
})

test('an endpoint-only hint shows its group without revealing any chain links', () => {
  const html = render([], [{ point: { cells: [30, 31], digit: 7 }, color: 'orange', label: 'Chain start' }])
  assert.equal([...html.matchAll(/class="board-chain-group"/g)].length, 1)
  assert.equal(html.includes('<polyline'), false)
  assert.match(html, /Chain start: 7 in row 4, column 4 or 7 in row 4, column 5/)
  assert.match(html, /The group is true if at least one member is true/)
})

test('mixed groups retain every digit and explicit styling while ordinary links have no group outline', () => {
  const point = { candidates: [{ cell: 0, digit: 1 }, { cell: 0, digit: 2 }, { cell: 9, digit: 2 }] }
  const html = render([{ from: point, to: { cell: 10, digit: 3 }, color: 'blue' }], [{ point, color: 'orange', opacity: .5 }])
  assert.equal([...html.matchAll(/class="board-chain-group"/g)].length, 1)
  assert.match(html, /data-chain-group="0:1\|0:2\|9:2" opacity="0.5"/)
  assert.match(html, /<polygon[^>]+stroke="orange"/)
  assert.match(html, /1 in row 1, column 1 or 2 in row 1, column 1 or 2 in row 2, column 1/)
  const ordinary = render([{ from: { cell: 0, digit: 1 }, to: { cell: 1, digit: 1 }, color: 'blue' }])
  assert.equal(ordinary.includes('class="board-chain-group"'), false)
  assert.match(ordinary, /aria-describedby="hint-instructions"/)
})
