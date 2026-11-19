import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isVariantId, variantDifficulties, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { assertEntropicProof } from './helpers/entropic-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const empty = '0'.repeat(81)
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/entropic-clover.json', import.meta.url), 'utf8')
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

test('published Entropic paths and group labels appear in desktop and mobile grids', () => {
  const grid = board(fixture.puzzle)
  for (const node of [
    grid,
    createElement(MobilePanelLayout, {
      puzzleId: 'entropic',
      rearranging: false,
      onRearrangingChange() {},
      blocked: false,
      withHint: false,
      panels: { puzzle: { title: 'Puzzle', content: grid } },
    }),
  ]) {
    const html = renderToStaticMarkup(node)
    assert.equal([...html.matchAll(/class="variant-entropic"/g)].length, 8)
    assert.match(html, /Entropic line 1, every three successive positions/)
    assert.match(html, /Entropic line 8, every three successive positions/)
  }
})

test('a closed source loop keeps all thirty-seven references and labels each physical cell once', () => {
  const source = JSON.parse(
    readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')
  ).examples.find((s: { url: string }) => s.url.endsWith('Hyk5'))
  const html = renderToStaticMarkup(board(source.puzzle))
  const path = html.match(/class="variant-entropic"><polyline points="([^"]+)"/)![1].split(' ')
  assert.equal(path.length, 37)
  assert.equal(path[0], path.at(-1))
  assert.equal([...html.matchAll(/Entropic line 1, every three successive positions/g)].length, 36)
})

test('one-cell paths stay visible and two-cell paths name the distinct-group rule', () => {
  const puzzle: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [
      { type: 'entropic', cells: [40] },
      { type: 'entropic', cells: [0, 10] },
    ],
  }
  const html = renderToStaticMarkup(board(puzzle))
  assert.match(html, /class="variant-entropic"><circle/)
  assert.match(html, /one-cell path, any digit 1–9/)
  assert.match(html, /Entropic line 2, two positions from different low/)
})

test('independent colored paths retain separate lanes with Palindrome, Whispers and a dot under all transforms', () => {
  const original: VariantPuzzle = {
    version: 1,
    givens: empty,
    rules: [
      { type: 'entropic', cells: [45, 36, 27] },
      { type: 'renban', cells: [45, 36] },
      { type: 'palindrome', cells: [45, 36, 2, 4] },
      { type: 'whispers', cells: [45, 36], minDifference: 1 },
      { type: 'kropki', consecutive: { pairs: [[45, 36]] } },
    ],
  }
  assertVariantCompletion(original, fixture.solution)
  for (let transform = 0; transform < 8; transform++) {
    const html = renderToStaticMarkup(board(reflectVariant(original, transform)))
    assert.match(html, /variant-palindrome-overlap/)
    assert.match(html, /variant-dot-white/)
    assert.match(html, /variant-whispers-label-leader/)
    const renban = html.match(/class="variant-renban-overlap"[^>]*><line ([^>]+)/)![1]
    const entropic = html.match(/class="variant-entropic-overlap"[^>]*><line ([^>]+)/)![1]
    assert.notEqual(renban, entropic)
    assert.doesNotMatch(renban + entropic, /NaN/)
    assert.match(html, /Entropic line 1/)
    assert.match(html, /Renban line 1/)
  }
})

test('sharing a progressed Entropic mixed source retains its complete original rules and givens', async () => {
  const source = JSON.parse(
    readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')
  ).examples.find((s: { url: string }) => s.url.endsWith('Hafj'))
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
      ...makeGame('entropic-share', 'Entropic Lines', source.puzzle.givens, 'imported'),
      variant,
    }
    const html = renderToStaticMarkup(
      createElement(SharePuzzle, {
        game: enter(game, [0], 'value', Number(source.solution[0])),
        close() {},
      })
    )
    const code = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(code)).variant, { id: variant.id, puzzle: variant.puzzle })
  } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('the real lesson and hint/solution components explain an independently checked group deduction', () => {
  const corpus = JSON.parse(
    readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')
  ) as Record<string, EngineLessonExample>
  const source = corpus.entropic
  assert.ok('position' in source)
  assertEntropicProof(source.position.puzzle, source.deduction)
  assert.ok(lessonRoutes.get('entropic'))
  assert.match(renderToStaticMarkup(board(source.position.puzzle)), /variant-entropic/)
  const view = lessonExample(source)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'medium' as const },
      diagram = lessonDiagram(view, view.pattern, options),
      hint = describeHint(view.deduction, options)
    const html = renderToStaticMarkup(
      createElement(HintCard, {
        hint,
        explanation: [diagram.description, diagram.reason],
        lesson: { id: 'entropic', title: 'Entropic lines' },
        onClose() {},
      })
    )
    assert.match(html, /\/learn\/entropic/)
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
          techniqueDifficulties: { entropic: 'medium' },
          grid: null,
          onSelect() {},
          onRetry() {},
          onClose() {},
        })
      ),
      /Entropic/
    )
  }
  const wrong = structuredClone(source.deduction)
  wrong.actions = [{ eliminate: { cell: 50, digit: 4 } }]
  assert.throws(() => assertEntropicProof(source.position.puzzle, wrong))
})


test('New Puzzle offers Medium Entropic Lines with complete published preview paths and actual navigation', async () => {
  assert.ok(isVariantId('entropic'))
  assert.deepEqual(variantDifficulties('entropic'), ['medium'])
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'entropic' }))
  const paths = [...preview.matchAll(/class="variant-entropic"><polyline points="([^"]+)"/g)].map(match => match[1])
  const expected = [fixture.puzzle.rules[0].cells, fixture.puzzle.rules[6].cells]
    .map((cells: number[]) => cells.map(cell => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' '))
  assert.deepEqual(paths, expected)
  const choice = await renderNewPuzzle('/puzzles/new?variant=entropic&ruleset=dutch')
  assert.match(choice, /Choose a variant/)
  assert.match(choice, /\/puzzles\/new\/difficulty\?variant=entropic/)
  assert.doesNotMatch(choice, /ruleset=dutch/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=entropic')
  assert.match(difficulty, /Choose difficulty/)
  assert.match(difficulty, /\/puzzles\/new\?variant=entropic/)
  assert.match(difficulty, /value="medium"/)
  assert.doesNotMatch(difficulty, /value="(?:easy|hard)"/)
  assert.match(await renderNewPuzzle('/puzzles/new/difficulty', { variant: 'entropic', difficulty: 'easy' }), /Start medium puzzle/)
})

test('completed pure Entropic Lines offers another puzzle and a mixed Coach source retains every companion', () => {
  const mixed = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8'))
    .examples.find((source: { url: string }) => source.url.endsWith('Ksy3'))
  for (const source of [fixture, mixed]) {
    const id = variantIdForPuzzle(source.puzzle); assert.ok(id !== 'classic')
    const game = { ...makeGame('entropic-complete', 'Entropic Lines', source.puzzle.givens, 'imported'),
      variant: { id, puzzle: source.puzzle, solution: source.solution } }
    game.position.entries = [...source.solution as string].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const definition = structuredClone(game.variant)
    const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
      ratingPending: false, shortcutEnabled: false, showGuides: true, onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {} }))
    if (source === fixture) {
      assert.equal(generationVariant(game.variant), 'entropic')
      assert.match(html, /Next medium puzzle/)
      assert.match(html, /Choose difficulty/)
      assert.match(html, /Choose variant/)
    } else {
      assert.equal(generationVariant(game.variant), undefined)
      assert.match(html, /Choose another puzzle/)
      assert.doesNotMatch(html, /Next medium puzzle/)
      assert.equal(game.variant.puzzle.rules.length, 32)
    }
    assert.deepEqual(game.variant, definition)
  }
})
