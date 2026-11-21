import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { outsideClueLayout } from '../src/sudoku/outside-clues.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
const sources = ['murphy', 'newman', 'mixed', 'jigsaw-mixed', 'menace'].map((name) =>
  JSON.parse(readFileSync(new URL('./fixtures/little-killer-' + name + '.json', import.meta.url), 'utf8')),
) as { puzzle: VariantPuzzle; solution: string }[]
let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode,
  MobilePanelLayout: typeof Board,
  SharePuzzle: typeof Board,
  VariantPreview: typeof Board
before(async () => {
  server = await createServer({
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
})
after(async () => {
  await server?.close()
})
const board = (puzzle: VariantPuzzle, extra = {}) =>
  createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens, ...extra })

test('desktop/mobile render every full source diagonal, corner arrow, total and accessible repeat rule', () => {
  for (const source of sources) {
    const grid = board(source.puzzle),
      mobile = createElement(MobilePanelLayout, {
        puzzleId: 'little-killer',
        rearranging: false,
        onRearrangingChange() {},
        blocked: false,
        withHint: false,
        panels: { puzzle: { title: 'Puzzle', content: grid } },
      })
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node),
        clues = source.puzzle.rules!.flatMap((rule) => (rule.type === 'little-killer' ? [rule] : []))
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      assert.equal([...html.matchAll(/data-outside-clue="little-killer"/g)].length, clues.length)
      assert.equal([...html.matchAll(/class="outside-diagonal-arrow"/g)].length, clues.length)
      for (const rule of clues)
        assert.ok(
          html.includes(
            'Little Killer ' +
              rule.sum +
              ', ' +
              rule.direction.replace('-', ' ') +
              ' from R' +
              (Math.floor(rule.cells[0] / 9) + 1) +
              'C' +
              ((rule.cells[0] % 9) + 1),
          ),
        )
      assert.ok(html.includes('Digits may repeat if the other puzzle rules allow it.'))
      if (source === sources[2]) {
        assert.ok(html.includes('data-outside-clue="sandwich"'))
        assert.ok(html.includes('class="variant-renban"'))
      }
      if (source === sources[3]) assert.ok(html.includes('jigsaw-board') && html.includes('variant-cage-edge'))
      if (source === sources[4]) assert.equal([...html.matchAll(/class="variant-renban"/g)].length, 14)
    }
  }
})

test('corner glyphs fit the reserved canvas, and every diagonal arrow follows its exact ray through all transforms', () => {
  for (const source of sources)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry),
        layout = outsideClueLayout(puzzle.rules),
        html = renderToStaticMarkup(board(puzzle))
      assert.equal(
        [...html.matchAll(/data-outside-clue="little-killer"/g)].length,
        puzzle.rules!.filter((rule) => rule.type === 'little-killer').length,
      )
      for (const { rule, x, y, arrow, dr, dc } of layout.clues) {
        assert.ok(x - 0.35 >= -layout.depths.left && x + 0.35 <= 9 + layout.depths.right)
        assert.ok(y - 0.18 >= -layout.depths.top && y + 0.18 <= 9 + layout.depths.bottom)
        if (!arrow) continue
        const first = rule.cells[0],
          fx = (first % 9) + 0.5,
          fy = Math.floor(first / 9) + 0.5
        assert.ok(Math.abs((fx - arrow.x2) * dr - (fy - arrow.y2) * dc) < 1e-10)
        assert.ok((arrow.x2 - arrow.x1) * dc > 0 && (arrow.y2 - arrow.y1) * dr > 0)
      }
    }
  const layout = outsideClueLayout(sources[1].puzzle.rules)
  for (const side of ['top', 'left', 'bottom', 'right'] as const) assert.ok(layout.depths[side] >= 1)
})

test('shared edge anchors keep both rule families and repeated arrows visible while candidates and links keep their coordinates', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: '0'.repeat(81),
    rules: [
      { type: 'sandwich', direction: 'south', cells: [1, 10, 19, 28, 37, 46, 55, 64, 73], sum: 0 },
      { type: 'little-killer', direction: 'south-west', cells: [0], sum: 1 },
      { type: 'little-killer', direction: 'south-west', cells: [0], sum: 1 },
      { type: 'little-killer', direction: 'south-east', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80], sum: 45 },
    ],
  }
  const annotations = { links: [{ from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' }] }
  const html = renderToStaticMarkup(
    board(puzzle, { showGuides: false, candidates: Array(81).fill(511), onCandidate() {}, annotations }),
  )
  assert.ok(html.includes('guides-hidden has-outside-clues'))
  assert.ok(html.includes('class="board-outside-clues" viewBox="0 0 9 9"'))
  assert.equal([...html.matchAll(/class="board-candidate candidate-button/g)].length, 729)
  assert.ok(html.includes('data-outside-lane="2"'))
  const classic = renderToStaticMarkup(
    board({ ...puzzle, rules: [] }, { candidates: Array(81).fill(511), annotations }),
  )
  assert.equal(
    html.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1],
    classic.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1],
  )
  const overlay = renderToStaticMarkup(board(puzzle, { overlay: { content: 'Loading', visible: true } }))
  assert.ok(overlay.includes('class="board-outside-clues" aria-hidden="true"'))
})

test('complete outside rays stay visible in teaching crops with their original Jigsaw regions and companion cages', () => {
  const html = renderToStaticMarkup(board(sources[3].puzzle, { region: { row: 0, column: 0, rows: 3, columns: 3 } }))
  assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
  assert.ok(html.includes('jigsaw-board') && html.includes('variant-cage-edge'))
  assert.ok(!html.includes('--board-rows:3'))
})

test('sharing after progress retains every outside direction, total, region and companion', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { hostname: 'example.test', origin: 'https://example.test' } },
  })
  try {
    for (const source of sources.slice(0, 4)) {
      const id = variantIdForPuzzle(source.puzzle)
      assert.ok(id !== 'classic')
      const game = {
        ...makeGame('lk-share', 'Little Killer', source.puzzle.givens, 'imported'),
        variant: { id, puzzle: source.puzzle, solution: source.solution },
      }
      const cell = source.puzzle.givens.indexOf('0')
      const progressed = enter(game, [cell], 'value', Number(source.solution[cell]))
      const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
      assert.match(html, /Create link/)
      assert.deepEqual((await publishFixture(progressed)).variant, { id, puzzle: source.puzzle })
    }
  } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('New Puzzle offers the independently calibrated Medium level and a diagonal-arrow preview', () => {
  assert.deepEqual(variantDifficulties('little-killer'), ['medium'])
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'little-killer' }))
  assert.ok(html.includes('variant-little-killer-preview') && html.includes('>12</text>'))
})

test('outside arrows and candidate links share the exact inner-cell viewport, including the grid border inset', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const viewport = css.match(/\.board-links, \.board-outside-clues \{([^}]+)\}/)![1]
  for (const declaration of [
    'position: absolute',
    'inset: var(--sudoku-border-width)',
    'width: calc(100% - 2 * var(--sudoku-border-width))',
    'height: calc(100% - 2 * var(--sudoku-border-width))',
    'overflow: visible',
    'pointer-events: none',
  ])
    assert.ok(viewport.includes(declaration))
  const html = renderToStaticMarkup(board(sources[0].puzzle))
  assert.ok(html.indexOf('class="board-outside-clues"') > html.indexOf('class="board-body'))
})
