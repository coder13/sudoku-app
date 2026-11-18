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
import { variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { assertRenbanProof } from './helpers/renban-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const empty = '0'.repeat(81)
const fixture = JSON.parse(readFileSync(new URL('./fixtures/renban-clover.json', import.meta.url), 'utf8'))
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
const board = (puzzle: VariantPuzzle) => createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens })

test('published Renban clues and consecutive-set labels appear on desktop and mobile', () => {
  const grid = board(fixture.puzzle)
  for (const node of [grid, createElement(MobilePanelLayout, { puzzleId: 'renban', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false, panels: { puzzle: { title: 'Puzzle', content: grid } } })]) {
    const html = renderToStaticMarkup(node)
    assert.equal([...html.matchAll(/class="variant-renban"/g)].length, 12)
    assert.match(html, /Renban line 1, 3 different consecutive digits in any order/)
    assert.match(html, /Renban line 12, 3 different consecutive digits in any order/)
  }
})

test('branch drawings contain their three intended edges and no invented bridge', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'renban', cells: [0, 10, 20, 40], segments: [[0, 10, 20], [10, 40]] }] }
  const html = renderToStaticMarkup(board(puzzle))
  const group = html.match(/<g class="variant-renban"[^>]*>(.*?)<\/g>/)![1]
  const edges = [...group.matchAll(/<polyline points="([^"]+)"/g)].flatMap(match => {
    const points = match[1].split(' ')
    return points.slice(1).map((point, i) => `${points[i]}→${point}`)
  })
  assert.deepEqual(edges, ['0.5,0.5→1.5,1.5', '1.5,1.5→2.5,2.5', '1.5,1.5→4.5,4.5'])
})

test('independent overlapping Renbans retain separate visible lanes through all transforms', () => {
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const original: VariantPuzzle = { version: 1, givens: empty, rules: [
      { type: 'renban', cells: [18, 27, 36] }, { type: 'renban', cells: [18, 27] },
      { type: 'palindrome', cells: [18, 27, 12, 65] }, { type: 'whispers', cells: [18, 27], minDifference: 1 },
      { type: 'kropki', consecutive: { pairs: [[18, 27]] }, ratioTwo: { pairs: [[18, 27]] } },
    ] }
    assertVariantCompletion(original, fixture.solution)
    const puzzle = reflectVariant(original, symmetry)
    const html = renderToStaticMarkup(board(puzzle))
    assert.equal([...html.matchAll(/class="variant-renban"/g)].length, 2)
    assert.equal([...html.matchAll(/class="variant-renban-overlap"/g)].length, 2)
    assert.match(html, /variant-palindrome-overlap/); assert.match(html, /variant-dot-white/)
    assert.match(html, /variant-whispers-label-leader/)
    const gap = html.match(/class="variant-whispers-gap" x="([^"]+)" y="([^"]+)"/)!
    const dots = [...html.matchAll(/class="variant-dot [^"]+" cx="([^"]+)" cy="([^"]+)"/g)]
    assert.ok(dots.every(dot => Math.hypot(Number(dot[1]) - Number(gap[1]), Number(dot[2]) - Number(gap[2])) > .3))
    const lanes = [...html.matchAll(/class="variant-renban-overlap"[^>]*><line ([^>]+)/g)].map(match => match[1])
    assert.equal(lanes.length, 2); assert.notEqual(lanes[0], lanes[1])
    assert.ok(lanes.every(line => !line.includes('NaN')))
    assert.match(html, /Renban line 1/); assert.match(html, /Renban line 2/)
  }
})

test('a one-cell Renban remains visible and names its unrestricted one-digit set', () => {
  const html = renderToStaticMarkup(board({ version: 1, givens: empty, rules: [{ type: 'renban', cells: [40] }] }))
  assert.match(html, /class="variant-renban"[^>]*><circle/)
  assert.match(html, /Renban line 1, one-cell set, any digit 1–9/)
})

test('sharing a progressed mixed puzzle retains every starting clue and original given', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/renban-killer-clover.json', import.meta.url), 'utf8'))
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const variant = { id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle, solution: source.solution }
    const game = { ...makeGame('renban-share', 'Renban', source.puzzle.givens, 'imported'), variant }
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: enter(game, [0], 'value', Number(source.solution[0])), close() {} }))
    const payload = html.match(/<textarea[^>]*id="share-output"[^>]*>([^<]+)<\/textarea>/)![1]
    assert.deepEqual((await detectPuzzle(payload)).variant, { id: variant.id, puzzle: variant.puzzle })
  } finally { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') }
})

test('the real Renban lesson and hint/solution components use an independently checked worked deduction', () => {
  const corpus = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')) as Record<string, EngineLessonExample>
  const source = corpus.renban; assert.ok('position' in source)
  assertRenbanProof(source.position.puzzle, source.deduction)
  assert.ok(lessonRoutes.get('renban'))
  const view = lessonExample(source)
  const grid = renderToStaticMarkup(board(source.position.puzzle))
  assert.match(grid, /class="variant-renban"/)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'medium' as const }
    const diagram = lessonDiagram(view, view.pattern, options), hint = describeHint(view.deduction, options)
    const html = renderToStaticMarkup(createElement(HintCard, { hint, explanation: [diagram.description, diagram.reason], lesson: { id: 'renban', title: 'Renban lines' }, onClose() {} }))
    assert.match(html, /\/learn\/renban/); assert.match(html, /consecutive/)
    if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    assert.match(renderToStaticMarkup(createElement(SolutionPath, { state: { status: 'ready', trace: { steps: [view.deduction], rating: { status: { solved: 'medium' } } } }, index: 0,
      cellReferenceStyle, techniqueDifficulties: { renban: 'medium' }, grid: null, onSelect() {}, onRetry() {}, onClose() {} })), /Renban/)
  }
  const wrong = structuredClone(source.deduction)
  wrong.actions = [{ eliminate: { cell: 23, digit: 3 } }]
  assert.throws(() => assertRenbanProof(source.position.puzzle, wrong))
})
