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
import { generationVariant, isVariantId, variantDifficulties, variantIdForPuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { assertGlobalEntropyProof } from './helpers/global-entropy-truth.ts'

const published = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-newman.json', import.meta.url), 'utf8'))
const sources = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8')).examples
  .filter((source: { puzzle?: VariantPuzzle }) => source.puzzle)
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, HintCard: Component, SolutionPath: Component, VariantPreview: Component, CompletedPuzzle: Component
let renderNewPuzzle: (path: string, preference?: { variant: string; difficulty: string }) => Promise<string>
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ HintCard } = await server.ssrLoadModule('/src/components/HintCard.tsx'))
  ;({ SolutionPath } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => { await server?.close() })
const board = (puzzle: VariantPuzzle) => createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens })

test('desktop and mobile grids explain the global rule and preserve all visible companion clues', () => {
  for (const source of [published, ...sources]) {
    const grid = board(source.puzzle)
    for (const node of [grid, createElement(MobilePanelLayout, { puzzleId: 'global-entropy', rearranging: false,
      onRearrangingChange() {}, blocked: false, withHint: false, panels: { puzzle: { title: 'Puzzle', content: grid } } })]) {
      const html = renderToStaticMarkup(node)
      assert.match(html, /role="grid" aria-label="[^"]*Global Entropy: every 2 × 2 area/)
      assert.match(html, /low digit 1–3, a medium digit 4–6 and a high digit 7–9/)
      assert.match(html, /including across box or region borders/)
      const circles = source.puzzle.rules.filter((rule: { type: string }) => rule.type === 'quadruple')
      assert.equal([...html.matchAll(/class="variant-quadruple"/g)].length, circles.length)
      const houses = source.puzzle.rules.filter((rule: { type: string }) => rule.type === 'extra-house')
      if (houses.length) {
        assert.match(html, /Disjoint Groups: cells in the same relative position/)
        assert.match(html, /disjoint group at row 3, column 3 within each 3 × 3 block/)
        assert.doesNotMatch(html, /class="variant-extra-region"/)
        assert.match(variantRuleDescriptions(source.puzzle).join(' '), /Disjoint Groups/)
      }
    }
    assert.match(variantRuleDescriptions(source.puzzle).join(' '), /Equal digits can repeat diagonally if all other puzzle rules allow it/)
  }
})

test('sharing a progressed mixed Global Entropy puzzle preserves its complete original clue list', async () => {
  const source = sources.find((source: { url: string }) => source.url.endsWith('CJhv'))
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const id = variantIdForPuzzle(source.puzzle); assert.ok(id !== 'classic')
    const variant = { id, puzzle: source.puzzle, solution: source.solution }
    const game = { ...makeGame('global-entropy-share', 'Global Entropy', source.puzzle.givens, 'imported'), variant }
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: enter(game, [0], 'value', Number(source.solution[0])), close() {} }))
    const code = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(code)).variant, { id: variant.id, puzzle: variant.puzzle })
  } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('the lesson, diagram and solution step explain the actual four-cell group proof', () => {
  const examples = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')) as Record<string, EngineLessonExample>
  const source = examples['global-entropy']
  assert.ok('position' in source)
  assertGlobalEntropyProof(source.position.puzzle, source.deduction)
  assert.deepEqual(source.deduction.evidence.type === 'constraint' && source.deduction.evidence.cells, [7, 8, 16, 17])
  assert.deepEqual(source.deduction.actions, [{ eliminate: { cell: 16, digit: 4 } }, { eliminate: { cell: 16, digit: 6 } }])
  assert.ok(lessonRoutes.get('global-entropy'))
  const view = lessonExample(source)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'easy' as const }
    const diagram = lessonDiagram(view, view.pattern, options)
    const html = renderToStaticMarkup(createElement(HintCard, { hint: describeHint(view.deduction, options),
      explanation: [diagram.description, diagram.reason], lesson: { id: 'global-entropy', title: 'Global Entropy' }, onClose() {} }))
    assert.match(html, /\/learn\/global-entropy/)
    assert.match(html, /low \(1–3\)/)
    assert.match(html, /Only [^<]+ can supply a low/)
    if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    assert.match(renderToStaticMarkup(createElement(SolutionPath, { state: { status: 'ready',
      trace: { steps: [view.deduction], rating: { status: { solved: 'easy' } } } }, index: 0, cellReferenceStyle,
      techniqueDifficulties: { 'global-entropy': 'easy' }, grid: null, onSelect() {}, onRetry() {}, onClose() {} })), /Global entropy/)
  }
  const wrong = structuredClone(source.deduction)
  wrong.actions = [{ eliminate: { cell: 16, digit: 3 } }]
  assert.throws(() => assertGlobalEntropyProof(source.position.puzzle, wrong))
})

test('New Puzzle exposes both checked levels, a correct four-cell preview and complete navigation', async () => {
  assert.ok(isVariantId('global-entropy'))
  assert.deepEqual(variantDifficulties('global-entropy'), ['easy', 'medium'])
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'global-entropy' }))
  assert.match(preview, /variant-entropy-preview/)
  const digits = [...preview.matchAll(/<text[^>]*>([1-9])<\/text>/g)].map(match => Number(match[1]))
  assert.deepEqual(digits, [2, 5, 8, 1])
  assert.deepEqual([...new Set(digits.map(digit => Math.floor((digit - 1) / 3)))].sort(), [0, 1, 2])
  const choice = await renderNewPuzzle('/puzzles/new?variant=global-entropy&ruleset=dutch')
  assert.match(choice, /Choose a variant/); assert.match(choice, /\/puzzles\/new\/difficulty\?variant=global-entropy/)
  assert.doesNotMatch(choice, /ruleset=dutch/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=global-entropy')
  assert.match(difficulty, /Choose difficulty/); assert.match(difficulty, /\/puzzles\/new\?variant=global-entropy/)
  assert.match(difficulty, /value="easy"/); assert.match(difficulty, /value="medium"/); assert.doesNotMatch(difficulty, /value="hard"/)
  assert.match(await renderNewPuzzle('/puzzles/new/difficulty', { variant: 'global-entropy', difficulty: 'easy' }), /Start easy puzzle/)
})

test('completed pure Global Entropy offers another puzzle while original mixed sources retain their companions', () => {
  const mixed = sources.find((source: { url: string }) => source.url.endsWith('CJhv'))
  for (const source of [published, mixed]) {
    const id = variantIdForPuzzle(source.puzzle); assert.ok(id !== 'classic')
    const game = { ...makeGame('entropy-complete', 'Global Entropy', source.puzzle.givens, 'imported'),
      variant: { id, puzzle: source.puzzle, solution: source.solution } }
    game.position.entries = [...source.solution as string].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
    const definition = structuredClone(game.variant)
    const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
      ratingPending: false, shortcutEnabled: false, showGuides: true, onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {} }))
    if (source === published) {
      assert.equal(generationVariant(game.variant), 'global-entropy')
      assert.match(html, /Next medium puzzle/); assert.match(html, /Choose difficulty/); assert.match(html, /Choose variant/)
    } else {
      assert.equal(generationVariant(game.variant), undefined)
      assert.match(html, /Choose another puzzle/); assert.doesNotMatch(html, /Next medium puzzle/)
      assert.equal(game.variant.puzzle.rules.length, 15)
    }
    assert.deepEqual(game.variant, definition)
  }
})
