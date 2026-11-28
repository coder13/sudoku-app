import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { describeHint } from '../src/sudoku/hints.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonRoutes } from '../src/sudoku/lessons.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isVariantId, variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { assertModularProof } from './helpers/modular-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const empty = '0'.repeat(81)
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/modular-newman.json', import.meta.url), 'utf8')
)
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component,
  MobilePanelLayout: Component,
  SharePuzzle: Component,
  HintCard: Component,
  SolutionPath: Component,
  VariantPreview: Component,
  CompletedPuzzle: Component
let renderNewPuzzle: (path: string, preference?: { variant: string; difficulty: string }) => Promise<string>
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
  ;({ HintCard } = await server.ssrLoadModule('/src/components/HintCard.tsx'))
  ;({ SolutionPath } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => {
  await server?.close()
})
const board = (puzzle: VariantPuzzle) =>
  createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens })

test('published Modular paths and group labels appear in desktop and mobile grids', () => {
  const grid = board(fixture.puzzle)
  for (const node of [
    grid,
    createElement(MobilePanelLayout, {
      puzzleId: 'modular',
      rearranging: false,
      onRearrangingChange() {},
      blocked: false,
      withHint: false,
      panels: { puzzle: { title: 'Puzzle', content: grid } },
    }),
  ]) {
    const html = renderToStaticMarkup(node)
    assert.equal([...html.matchAll(/class="variant-modular"/g)].length, 6)
    assert.match(html, /Modular line 1, every three successive positions/)
    assert.match(html, /Modular line 6, every three successive positions/)
  }
})

test('a closed walk preserves repeated references and labels each physical cell once', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'modular', cells: [0, 10, 20, 0] }] }
  const html = renderToStaticMarkup(board(puzzle))
  const path = html.match(/class="variant-modular"><polyline points="([^"]+)"/)![1].split(' ')
  assert.equal(path.length, 4)
  assert.equal(path[0], path.at(-1))
  assert.equal([...html.matchAll(/Modular line 1, every three successive positions/g)].length, 3)
})

test('one-cell paths stay visible and two-cell paths name the distinct-group rule', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [
      { type: 'modular', cells: [40] },
      { type: 'modular', cells: [0, 10] },
    ],
  }
  const html = renderToStaticMarkup(board(puzzle))
  assert.match(html, /class="variant-modular"><circle/)
  assert.match(html, /one-cell path, any digit 1–9/)
  assert.match(html, /Modular line 2, two positions from different groups/)
})

test('three independent colored families retain separate lanes with Palindrome, Whispers and a dot under every transform', () => {
  const original: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'modular', cells: [2, 11] },
    { type: 'entropic', cells: [2, 11] },
    { type: 'renban', cells: [2, 11] },
    { type: 'palindrome', cells: [2, 11, 39, 51] },
    { type: 'whispers', cells: [2, 11], minDifference: 1 },
    { type: 'kropki', consecutive: { pairs: [[2, 11]] } },
  ] }
  // Published digits 3,4; the reverse Palindrome partners are 4,3.
  assertVariantCompletion(original, fixture.solution)
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const html = renderToStaticMarkup(board(reflectVariant(original, symmetry)))
    assert.match(html, /variant-palindrome-overlap/)
    assert.match(html, /variant-dot-white/)
    assert.match(html, /variant-whispers-label-leader/)
    const lanes = ['renban', 'entropic', 'modular'].map(type => html.match(new RegExp(`class="variant-${type}-overlap"[^>]*><line ([^>]+)`))![1])
    assert.equal(new Set(lanes).size, 3)
    assert.doesNotMatch(lanes.join(''), /NaN/)
    assert.match(html, /Modular line 1/)
    assert.match(html, /Entropic line 1/)
    assert.match(html, /Renban line 1/)
  }
})

test('sharing a progressed Modular mixed source retains its complete original rules and givens', async () => {
  const source = JSON.parse(
    readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')
  ).examples.find((s: { url: string }) => s.url.endsWith('Hu9m'))
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { hostname: 'example.test', origin: 'https://example.test' } },
  })
  try {
    const id = variantIdForPuzzle(source.puzzle); assert.ok(id !== 'classic')
    const variant = {
      id,
      puzzle: source.puzzle,
      solution: source.solution,
    }
    const game = {
      ...makeGame('modular-share', 'Modular Lines', source.puzzle.givens, 'imported'),
      variant,
    }
    const progressed = enter(game, [0], 'value', Number(source.solution[0]))
    const html = renderToStaticMarkup(
      createElement(SharePuzzle, {
        game: progressed,
        close() {},
      })
    )
    assert.match(html, /Create link/)
    assert.deepEqual((await publishFixture(progressed)).variant, { id: variant.id, puzzle: variant.puzzle })
  } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('the real lesson and hint/solution components explain an independently checked group deduction', () => {
  const corpus = JSON.parse(
    readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')
  ) as Record<string, EngineLessonExample>
  const source = corpus.modular
  assert.ok('position' in source)
  assertModularProof(source.position.puzzle, source.deduction)
  assert.ok(lessonRoutes.get('modular'))
  assert.match(renderToStaticMarkup(board(source.position.puzzle)), /variant-modular/)
  const view = lessonExample(source)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'medium' as const },
      diagram = lessonDiagram(view, view.pattern, options),
      hint = describeHint(view.deduction, options)
    const html = renderToStaticMarkup(
      createElement(HintCard, {
        hint,
        explanation: [diagram.description, diagram.reason],
        lesson: { id: 'modular', title: 'Modular lines' },
        onClose() {},
      })
    )
    assert.match(html, /\/learn\/modular/)
    assert.match(html, /group/)
    if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    assert.match(
      renderToStaticMarkup(
        createElement(SolutionPath, {
          state: {
            status: 'ready',
            trace: { steps: [view.deduction], rating: { status: { solved: 'medium' } } },
          },
          index: 0,
          cellReferenceStyle,
          techniqueDifficulties: { modular: 'medium' },
          grid: null,
          onSelect() {},
          onRetry() {},
          onClose() {},
        })
      ),
      /Modular/
    )
  }
  const wrong = structuredClone(source.deduction)
  wrong.actions = [{ eliminate: { cell: 41, digit: 3 } }]
  assert.throws(() => assertModularProof(source.position.puzzle, wrong))
})


test('New Puzzle offers Medium Modular Lines with complete geometry, valid remainder digits and actual navigation', async () => {
  assert.ok(isVariantId('modular'))
  assert.deepEqual(variantDifficulties('modular'), variantDifficulties('classic'))
  const construction = JSON.parse(readFileSync(new URL('./fixtures/modular-generation.json', import.meta.url), 'utf8')).sources[0]
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'modular' }))
  const paths = [...preview.matchAll(/class="variant-modular"><polyline points="([^"]+)"/g)].map(match => match[1])
  const expected = [construction.lines[0], construction.lines[6]]
    .map((cells: number[]) => cells.map(cell => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' '))
  assert.deepEqual(paths, expected)
  const digits = [...preview.matchAll(/<text[^>]*>([1-9])<\/text>/g)].map(match => Number(match[1]))
  assert.deepEqual(digits, construction.lines[0].map((cell: number) => Number(construction.completionTemplate[cell])))
  for (let start = 0; start + 2 < digits.length; start++) assert.equal(new Set(digits.slice(start, start + 3).map(digit => digit % 3)).size, 3)
  const choice = await renderNewPuzzle('/puzzles/new?variant=modular&ruleset=dutch')
  assert.match(choice, /Choose a variant/)
  assert.match(choice, /\/puzzles\/new\/difficulty\?variant=modular/)
  assert.doesNotMatch(choice, /ruleset=dutch/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=modular')
  assert.match(difficulty, /Choose difficulty/)
  assert.match(difficulty, /\/puzzles\/new\?variant=modular/)
  assert.match(difficulty, /value="medium"/)
  assert.match(difficulty, /value="(?:easy|hard)"/)
  assert.match(await renderNewPuzzle('/puzzles/new/difficulty', { variant: 'modular', difficulty: 'easy' }), /Start easy puzzle/)
})

test('completed constructed Modular puzzles offer another puzzle while full published mixed originals retain every companion', () => {
  const constructed = JSON.parse(readFileSync(new URL('./fixtures/modular-generation.json', import.meta.url), 'utf8')).example
  const coach = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')).examples.find((source: { url: string }) => source.url.endsWith('Hu9m'))
  for (const source of [constructed, fixture, coach]) {
    const id = variantIdForPuzzle(source.puzzle); assert.ok(id !== 'classic')
    const game = { ...makeGame('modular-complete', 'Modular Lines', source.puzzle.givens, 'imported'),
      variant: { id, puzzle: source.puzzle, solution: source.solution } }
    game.position.entries = [...source.solution as string].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const definition = structuredClone(game.variant)
    const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
      ratingPending: false, shortcutEnabled: false, showGuides: true, onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {} }))
    if (source === constructed) {
      assert.equal(generationVariant(game.variant), 'modular')
      assert.match(html, /Next medium puzzle/)
      assert.match(html, /Choose difficulty/)
      assert.match(html, /Choose variant/)
    } else {
      assert.equal(generationVariant(game.variant), undefined)
      assert.match(html, /Choose another puzzle/)
      assert.doesNotMatch(html, /Next medium puzzle/)
      assert.equal(game.variant.puzzle.rules.length, source === fixture ? 12 : 35)
    }
    assert.deepEqual(game.variant, definition)
  }
})
