import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantDeduction, VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { describeHint } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { lessonRoutes } from '../src/sudoku/lessons.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { assertXvProof } from './helpers/xv-truth.ts'

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
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

test('published XV and Quadruple clues remain complete on desktop and mobile grids', () => {
  for (const [name, expectedV, expectedX, quads] of [['xv-clover', 8, 14, 0], ['xv-quadruple-clover', 4, 12, 6]] as const) {
    const { puzzle } = load(name)
    const board = createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens, label: 'XV Sudoku grid' })
    const mobile = createElement(MobilePanelLayout, { puzzleId: name, rearranging: false, onRearrangingChange() {}, blocked: false,
      withHint: false, panels: { puzzle: { title: 'Puzzle', content: board } } })
    for (const node of [board, mobile]) {
      const html = renderToStaticMarkup(node)
      assert.equal([...html.matchAll(/class="variant-xv-mark" data-sum="5"/g)].length, expectedV)
      assert.equal([...html.matchAll(/class="variant-xv-mark" data-sum="10"/g)].length, expectedX)
      assert.equal([...html.matchAll(/class="variant-quadruple"/g)].length, quads)
      for (const rule of puzzle.rules!) if (rule.type === 'xv') for (const [sum, marks] of [[5, rule.five], [10, rule.ten]] as const) {
        for (const [a, b] of marks?.pairs ?? []) {
          assert.ok(html.includes(`data-cell-a="${a}" data-cell-b="${b}"`))
          for (const partner of [a, b]) assert.ok(html.includes(`${sum === 5 ? 'V' : 'X'} clue, sum ${sum} with row ${Math.floor(partner / 9) + 1}, column ${partner % 9 + 1}`))
        }
      }
    }
  }
})

test('shared XV, white-dot and reversed inequality clues occupy separate positions after every transform', () => {
  for (const [less, greater] of [[0, 1], [1, 0]]) for (let symmetry = 0; symmetry < 8; symmetry++) {
    const rules: VariantRule[] = [{ type: 'xv', five: { pairs: [[0, 1]] } }, { type: 'xv', five: { pairs: [[1, 0]] } },
      { type: 'kropki', consecutive: { pairs: [[0, 1]] } }, { type: 'inequality', less, greater }]
    const puzzle = reflectVariant({ version: 1, givens: '0'.repeat(81), rules }, symmetry)
    const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
    assert.equal([...html.matchAll(/class="variant-xv-mark"/g)].length, 1)
    assert.equal([...html.matchAll(/class="variant-dot variant-dot-white"/g)].length, 1)
    const text = html.match(/class="variant-xv-mark" data-sum="5" x="([^"]+)" y="([^"]+)"/)!;
    const dot = html.match(/class="variant-dot variant-dot-white" cx="([^"]+)" cy="([^"]+)"/)!;
    const sign = html.match(/class="variant-inequality-sign" points="([^"]+)"/)![1].split(' ').map(point => point.split(',').map(Number))
    assert.ok(Math.hypot(Number(text[1]) - Number(dot[1]), Number(text[2]) - Number(dot[2])) >= .26)
    assert.ok(Math.hypot(sign[1][0] - Number(dot[1]), sign[1][1] - Number(dot[2])) >= .3)
    // The text and inequality stay on opposite sides of the marked edge.
    const tx = Number(text[1]) - Number(dot[1]), ty = Number(text[2]) - Number(dot[2])
    assert.ok(tx * (sign[1][0] - Number(dot[1])) + ty * (sign[1][1] - Number(dot[2])) < 0)
  }
})

test('sharing progressed XV puzzles retains the starting givens and independent negative fields', async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const { puzzle, solution } = load('xv-clover')
    const game = { ...makeGame('xv-share', 'XV', puzzle.givens, 'imported'), variant: { id: 'xv' as const, puzzle, solution } }
    const cell = puzzle.givens.indexOf('0')
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: enter(game, [cell], 'value', Number(solution[cell])), close() {} }))
    const payload = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(payload)).variant, { id: 'xv', puzzle })
    const negative: VariantPuzzle = { ...puzzle, rules: [{ type: 'xv', five: { negative: true }, ten: { negative: false } }] }
    assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify({ id: 'xv', puzzle: negative })))).variant?.puzzle, negative)
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('XV lessons, hint cards and solution steps retain the same evidence and naming preferences', () => {
  const example = corpus.xv; assert.ok('position' in example)
  assertXvProof(example.position.puzzle, example.deduction)
  assert.ok(lessonRoutes.get('xv'))
  const view = lessonExample(example)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'easy' as const }
    const diagram = lessonDiagram(view, view.pattern, options), hint = describeHint(view.deduction, options)
    const card = createElement(HintCard, { hint, explanation: [diagram.description, diagram.reason], lesson: { id: 'xv', title: 'XV sums' }, onClose() {} })
    for (const html of [renderToStaticMarkup(card), renderToStaticMarkup(createElement(MobilePanelLayout, {
      puzzleId: 'xv', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: true, panels: { hint: { title: 'Hint', content: card } },
    }))]) {
      assert.ok(html.includes('/learn/xv')); assert.match(html, /total of 5/)
      if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    }
    const path = renderToStaticMarkup(createElement(SolutionPath, { state: { status: 'ready', trace: { steps: [view.deduction], rating: { status: { solved: 'easy' } } } },
      index: 0, cellReferenceStyle, techniqueDifficulties: { xv: 'easy' }, grid: null,
      explanation: { title: hint.title, text: diagram.description }, onSelect() {}, onRetry() {}, onClose() {} }))
    assert.ok(path.includes('XV'))
  }
})

test('independent XV replay rejects a supported removal and hints name the house that excludes two fives', () => {
  const example = corpus.xv; assert.ok('position' in example)
  const unsupported = structuredClone(example.deduction)
  unsupported.actions = [{ eliminate: { cell: 63, digit: 3 } }]
  assert.throws(() => assertXvProof(example.position.puzzle, unsupported))
  for (const other of [1, 9]) {
    const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'xv', ten: { pairs: [[0, other]] } }] }
    const proof: VariantDeduction = { technique: 'xv', actions: [{ eliminate: { cell: other, digit: 5 } }],
      evidence: { type: 'constraint', rules: [0], cells: [0, other], domains: [511 & ~16, 511] } }
    assertXvProof(puzzle, proof)
    const hint = variantHintChoice(proof, puzzle)
    assert.ok('variant' in hint.evidence)
    assert.match(hint.evidence.variant.reason, new RegExp(other === 1 ? 'row 1' : 'column 1'))
    assert.match(hint.evidence.variant.reason, /neither cell can be 5/)
  }
})
