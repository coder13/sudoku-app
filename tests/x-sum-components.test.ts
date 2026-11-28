import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { outsideClueLayout } from '../src/sudoku/outside-clues.ts'
import { MINI_GRID } from '../src/sudoku/grid.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram, lessonValues } from '../src/sudoku/lesson-diagram.ts'

const sources = ['newman', 'murphy', 'clover', 'coach-transcription', 'mixed', 'jigsaw-mixed'].map(
  (name) =>
    JSON.parse(readFileSync(new URL('./fixtures/x-sum-' + name + '.json', import.meta.url), 'utf8')) as {
      puzzle: VariantPuzzle
      solution: string
    },
)
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, VariantPreview: Component
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

test('desktop, mobile and preview preserve every outside total with accessible row, column and first-digit length labels', () => {
  for (const source of sources) {
    const grid = board(source.puzzle)
    const mobile = createElement(MobilePanelLayout, {
      puzzleId: 'x-sum',
      rearranging: false,
      onRearrangingChange() {},
      blocked: false,
      withHint: false,
      panels: { puzzle: { title: 'Puzzle', content: grid } },
    })
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      const clues = source.puzzle.rules!.flatMap((rule) => (rule.type === 'x-sum' ? [rule] : []))
      assert.equal([...html.matchAll(/data-outside-clue="x-sum"/g)].length, clues.length)
      for (const rule of clues) {
        const side =
          rule.direction === 'south'
            ? 'top'
            : rule.direction === 'north'
              ? 'bottom'
              : rule.direction === 'east'
                ? 'left'
                : 'right'
        const name =
          side === 'top' || side === 'bottom'
            ? 'column ' + ((rule.cells[0] % 9) + 1)
            : 'row ' + (Math.floor(rule.cells[0] / 9) + 1)
        assert.ok(html.includes('X-Sum ' + rule.sum + ', ' + side + ' of ' + name))
      }
      assert.ok(html.includes('has-outside-clues'))
      if (source === sources[4]) assert.ok(html.includes('class="variant-renban"'))
    }
  }
})

test('all four gutters retain extremal and repeated labels and every candidate and link with guides hidden', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: '0'.repeat(81),
    rules: [
      { type: 'x-sum', direction: 'south', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72], sum: 1 },
      { type: 'x-sum', direction: 'north', cells: [80, 71, 62, 53, 44, 35, 26, 17, 8], sum: 45 },
      { type: 'x-sum', direction: 'east', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], sum: 1 },
      { type: 'x-sum', direction: 'east', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], sum: 1 },
      { type: 'x-sum', direction: 'west', cells: [80, 79, 78, 77, 76, 75, 74, 73, 72], sum: 45 },
    ],
  }
  const html = renderToStaticMarkup(
    board(puzzle, {
      showGuides: false,
      candidates: Array(81).fill(511),
      onCandidate() {},
      annotations: { links: [{ from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' }] },
    }),
  )
  assert.ok(html.includes('class="board-outside-clues" viewBox="0 0 9 9"'))
  assert.equal([...html.matchAll(/data-outside-clue="x-sum"/g)].length, 5)
  assert.ok(html.includes('--outside-left-track:1.4fr'))
  assert.ok(html.includes('data-outside-lane="1"'))
  assert.ok(html.includes('guides-hidden has-outside-clues'))
  assert.equal([...html.matchAll(/class="board-candidate candidate-button/g)].length, 729)
  const classic = renderToStaticMarkup(
    board(
      { ...puzzle, rules: [] },
      {
        candidates: Array(81).fill(511),
        annotations: { links: [{ from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' }] },
      },
    ),
  )
  assert.equal(
    html.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1],
    classic.match(/<polyline points="([^"]+)"[^>]*stroke="#f00"/)![1],
  )
})

test('sized X-Sum dots render at clue-to-cell and neighboring-clue midpoints', () => {
  const html = renderToStaticMarkup(createElement(Board, {
    content: {
      grid: MINI_GRID,
      givens: '0'.repeat(16),
      values: '0'.repeat(16),
      sizedRules: [
        { type: 'x-sum-dot', ends: [{ direction: 'east', index: 1 }, 4], relation: 'consecutive' },
        { type: 'x-sum-dot', ends: [{ direction: 'east', index: 1 }, { direction: 'east', index: 2 }], relation: 'ratio' },
      ],
    },
  }))
  assert.equal([...html.matchAll(/data-x-sum-dot="consecutive"/g)].length, 1)
  assert.equal([...html.matchAll(/data-x-sum-dot="ratio"/g)].length, 1)
  assert.match(html, /class="variant-dot variant-dot-white" cx="0" cy="1\.5"/)
  assert.match(html, /class="variant-dot variant-dot-black" cx="-0\.5" cy="2"/)
  assert.match(html, /aria-label="X-Sum at the left of row 2 and R2C1 are consecutive\. X-Sum at the left of row 2 and X-Sum at the left of row 3 are in a 1:2 ratio\."/)
})

test('every grid transform retains outside labels and the complete published clue count', () => {
  for (const source of sources)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry),
        html = renderToStaticMarkup(board(puzzle))
      assert.equal(
        [...html.matchAll(/data-outside-clue="x-sum"/g)].length,
        puzzle.rules!.filter((rule) => rule.type === 'x-sum').length,
      )
    }
})

test('sharing after progress preserves all outside clues and companion rules', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { hostname: 'example.test', origin: 'https://example.test' } },
  })
  try {
    for (const source of sources) {
      const id = variantIdForPuzzle(source.puzzle)
      assert.ok(id !== 'classic')
      const variant = { id, puzzle: source.puzzle, solution: source.solution }
      const game = { ...makeGame('x-sum-share', 'X-Sums', source.puzzle.givens, 'imported'), variant }
      const cell = source.puzzle.givens.indexOf('0')
      const progressed = enter(game, [cell], 'value', Number(source.solution[cell]))
      const html = renderToStaticMarkup(
        createElement(SharePuzzle, { game: progressed, close() {} }),
      )
      assert.match(html, /Create link/)
      assert.deepEqual((await publishFixture(progressed)).variant, { id, puzzle: source.puzzle })
    }
  } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('New Puzzle exposes the calibrated Hard level and a preview explaining an outside total', () => {
  assert.deepEqual(variantDifficulties('x-sum'), ['hard'])
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'x-sum' }))
  assert.match(html, /variant-x-sum-preview/)
  assert.ok(html.includes('3 + 2 + 5'))
})

test('Jigsaw teaching diagrams retain complete outside rays, region borders and caption-adjusted links', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/x-sum-jigsaw-mixed.json', import.meta.url), 'utf8'))
  const html = renderToStaticMarkup(
    board(source.puzzle, {
      region: { row: 0, column: 0, rows: 3, columns: 3 },
      showGuides: true,
      candidates: Array(81).fill(511),
      annotations: { links: [{ from: { cell: 0, digit: 1 }, to: { cell: 40, digit: 9 }, color: '#f00' }] },
    }),
  )
  assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
  assert.ok(html.includes('jigsaw-board'))
  assert.ok(html.includes('variant-cage-edge'))
  assert.equal([...html.matchAll(/data-outside-clue="x-sum"/g)].length, 4)
  assert.ok(html.includes('viewBox="0 0 90 90"'))
  assert.ok(!html.includes('--board-rows:3'))
})

test('mixed outside totals use visible S/X prefixes and a legend while preserving diagonal arrows and their gutters', () => {
  const source = sources[5]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(source.puzzle, symmetry),
      layout = outsideClueLayout(puzzle.rules)
    const html = renderToStaticMarkup(board(puzzle))
    assert.ok(html.includes('S = Sandwich · X = X-Sums'))
    assert.ok(html.includes('class="outside-diagonal-arrow"'))
    for (const { rule, label, x, y } of layout.clues) {
      if (rule.type === 'x-sum') assert.equal(label, 'X' + rule.sum)
      if (rule.type === 'sandwich') assert.equal(label, 'S' + rule.sum)
      assert.ok(html.includes('>' + label + '</text>'))
      assert.ok(x - 0.35 >= -layout.depths.left && x + 0.35 <= 9 + layout.depths.right)
      assert.ok(y - 0.18 >= -layout.depths.top && y + 0.18 <= 9 + layout.depths.bottom)
    }
    const covered = renderToStaticMarkup(board(puzzle, { overlay: { visible: true, content: 'Paused' } }))
    assert.ok(covered.includes('class="outside-clue-legend" aria-hidden="true"'))
  }
  assert.equal(outsideClueLayout(sources[0].puzzle.rules).legend.length, 0)
})

test('the actual X-Sums Learn example displays its full outside ray, candidates and proof annotations', () => {
  const corpus = JSON.parse(
    readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8'),
  )
  const example = lessonExample(corpus['x-sum']),
    diagram = lessonDiagram(example)
  const html = renderToStaticMarkup(
    createElement(Board, {
      givens: example.givens,
      values: lessonValues(example),
      candidates: example.candidates,
      variantPuzzle: example.variantPuzzle,
      ...diagram,
      showGuides: true,
    }),
  )
  assert.ok(html.includes('data-outside-clue="x-sum"'))
  assert.ok(html.includes('first digit counts how many cells to add, including itself'))
  assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
})
