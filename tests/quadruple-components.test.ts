import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { enter, makeGame, type Game } from '../src/sudoku/game.ts'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/quadruple-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, VariantClues: Component, SharePuzzle: Component, CompletedPuzzle: Component

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ VariantClues } = await server.ssrLoadModule('/src/components/VariantClues.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
})
after(async () => { await server?.close() })

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...Object.values(node.props).flatMap(elements)]
}

function capture(component: Component, props: Record<string, unknown>) {
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
  const tree = capture(VariantClues, { rules })
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
      const clueTree = capture(VariantClues, { rules })
      const cageComponent = clueTree.find(({ type }) => typeof type === 'function' && type.name === 'Cage')!
      const circle = clueTree.find(({ props }) => props.className === 'variant-quadruple')!
      assert.ok(clueTree.indexOf(circle) > clueTree.indexOf(cageComponent), 'Circle symbols must paint above cage edges in either source order')
      const edges = capture(cageComponent.type as Component, cageComponent.props)
      const top = String(edges.find(({ type }) => type === 'path')!.props.d)
      const gapEnd = Number(/^M([^,]+)/.exec(top)![1]) - 3
      assert.ok(Math.abs(gapEnd - (start + .3)) < 1e-9, 'The border gap must match the moved total')
    }
  }
  const plain = capture(Board, { givens: '0'.repeat(81), values: '0'.repeat(81),
    variantPuzzle: { version: 1, givens: '0'.repeat(81), rules: [cage] } })
  const total = plain.find(({ props }) => props.className === 'variant-cage-total')!
  assert.equal((total.props.style as { insetInlineStart: string }).insetInlineStart, '10%')
})

test('the real share dialog exports the complete starting definition without player progress', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const current = enter(game(), [0], 'value', Number(fixture.solution[0]))
    const tree = capture(SharePuzzle, { game: current, close() {} })
    const output = tree.find(({ type, props }) => type === 'textarea' && props.id === 'share-output')!
    const imported = await detectPuzzle(String(output.props.value))
    assert.deepEqual(imported.variant, { id: 'quadruple', puzzle: fixture.puzzle })
    assert.equal(imported.givens, fixture.puzzle.givens)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('a completed imported Quadruple chooses another puzzle without calling an uncalibrated generator', () => {
  const current = game()
  current.position.entries = [...fixture.solution].map((digit, cell) => current.givens[cell] === '0' ? digit : '0').join('')
  let chosen = 0
  const tree = capture(CompletedPuzzle, { game: current, games: [current], preferredDifficulty: 'medium',
    ratingPending: false, shortcutEnabled: false, showGuides: true, onChooseDifficulty() {}, onChooseVariant() { chosen++ } })
  const next = tree.find(({ type, props }) => type === 'button' && String(props.className).includes('completion-next'))!
  assert.ok(next)
  assert.equal(next.props.disabled, false)
  assert.match(renderToStaticMarkup(createElement('span', null, next.props.children as ReactNode)), /Choose another puzzle/)
  ;(next.props.onClick as () => void)()
  assert.equal(chosen, 1)
})
