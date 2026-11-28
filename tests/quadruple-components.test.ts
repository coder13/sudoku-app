import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { enter, makeGame, type Game } from '../src/sudoku/game.ts'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { renderedElements } from './component-tree.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/quadruple-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
let Button: (props: Record<string, unknown>) => ReactNode
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, VariantClues: Component, SharePuzzle: Component, CompletedPuzzle: Component, VariantPreview: Component
let renderNewPuzzle: (path: string) => Promise<string>

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Button } = await server.ssrLoadModule('/src/components/Button.tsx'))
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ VariantClues } = await server.ssrLoadModule('/src/components/VariantClues.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => { await server?.close() })

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (node.type === Button) return elements(Button(node.props))
  return [node, ...Object.values(node.props).flatMap(elements)]
}

function capture(component: Component, props: Record<string, unknown>) {
  if (component === Board) return renderedElements(component, props)
  let tree: ReactNode
  function Capture() { tree = component(props); return null }
  renderToStaticMarkup(createElement(Capture))
  return elements(tree)
}

function game(): Game {
  return { ...makeGame('quad-components', 'Clover Quadruple', fixture.puzzle.givens, 'imported'),
    variant: { id: 'quadruple', puzzle: fixture.puzzle, solution: fixture.solution }, difficulty: 'medium', score: 2285 }
}

test('Quadruple circles occupy the intended internal intersections and retain repeated occurrences', () => {
  const rules: VariantRule[] = [
    { type: 'quadruple', topLeft: 0, digits: [1] },
    { type: 'quadruple', topLeft: 7, digits: [2, 2] },
    { type: 'quadruple', topLeft: 63, digits: [2, 2, 6] },
    { type: 'quadruple', topLeft: 70, digits: [1, 3, 7, 9] },
  ]
  const tree = renderedElements(VariantClues, { rules })
  const groups = tree.filter(({ props }) => props.className === 'variant-quadruple')
  assert.equal(groups.length, 4)
  for (const [index, group] of groups.entries()) {
    const children = elements(group.props.children)
    const circle = children.find(({ type }) => type === 'circle')!
    assert.deepEqual([circle.props.cx, circle.props.cy], [[1, 1], [8, 1], [1, 8], [8, 8]][index])
    const digits = children.filter(({ type }) => type === 'text')
    assert.deepEqual(digits.map(({ props }) => props.children), rules[index].type === 'quadruple' ? rules[index].digits : [])
    assert.equal(new Set(digits.map(({ props }) => `${props.x},${props.y}`)).size, digits.length,
      'Each printed occurrence needs a separate readable position')
  }
})

test('Global Entropy group markers use the correct 2×2 intersection and digit-range label', () => {
  const rules: VariantRule[] = [
    { type: 'entropy-window-group', cells: [0, 1, 9, 10], group: 'low' },
    { type: 'entropy-window-group', cells: [13, 14, 22, 23], group: 'middle' },
    { type: 'entropy-window-group', cells: [24, 25, 33, 34], group: 'high' },
  ]
  const svg = renderToStaticMarkup(createElement(VariantClues, { rules }))
  assert.match(svg, /class="variant-entropy-window-group variant-entropy-window-group-low" data-entropy-window-group="low"/)
  assert.match(svg, /class="variant-entropy-window-group variant-entropy-window-group-middle" data-entropy-window-group="middle"/)
  assert.match(svg, /class="variant-entropy-window-group variant-entropy-window-group-high" data-entropy-window-group="high"/)
  assert.match(svg, /<rect x="0\.85" y="0\.85" width="\.3" height="\.3"/)
  assert.match(svg, /<circle cx="7" cy="3" r="\.16"/)
  const board = renderToStaticMarkup(createElement(Board, { givens: '0'.repeat(81), values: '0'.repeat(81),
    variantPuzzle: { version: 1, givens: '0'.repeat(81), rules } }))
  assert.match(board, /aria-label="Row 2, column 5, empty, Global Entropy 2 by 2 window, digits 4 to 6 appear twice/)
})

test('the actual mobile puzzle panel renders every published circle and accessible rule label', () => {
  const html = renderToStaticMarkup(createElement(MobilePanelLayout, {
    puzzleId: 'quad-mobile', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false,
    panels: { puzzle: { title: 'Puzzle', content: createElement(Board, {
      variantPuzzle: fixture.puzzle, givens: fixture.puzzle.givens, values: fixture.puzzle.givens,
      label: 'Quadruple Sudoku grid', showGuides: true,
    }) } },
  }))
  assert.match(html, /mobile-panel-layout/)
  assert.match(html, /aria-label="Quadruple Sudoku grid"/)
  assert.equal([...html.matchAll(/class="variant-quadruple"/g)].length, 14)
  assert.match(html, /aria-label="[^"]*Quadruple 5, 7, 9/)
})

test('Killer totals and their border gaps leave room for every Quadruple circle size in either rule order', () => {
  const cage: VariantRule = { type: 'killer-cages', cages: [{ cells: [12, 13], sum: 12 }] }
  for (const digits of [[1], [1, 2], [2, 2, 6], [1, 2, 3, 4]]) {
    const quad: VariantRule = { type: 'quadruple', topLeft: 2, digits }
    for (const rules of [[cage, quad], [quad, cage]]) {
      const board = capture(Board, { givens: '0'.repeat(81), values: '0'.repeat(81), variantPuzzle: { version: 1, givens: '0'.repeat(81), rules } })
      const total = board.find(({ props }) => props.className === 'variant-cage-total')!
      const start = Number.parseFloat((total.props.style as { insetInlineStart: string }).insetInlineStart) / 100
      assert.ok(start > .28, 'The total must start beyond the circle and its stroke')
      assert.ok(start + .3 < .925, 'A two-digit total must fit inside the cage cell')
      const svg = renderToStaticMarkup(createElement(VariantClues, { rules }))
      const topEdge = /<path class="variant-cage-edge" d="([^"]+)"/.exec(svg)
      assert.ok(topEdge)
      assert.ok(svg.indexOf('class="variant-quadruple"') > topEdge.index,
        'Circle symbols must paint above cage edges in either source order')
      const top = topEdge[1]
      const gapEnd = Number(/^M([^,]+)/.exec(top)![1]) - 3
      assert.ok(Math.abs(gapEnd - (start + .3)) < 1e-9, 'The border gap must match the moved total')
    }
  }
  const plain = capture(Board, { givens: '0'.repeat(81), values: '0'.repeat(81),
    variantPuzzle: { version: 1, givens: '0'.repeat(81), rules: [cage] } })
  const total = plain.find(({ props }) => props.className === 'variant-cage-total')!
  assert.equal((total.props.style as { insetInlineStart: string }).insetInlineStart, '10%')
})

test('the real share dialog posts the starting definition only after Create link is clicked', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const current = enter(game(), [0], 'value', Number(fixture.solution[0]))
    const fetch = t.mock.method(globalThis, 'fetch', async (_path: string, _options?: RequestInit) =>
      Response.json({ id: '6f13cc96-59fc-4138-9d9d-6fd47f0703a7' }))
    const tree = capture(SharePuzzle, { game: current, close() {} })
    assert.equal(fetch.mock.callCount(), 0)
    assert.ok(!tree.some(({ props }) => props.id === 'share-output'))
    const create = tree.find(({ type, props }) => type === 'button' && String(props.className).includes('primary'))
    assert.ok(create)
    await (create.props.onClick as () => Promise<void>)()
    assert.equal(fetch.mock.callCount(), 1)
    const [path, request] = fetch.mock.calls[0].arguments
    assert.equal(path, '/api/v1/shares')
    assert.equal(request?.method, 'POST')
    assert.deepEqual(JSON.parse(String(request?.body)), {
      version: 1, title: current.title, givens: fixture.puzzle.givens,
      variant: { id: 'quadruple', puzzle: fixture.puzzle },
    })
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('New Puzzle shows the repeated circle and offers the calibrated Medium level', async () => {
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'quadruple' }))
  assert.match(preview, /data-variant="quadruple" aria-hidden="true"/)
  assert.deepEqual([...preview.matchAll(/<text[^>]*>(\d)<\/text>/g)].map(match => match[1]), ['2', '2', '6'])
  const choice = await renderNewPuzzle('/puzzles/new?variant=quadruple')
  assert.match(choice, /\/puzzles\/new\/difficulty\?variant=quadruple/)
  assert.match(choice, /A repeated printed digit needs that many separate cells/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=quadruple')
  assert.match(difficulty, /Start medium puzzle/)
  assert.match(difficulty, />Easy<|>Hard</)
})

test('a completed imported Quadruple offers another Medium puzzle', () => {
  const current = game()
  current.position.entries = [...fixture.solution].map((digit, cell) => current.givens[cell] === '0' ? digit : '0').join('')
  const tree = capture(CompletedPuzzle, { game: current, games: [current], preferredDifficulty: 'medium',
    ratingPending: false, shortcutEnabled: false, showGuides: true, onChooseDifficulty() {}, onChooseVariant() {} })
  const next = tree.find(({ type, props }) => type === 'button' && String(props.className).includes('completion-next'))!
  assert.ok(next)
  assert.equal(next.props.disabled, false)
  assert.match(renderToStaticMarkup(createElement('span', null, next.props.children as ReactNode)), /Next medium puzzle/)
})
