import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame } from '../src/sudoku/game.ts'
import { describeHint, techniqueLabel } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { lessonRoutes } from '../src/sudoku/lessons.ts'
import { assertLineHouseProof } from './helpers/line-house-truth.ts'
import { isVariantId, variantDifficulties } from '../src/sudoku/variants.ts'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/whispers-brain-zaps.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
let server: ViteDevServer
type Component = (props: Record<string, unknown>) => ReactNode
let Board: Component, MobilePanelLayout: Component, SharePuzzle: Component, HintCard: Component, SolutionPath: Component, VariantPreview: Component, VariantRulesetSelector: Component, CompletedPuzzle: Component
let renderNewPuzzle: (path: string, preference?: { variant: string; difficulty: string; ruleset?: string }) => Promise<string>
let validateSearch: (search: Record<string, unknown>) => Record<string, unknown>
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
  ;({ SharePuzzle } = await server.ssrLoadModule('/src/components/PuzzleDialogs.tsx'))
  ;({ HintCard } = await server.ssrLoadModule('/src/components/HintCard.tsx'))
  ;({ SolutionPath } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
  ;({ VariantPreview } = await server.ssrLoadModule('/src/components/VariantPreview.tsx'))
  ;({ VariantRulesetSelector } = await server.ssrLoadModule('/src/components/VariantRulesetSelector.tsx'))
  ;({ CompletedPuzzle } = await server.ssrLoadModule('/src/components/CompletedPuzzle.tsx'))
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
  validateSearch = (await server.ssrLoadModule('/src/routes/puzzles.new.tsx')).Route.options.validateSearch
})
after(async () => { await server?.close() })

test('desktop and mobile Play preserve the published line paths and exact accessible neighbors', () => {
  const board = createElement(Board, { variantPuzzle: fixture.puzzle, givens: fixture.puzzle.givens, values: fixture.puzzle.givens, label: 'Whispers Sudoku grid' })
  const mobile = createElement(MobilePanelLayout, { puzzleId: 'whispers-mobile', rearranging: false, onRearrangingChange() {}, blocked: false, withHint: false, panels: { puzzle: { title: 'Puzzle', content: board } } })
  for (const node of [board, mobile]) {
    const html = renderToStaticMarkup(node)
    assert.equal([...html.matchAll(/class="variant-whispers"/g)].length, 4)
    for (const rule of fixture.puzzle.rules!) {
      assert.equal(rule.type, 'whispers')
      const points = rule.cells.map(cell => `${cell % 9 + .5},${Math.floor(cell / 9) + .5}`).join(' ')
      assert.ok(html.includes(`points="${points}"`))
    }
    const label = html.match(/data-cell="13"[^>]*aria-label="([^"]+)"/)![1]
    assert.match(label, /minimum difference 5 with row 1, column 5 and row 1, column 6/)
  }
})

test('nonstandard minimum differences are printed on their lines and conflicts reach both cells', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'whispers', cells: [0, 10, 20], minDifference: 4 }] }
  const values = [...puzzle.givens]; values[0] = '4'; values[10] = '7'
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: values.join(''), errors: conflictsOf(values.join(''), puzzle) }))
  assert.match(html, /data-min-difference="4"/); assert.match(html, /class="variant-whispers-gap"[^>]*>≥4<\/text>/)
  for (const cell of [0, 10]) assert.match(html.match(new RegExp(`data-cell="${cell}" class="([^"]+)"`))![1], /\bconflict\b/)
})

test('sharing a progressed Whispers puzzle retains its complete starting definition', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'example.test', origin: 'https://example.test' } } })
  try {
    const game = { ...makeGame('whispers-share', 'Brain Zaps', fixture.puzzle.givens, 'imported'), variant: { id: 'whispers' as const, puzzle: fixture.puzzle, solution: fixture.solution } }
    const progressed = enter(game, [0], 'value', 4)
    const html = renderToStaticMarkup(createElement(SharePuzzle, { game: progressed, close() {} }))
    assert.match(html, /Create link/)
    assert.deepEqual((await publishFixture(progressed)).variant, { id: 'whispers', puzzle: fixture.puzzle })
  } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window') }
})


test('the line/house lesson, diagrams and mobile hint cards use the same replayable proof', () => {
  const id = 'whispers-house-support'
  const article = lessonRoutes.get(id)!
  assert.equal(article.title, techniqueLabel(id))
  assert.ok(article.blocks.some(block => block.type === 'diagram' && block.example === id))
  assert.ok(article.blocks.some(block => block.type === 'practice' && block.guide?.reason))
  const corpus = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')) as Record<string, EngineLessonExample>
  const example = corpus[id]; assert.ok('position' in example)
  assertLineHouseProof(example.position, example.deduction)
  const view = lessonExample(example)
  for (const cellReferenceStyle of ['concise', 'verbose', 'automatic'] as const) {
    const options = { cellReferenceStyle, difficulty: 'medium' as const }
    const diagram = lessonDiagram(view, view.pattern, options), hint = describeHint(view.deduction, options)
    const card = createElement(HintCard, { hint, explanation: [diagram.description, diagram.reason], lesson: { id, title: article.title }, onClose() {} })
    const mobile = createElement(MobilePanelLayout, { puzzleId: id, rearranging: false, onRearrangingChange() {}, blocked: false, withHint: true, panels: { hint: { title: 'Hint', content: card } } })
    for (const html of [renderToStaticMarkup(card), renderToStaticMarkup(mobile)]) {
      assert.ok(html.includes(`/learn/${id}`)); assert.match(html, /assignments fit/); assert.match(html, /box 2/)
      if (cellReferenceStyle === 'verbose') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
    }
    const solution = renderToStaticMarkup(createElement(SolutionPath, { state: { status: 'ready', trace: { steps: [view.deduction], rating: { status: { solved: 'medium' } } } }, index: 0,
      cellReferenceStyle, techniqueDifficulties: { [id]: 'medium' }, grid: null, explanation: { title: hint.title, text: diagram.description }, onSelect() {}, onRetry() {}, onClose() {} }))
    assert.ok(solution.includes(article.title))
  }
})

test('proof replay detects a missing shared house or a false supported candidate', () => {
  const corpus = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8')) as Record<string, EngineLessonExample>
  const example = corpus['whispers-house-support']; assert.ok('position' in example)
  const missing = structuredClone(example.deduction); assert.equal(missing.evidence.type, 'line-houses'); missing.evidence.houses = []
  assert.throws(() => assertLineHouseProof(example.position, missing))
  const falseSupport = structuredClone(example.deduction); assert.equal(falseSupport.evidence.type, 'line-houses'); falseSupport.evidence.supported[1] |= 1 << 7
  assert.throws(() => assertLineHouseProof(example.position, falseSupport))
})

test('a closed line is drawn through its last edge and names both neighbors at its first cell', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'whispers', cells: [0,10,20,0], minDifference: 4 }] }
  const html = renderToStaticMarkup(createElement(Board, { variantPuzzle: puzzle, givens: puzzle.givens, values: puzzle.givens }))
  assert.ok(html.includes('points="0.5,0.5 1.5,1.5 2.5,2.5 0.5,0.5"'))
  const label = html.match(/data-cell="0"[^>]*aria-label="([^"]+)"/)![1]
  assert.match(label, /minimum difference 4 with row 2, column 2 and row 3, column 3/)
})


test('New Puzzle exposes Medium Whispers with accurate line previews and accessible preset radios', () => {
  assert.ok(isVariantId('whispers'))
  assert.deepEqual(variantDifficulties('whispers'), ['medium'])
  for (const [ruleset, gap] of [['german', 5], ['dutch', 4]]) {
    const preview = renderToStaticMarkup(createElement(VariantPreview, { variant: 'whispers', ruleset }))
    assert.match(preview, new RegExp(`data-min-difference="${gap}"`))
    if (gap === 4) assert.match(preview, /≥4/)
    const choices = renderToStaticMarkup(createElement(VariantRulesetSelector, { variant: 'whispers', value: ruleset, disabled: true, onChange() {} }))
    assert.match(choices, /<fieldset[^>]*disabled/)
    assert.match(choices.match(new RegExp(`<input[^>]*value="${ruleset}"[^>]*>`))![0], /checked/)
    assert.match(choices, /German Whispers/); assert.match(choices, /Dutch Whispers/)
    assert.match(choices, /aria-labelledby=/); assert.match(choices, /aria-describedby=/)
    assert.match(choices, /differ by at least 5/); assert.match(choices, /differ by at least 4/)
  }
  assert.equal(renderToStaticMarkup(createElement(VariantRulesetSelector, { variant: 'parity', onChange() {} })), '')
})

test('actual New Puzzle routes preserve styles in Continue/Back links, saved choices and difficulty selection', async () => {
  assert.deepEqual(validateSearch({ variant: 'whispers', ruleset: 'dutch' }), { variant: 'whispers', ruleset: 'dutch' })
  assert.deepEqual(validateSearch({ variant: 'parity', ruleset: 'dutch' }), { variant: 'parity' })
  assert.deepEqual(validateSearch({ variant: 'whispers', ruleset: 'invalid' }), { variant: 'whispers' })
  assert.deepEqual(validateSearch({ variant: 'missing', ruleset: 'german' }), {})
  for (const ruleset of ['german', 'dutch']) {
    const choice = await renderNewPuzzle('/puzzles/new?variant=whispers&ruleset=' + ruleset)
    assert.match(choice, /Choose a variant/)
    assert.match(choice, new RegExp(`/puzzles/new/difficulty\\?variant=whispers&amp;ruleset=${ruleset}`))
    const difficulty = await renderNewPuzzle('/puzzles/new/difficulty?variant=whispers&ruleset=' + ruleset)
    assert.match(difficulty, /Choose difficulty/)
    assert.match(difficulty, new RegExp(`${ruleset === 'german' ? 'German' : 'Dutch'} Whispers`))
    assert.match(difficulty, new RegExp(`/puzzles/new\\?variant=whispers&amp;ruleset=${ruleset}`))
    assert.match(difficulty, /Start medium puzzle/)
    assert.doesNotMatch(difficulty, /value="easy"/)
  }
  const saved = await renderNewPuzzle('/puzzles/new/difficulty', { variant: 'whispers', difficulty: 'medium', ruleset: 'dutch' })
  assert.match(saved, /Dutch Whispers/)
  assert.match(saved.match(/<input[^>]*value="dutch"[^>]*>/)![0], /checked/)
})

test('the completed published Whispers puzzle offers a verified next Medium puzzle', () => {
  const game = { ...makeGame('whispers-complete', 'Brain Zaps', fixture.puzzle.givens, 'imported'), variant: { id: 'whispers' as const, puzzle: fixture.puzzle, solution: fixture.solution } }
  game.position.entries = [...fixture.solution].map((digit, cell) => game.givens[cell] === '0' ? digit : '0').join('')
  const html = renderToStaticMarkup(createElement(CompletedPuzzle, { game, games: [game], preferredDifficulty: 'medium',
    ratingPending: false, shortcutEnabled: false, showGuides: true, onResumePuzzle() {}, onChooseDifficulty() {}, onChooseVariant() {} }))
  assert.match(html, /Next medium puzzle/); assert.match(html, /Choose difficulty/); assert.match(html, /Choose variant/)
})
