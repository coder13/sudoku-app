import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { outsideClueLayout } from '../src/sudoku/outside-clues.ts'
import { lessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram, lessonValues } from '../src/sudoku/lesson-diagram.ts'

const sources = ['murphy', 'clover', 'bulten', 'mixed', 'jigsaw-mixed'].map(
  (name) =>
    JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-' + name + '.json', import.meta.url), 'utf8')) as {
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

test('desktop, mobile and preview preserve every outside total with accessible row, column and visibility labels', () => {
  for (const source of sources) {
    const grid = board(source.puzzle)
    const mobile = createElement(MobilePanelLayout, {
      puzzleId: 'skyscrapers',
      rearranging: false,
      onRearrangingChange() {},
      blocked: false,
      withHint: false,
      panels: { puzzle: { title: 'Puzzle', content: grid } },
    })
    for (const node of [grid, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
      const clues = source.puzzle.rules!.flatMap((rule) => (rule.type === 'skyscrapers' ? [rule] : []))
      assert.equal([...html.matchAll(/data-outside-clue="skyscrapers"/g)].length, clues.length)
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
        assert.ok(html.includes('Skyscrapers ' + rule.count + ', ' + side + ' of ' + name))
      }
      assert.ok(html.includes('has-outside-clues'))
      if (source === sources[3]) assert.ok(html.includes('class="variant-renban"'))
    }
  }
})

test('all four gutters retain extremal and repeated labels and every candidate and link with guides hidden', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: '0'.repeat(81),
    rules: [
      { type: 'skyscrapers', direction: 'south', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72], count: 1 },
      { type: 'skyscrapers', direction: 'north', cells: [80, 71, 62, 53, 44, 35, 26, 17, 8], count: 9 },
      { type: 'skyscrapers', direction: 'east', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], count: 1 },
      { type: 'skyscrapers', direction: 'east', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8], count: 1 },
      { type: 'skyscrapers', direction: 'west', cells: [80, 79, 78, 77, 76, 75, 74, 73, 72], count: 9 },
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
  assert.equal([...html.matchAll(/data-outside-clue="skyscrapers"/g)].length, 5)
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

test('every grid transform retains outside labels and the complete published clue count', () => {
  for (const source of sources)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry),
        html = renderToStaticMarkup(board(puzzle))
      assert.equal(
        [...html.matchAll(/data-outside-clue="skyscrapers"/g)].length,
        puzzle.rules!.filter((rule) => rule.type === 'skyscrapers').length,
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
      const game = { ...makeGame('skyscrapers-share', 'Skyscrapers', source.puzzle.givens, 'imported'), variant }
      const cell = source.puzzle.givens.indexOf('0')
      const html = renderToStaticMarkup(
        createElement(SharePuzzle, { game: enter(game, [cell], 'value', Number(source.solution[cell])), close() {} }),
      )
      const code = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
      assert.deepEqual((await detectPuzzle(code)).variant, { id, puzzle: source.puzzle })
    }
  } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('New Puzzle exposes the calibrated Hard level and a preview explaining an outside total', () => {
  assert.deepEqual(variantDifficulties('skyscrapers'), ['hard'])
  const html = renderToStaticMarkup(createElement(VariantPreview, { variant: 'skyscrapers' }))
  assert.match(html, /variant-skyscrapers-preview/)
  assert.ok(html.includes('>3</text>'))
})

test('Jigsaw teaching diagrams retain complete outside rays, region borders and caption-adjusted links', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-jigsaw-mixed.json', import.meta.url), 'utf8'))
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
  assert.equal([...html.matchAll(/data-outside-clue="skyscrapers"/g)].length, 4)
  assert.ok(html.includes('viewBox="0 0 90 90"'))
  assert.ok(!html.includes('--board-rows:3'))
})

test('mixed outside totals use visible S/X prefixes and a legend while preserving diagonal arrows and their gutters', () => {
  const source = sources[4]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(source.puzzle, symmetry),
      layout = outsideClueLayout(puzzle.rules)
    const html = renderToStaticMarkup(board(puzzle))
    assert.ok(html.includes('S = Sandwich · X = X-Sums · Sk = Skyscrapers'))
    assert.ok(html.includes('class="outside-diagonal-arrow"'))
    for (const { rule, label, x, y } of layout.clues) {
      if (rule.type === 'skyscrapers') assert.equal(label, 'Sk' + rule.count)
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

test('the actual Skyscrapers Learn example displays its full outside ray, candidates and proof annotations', () => {
  const corpus = JSON.parse(
    readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8'),
  )
  const example = lessonExample(corpus['skyscrapers']),
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
  assert.ok(html.includes('data-outside-clue="skyscrapers"'))
  assert.ok(html.includes('count the first building and each new tallest building'))
  assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
})
