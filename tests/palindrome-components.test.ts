import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { describeHint } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { lessonRoutes } from '../src/sudoku/lessons.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { assertPalindromeProof } from './helpers/palindrome-truth.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/palindrome-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const corpus = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')) as Record<string, EngineLessonExample>
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, HintCard: Component, SolutionPath: Component
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ HintCard } = await server.ssrLoadModule('/src/components/HintCard.tsx'))
  ;({ SolutionPath } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
})
after(async () => { await server?.close() })

test('desktop and mobile grids draw every published line and name exact mirrored partners', () => {
  for (const name of ['clover', 'newman']) {
    const { puzzle } = JSON.parse(readFileSync(new URL(`./fixtures/palindrome-${name}.json`, import.meta.url), 'utf8')) as typeof fixture
    const board = createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens, label: 'Palindrome Sudoku grid' })
    const mobile = createElement(MobilePanelLayout, { puzzleId: name, rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: false, panels: { puzzle: { title: 'Puzzle', content: board } } })
    for (const node of [board, mobile]) {
      const html = renderToStaticMarkup(node), lines = puzzle.rules!.filter(rule => rule.type === 'palindrome')
      assert.equal([...html.matchAll(/class="variant-palindrome"/g)].length, lines.length)
      for (const rule of lines) {
        const points = rule.cells.map(cell => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' ')
        assert.ok(html.includes(`points="${points}"`))
      }
      if (name === 'clover') {
        const label = html.match(/data-cell="0"[^>]*aria-label="([^"]+)"/)![1]
        assert.match(label, /same digit as row 4, column 6/)
      }
      assert.equal([...html.matchAll(/role="gridcell"/g)].length, 81)
    }
  }
})

test('segmented and revisited drawings keep original paths while labels use logical pairings', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'palindrome', cells: [0, 10, 40, 50], segments: [[0, 10, 40], [40, 50, 0]] },
    { type: 'palindrome', cells: [8, 44, 72] },
  ] }
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
  assert.ok(html.includes('points="0.5,0.5 1.5,1.5 4.5,4.5"'))
  assert.ok(html.includes('points="4.5,4.5 5.5,5.5 0.5,0.5"'))
  assert.ok(!html.includes('points="0.5,0.5 1.5,1.5 4.5,4.5 5.5,5.5"'))
  assert.match(html.match(/data-cell="0"[^>]*aria-label="([^"]+)"/)![1], /same digit as row 6, column 6/)
  assert.match(html.match(/data-cell="44"[^>]*aria-label="([^"]+)"/)![1], /Palindrome middle cell, no matching partner/)
})

test('overlapping long and short paths retain both line families above their shared edges', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [
    { type: 'kropki', ratioTwo: { pairs: [[20, 21]] } },
    { type: 'palindrome', cells: [0, 10, 40, 50], segments: [[0, 40], [0, 10], [40, 50]] },
    { type: 'thermometer', cells: [20, 30] },
    { type: 'whispers', cells: [0, 10], minDifference: 5 },
  ] }
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
  const overlay = html.match(/class="variant-palindrome-overlap">(.*?)<\/g>/)![1]
  assert.ok(overlay.includes('points="0.5,0.5 1.5,1.5"'))
  assert.ok(overlay.includes('points="2.5,2.5 3.5,3.5"'))
  assert.ok(html.indexOf('variant-whispers') < html.indexOf('variant-palindrome-overlap'))
  assert.ok(html.indexOf('variant-thermometer') < html.indexOf('variant-palindrome-overlap'))
  assert.ok(html.indexOf('variant-palindrome-overlap') < html.indexOf('variant-dot-black'))
  const endpoint: VariantPuzzle = { ...puzzle, rules: [
    { type: 'palindrome', cells: [0, 10] }, { type: 'whispers', cells: [10, 11], minDifference: 4 },
  ] }
  assert.doesNotMatch(renderToStaticMarkup(createElement(Board, { variantPuzzle: endpoint, givens: endpoint.givens, values: endpoint.givens })), /variant-palindrome-overlap/)
})

test('sharing progressed segmented puzzles preserves starting givens and complete geometry', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const puzzle: VariantPuzzle = { ...fixture.puzzle, rules: fixture.puzzle.rules!.map((rule, i) =>
      i === 0 ? { ...rule, segments: [[0, 10, 20], [20, 30, 31, 32]] } : rule) }
    const game = { ...makeGame('palindrome-share', 'Palindrome', puzzle.givens, 'imported'), variant: { id: 'palindrome' as const, puzzle, solution: fixture.solution } }
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: enter(game, [0], 'value', 8), close() {} }))
    const payload = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(payload)).variant, { id: 'palindrome', puzzle })
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('lesson diagrams, hint cards and solution lists use the same paired-cell proof and naming preference', () => {
  const example = corpus.palindrome; assert.ok('position' in example)
  assertPalindromeProof(example.position, example.deduction)
  assert.ok(lessonRoutes.get('palindrome'))
  const view = lessonExample(example)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'easy' as const }
    const diagram = lessonDiagram(view, view.pattern, options), hint = describeHint(view.deduction, options)
    const card = createElement(HintCard, { hint, explanation: [diagram.description, diagram.reason], lesson: { id: 'palindrome', title: 'Palindrome lines' }, onClose() {} })
    const mobile = createElement(MobilePanelLayout, { puzzleId: 'palindrome', rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: true, panels: { hint: { title: 'Hint', content: card } } })
    for (const html of [renderToStaticMarkup(card), renderToStaticMarkup(mobile)]) {
      assert.ok(html.includes('/learn/palindrome')); assert.match(html, /must match/)
      if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    }
    const solution = renderToStaticMarkup(createElement(SolutionPath, { state: { status: 'ready', trace: { steps: [view.deduction], rating: { status: { solved: 'easy' } } } },
      index: 0, cellReferenceStyle, techniqueDifficulties: { palindrome: 'easy' }, grid: null,
      explanation: { title: hint.title, text: diagram.description }, onSelect() {}, onRetry() {}, onClose() {} }))
    assert.ok(solution.includes('Palindrome'))
  }
})

test('independent replay rejects an action whose mirror no longer restricts its candidates', () => {
  const example = corpus.palindrome; assert.ok('position' in example)
  const unsupported = structuredClone(example.deduction)
  assert.equal(unsupported.evidence.type, 'constraint')
  unsupported.evidence.domains.fill(511)
  assert.throws(() => assertPalindromeProof(example.position, unsupported))
})
