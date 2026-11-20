import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { describeHint } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { lessonRoutes } from '../src/sudoku/lessons.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { assertAdjacentTotalProof } from './helpers/adjacent-total-truth.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/adjacent-sum-coach.json', import.meta.url), 'utf8'))
const corpus = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')) as Record<string, EngineLessonExample>
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let VariantPreview: Component, CompletedPuzzle: Component
let renderNewPuzzle: (path: string, preference?: { variant: string; difficulty: string }) => Promise<string>
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, HintCard: Component, SolutionPath: Component
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
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

test('the published Roman XV is one sum-15 clue on desktop and mobile, with numeric partner labels', async () => {
  const puzzle = (await detectPuzzle(source.source.code)).variant!.puzzle
  const board = createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens })
  for (const node of [board, createElement(MobilePanelLayout, { puzzleId: 'total', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false, panels: { puzzle: { title: 'Puzzle', content: board } } })]) {
    const html = renderToStaticMarkup(node)
    assert.equal([...html.matchAll(/class="variant-total-mark"/g)].length, 1)
    assert.match(html, /data-sum="15"[^>]*>XV<\/text>/)
    assert.equal([...html.matchAll(/class="variant-xv-mark"/g)].length, 0)
    assert.match(html, /XV clue, sum 15 with row 9, column 8/)
    assert.match(html, /XV clue, sum 15 with row 9, column 9/)
  }
})

test('all Roman labels remain upright and duplicate totals share a glyph across transforms', () => {
  const labels = ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII']
  for (let sum = 3; sum <= 17; sum++) for (let symmetry = 0; symmetry < 8; symmetry++) {
    const rules: VariantRule[] = [{ type: 'adjacent-total', cells: [0, 1], sum }, { type: 'adjacent-total', cells: [1, 0], sum }]
    const puzzle = reflectVariant({ version: 1, givens: '0'.repeat(81), rules }, symmetry)
    const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
    assert.equal([...html.matchAll(/class="variant-total-mark"/g)].length, 1)
    assert.match(html, new RegExp(`data-sum="${sum}"[^>]*>${labels[sum - 3]}<`))
    assert.doesNotMatch(html, /rotate\(/)
  }
})

test('shared totals, dots and reversed inequalities stay separate in every orientation', () => {
  for (const [less, greater] of [[0, 1], [1, 0]]) for (let symmetry = 0; symmetry < 8; symmetry++) {
    const rules: VariantRule[] = [{ type: 'adjacent-total', cells: [0, 1], sum: 15 }, { type: 'kropki', consecutive: { pairs: [[0, 1]] } }, { type: 'inequality', less, greater }]
    const puzzle = reflectVariant({ version: 1, givens: '0'.repeat(81), rules }, symmetry)
    const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
    const text = html.match(/class="variant-total-mark" data-sum="15" x="([^"]+)" y="([^"]+)"/)!
    const dot = html.match(/class="variant-dot variant-dot-white" cx="([^"]+)" cy="([^"]+)"/)!
    const sign = html.match(/class="variant-inequality-sign" points="([^"]+)"/)![1].split(' ').map(p => p.split(',').map(Number))
    assert.ok(Math.hypot(Number(text[1]) - Number(dot[1]), Number(text[2]) - Number(dot[2])) >= .26)
    assert.ok((Number(text[1]) - Number(dot[1])) * (sign[1][0] - Number(dot[1])) + (Number(text[2]) - Number(dot[2])) * (sign[1][1] - Number(dot[2])) < 0)
  }
})

test('sharing a progressed puzzle retains every original rule and starting given', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const variant = (await detectPuzzle(source.source.code)).variant!
    const game = { ...makeGame('total-share', 'Two-cell sums', variant.puzzle.givens, 'imported'), variant: { ...variant, solution: source.solution } }
    const progressed = enter(game, [0], 'value', Number(source.solution[0]))
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
    assert.match(html, /Create link/)
    assert.deepEqual((await publishFixture(progressed)).variant, variant)
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('Learn, practice, hints and solution steps use the same checked sum and naming preferences', () => {
  const example = corpus['adjacent-total']; assert.ok('position' in example)
  assertAdjacentTotalProof(example.position.puzzle, example.deduction)
  assert.ok(lessonRoutes.get('adjacent-total'))
  const view = lessonExample(example)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'easy' as const }
    const diagram = lessonDiagram(view, view.pattern, options), hint = describeHint(view.deduction, options)
    const html = renderToStaticMarkup(createElement(HintCard, { hint, explanation: [diagram.description, diagram.reason], lesson: { id: 'adjacent-total', title: 'Two-cell sums' }, onClose() {} }))
    assert.ok(html.includes('/learn/adjacent-total')); assert.match(html, /total of 15/)
    if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    const path = renderToStaticMarkup(createElement(SolutionPath, { state: { status: 'ready', trace: { steps: [view.deduction], rating: { status: { solved: 'easy' } } } }, index: 0, cellReferenceStyle,
      techniqueDifficulties: { 'adjacent-total': 'easy' }, grid: null, explanation: { title: hint.title, text: diagram.description }, onSelect() {}, onRetry() {}, onClose() {} }))
    assert.match(path, /Two-cell sums/)
  }
  const unsupported = structuredClone(example.deduction)
  unsupported.actions = [{ eliminate: { cell: 63, digit: 7 } }]
  assert.throws(() => assertAdjacentTotalProof(example.position.puzzle, unsupported))
  const even = { version: 1 as const, givens: '0'.repeat(81), rules: [{ type: 'adjacent-total' as const, cells: [0, 1] as const, sum: 14 }] }
  const proof = { technique: 'adjacent-total', actions: [{ eliminate: { cell: 0, digit: 7 } }], evidence: { type: 'constraint' as const, rules: [0], cells: [0, 1], domains: [511, 511] } }
  assertAdjacentTotalProof(even, proof)
  const clue = variantHintChoice(proof, even)
  assert.ok('variant' in clue.evidence); assert.match(clue.evidence.variant.reason, /row 1/)
})

test('a total of three with both dots and a sign stays inside every outer-edge orientation', () => {
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant({ version: 1, givens: '0'.repeat(81), rules: [
      { type: 'adjacent-total', cells: [0, 1], sum: 3 },
      { type: 'kropki', consecutive: { pairs: [[0, 1]] }, ratioTwo: { pairs: [[1, 0]] } },
      { type: 'inequality', less: 1, greater: 0 },
    ] }, symmetry)
    const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
    assert.equal([...html.matchAll(/class="variant-dot /g)].length, 2)
    assert.match(html, /data-sum="3"[^>]*>III</)
    const text = html.match(/class="variant-total-mark" data-sum="3" x="([^"]+)" y="([^"]+)"/)!
    for (const coordinate of text.slice(1).map(Number)) assert.ok(coordinate > .125 && coordinate < 8.875)
    const sign = html.match(/class="variant-inequality-halo" points="([^"]+)"/)![1].split(' ').flatMap(point => point.split(',').map(Number))
    // The compact sign's halo extends 0.056 grid units beyond its path.
    assert.ok(sign.every(coordinate => coordinate >= .056 && coordinate <= 9 - .056))
  }
})


test('New Puzzle offers Two-cell sums with its own clue preview and both calibrated levels', async () => {
  const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'adjacent-total' }))
  assert.match(preview, /data-sum="7"[^>]*>VII<\/text>/)
  assert.match(preview, /data-sum="13"[^>]*>XIII<\/text>/)
  const choice = await renderNewPuzzle('/puzzles/new?variant=adjacent-total')
  assert.match(choice, /\/puzzles\/new\/difficulty\?variant=adjacent-total/)
  assert.match(choice, /Roman numeral/)
  const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=adjacent-total')
  assert.match(difficulty, /Easy/)
  assert.match(difficulty, /Medium/)
  assert.doesNotMatch(difficulty, />Hard</)
  assert.match(difficulty, /Start medium puzzle/)
})

test('a solved Two-cell sums game can generate another at its difficulty', () => {
  const { basePuzzle, additionalSums, solution } = source.authoredControl
  const puzzle: VariantPuzzle = {
    ...basePuzzle,
    rules: additionalSums.map(({ cells, total }: { cells: [number, number]; total: number }) =>
      ({ type: 'adjacent-total', cells, sum: total })),
  }
  const game = {
    ...makeGame('finished-totals', 'Two-cell sums', puzzle.givens, 'generated'),
    variant: { id: 'adjacent-total' as const, puzzle, solution },
    difficulty: 'medium' as const,
  }
  game.position.entries = [...solution as string].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
  const html = renderToStaticMarkup(createElement(CompletedPuzzle, {
    game, games: [game], preferredDifficulty: 'medium', ratingPending: false, shortcutEnabled: false, showGuides: true,
    onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {},
  }))
  assert.match(html, /Next medium puzzle/)
})
