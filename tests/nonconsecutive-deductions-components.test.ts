import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { describeHint, techniqueLabel, type CellReferenceStyle } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram, lessonValues } from '../src/sudoku/lesson-diagram.ts'
import { lessonRoutes } from '../src/sudoku/lessons.ts'
import { assertExclusionProof, NC_EXCLUSION_TECHNIQUES } from './helpers/exclusion-truth.ts'

const corpus: Record<string, EngineLessonExample> = JSON.parse(readFileSync(new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8'))
type Component = (props: Record<string, unknown>) => ReactNode
let server: ViteDevServer, HintCard: Component, Board: Component, SolutionPath: Component, SolutionDialog: Component
let MobilePanelLayout: typeof import('../src/components/MobilePanelLayout.tsx').MobilePanelLayout
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ HintCard } = await server.ssrLoadModule('/src/components/HintCard.tsx'))
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ SolutionPath, SolutionDialog } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
  ;({ MobilePanelLayout } = await server.ssrLoadModule('/src/components/MobilePanelLayout.tsx'))
})
after(async () => { await server?.close() })

test('each named technique has a real Learn diagram, practice guide and complete alternative highlights', () => {
  for (const technique of NC_EXCLUSION_TECHNIQUES) {
    const article = lessonRoutes.get(technique)
    assert.ok(article)
    assert.equal(article.title, techniqueLabel(technique))
    assert.ok(article.blocks.some(block => block.type === 'diagram' && block.example === technique))
    assert.ok(article.blocks.some(block => block.type === 'practice' && block.drills.some(drill => drill.example === technique) && block.guide?.reason))
    const example = corpus[technique]
    assert.ok('position' in example)
    assertExclusionProof(example.position, example.deduction)
    const view = lessonExample(example)
    const diagram = lessonDiagram(view, view.pattern)
    const { evidence } = example.deduction
    assert.equal(evidence.type, 'exclusion')
    const premise = evidence.premise
    const alternatives = premise.type === 'cell'
      ? Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => premise.domain & 1 << (digit - 1))
        .map(digit => ({ cell: premise.cell, digit }))
      : premise.cells.map(cell => ({ cell, digit: premise.digit }))
    for (const candidate of alternatives) assert.ok(diagram.annotations.candidates?.get(candidate.cell)?.has(candidate.digit))
    for (const action of example.deduction.actions) {
      assert.ok('eliminate' in action)
      assert.equal(diagram.annotations.candidates?.get(action.eliminate.cell)?.get(action.eliminate.digit)?.mark, 'strike')
    }
    const grid = renderToStaticMarkup(createElement(Board, { variantPuzzle: example.position.puzzle,
      givens: example.position.puzzle.givens, values: lessonValues(view), candidates: example.candidates,
      annotations: diagram.annotations, region: diagram.region, showAnnotatedCandidates: true }))
    assert.match(grid, /role="grid"/)
    assert.match(grid, /to remove/)
  }
})

test('desktop and mobile proof cards and solution lists honor every cell naming preference', () => {
  for (const technique of NC_EXCLUSION_TECHNIQUES) {
    const view = lessonExample(corpus[technique])
    for (const cellReferenceStyle of ['verbose', 'concise', 'automatic'] satisfies CellReferenceStyle[]) {
      const options = { cellReferenceStyle, difficulty: 'easy' as const }
      const diagram = lessonDiagram(view, view.pattern, options)
      const hint = describeHint(view.deduction, options)
      const card = createElement(HintCard, { hint, explanation: [diagram.description, diagram.reason],
        lesson: { id: technique, title: techniqueLabel(technique) }, onClose() {} })
      const desktop = renderToStaticMarkup(card)
      const mobile = renderToStaticMarkup(createElement(MobilePanelLayout, {
        puzzleId: technique, rearranging: false, onRearrangingChange() {}, blocked: false, withHint: true,
        panels: { hint: { title: 'Hint', content: card } },
      }))
      for (const html of [desktop, mobile]) {
        assert.ok(html.includes(`/learn/${technique}`))
        assert.ok(html.includes('Non-Consecutive'))
        assert.ok(html.includes('every alternative fails'))
        if (cellReferenceStyle === 'concise') assert.match(html, /r[1-9]c[1-9]/)
        else { assert.match(html, /row [1-9], column [1-9]/); assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i) }
      }
      for (const Component of [SolutionPath, SolutionDialog]) {
        const html = renderToStaticMarkup(createElement(Component, {
          state: { status: 'ready', trace: { steps: [view.deduction], rating: { status: { solved: 'easy' } } } },
          index: 0, cellReferenceStyle, techniqueDifficulties: { [technique]: 'easy' }, grid: null,
          explanation: { title: hint.title, text: diagram.description }, onSelect() {}, onRetry() {}, onClose() {},
        }))
        assert.ok(html.includes(techniqueLabel(technique)))
        if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
      }
    }
  }
})

test('independent proof replay rejects incomplete alternatives and an exempted edge', () => {
  for (const technique of NC_EXCLUSION_TECHNIQUES) {
    const example = corpus[technique]
    assert.ok('position' in example)
    const changed = structuredClone(example.deduction)
    assert.equal(changed.evidence.type, 'exclusion')
    if (changed.evidence.premise.type === 'cell') changed.evidence.premise.domain &= changed.evidence.premise.domain - 1
    else changed.evidence.premise.cells.pop()
    assert.throws(() => assertExclusionProof(example.position, changed))
    const position = structuredClone(example.position)
    const { evidence, actions } = example.deduction
    assert.equal(evidence.type, 'exclusion')
    assert.ok('eliminate' in actions[0])
    const target = actions[0].eliminate.cell
    const source = evidence.premise.type === 'cell' ? evidence.premise.cell : evidence.premise.cells.find(cell => cell !== target)!
    const rule = position.puzzle.rules![evidence.rules[0]]
    assert.equal(rule.type, 'non-consecutive')
    position.puzzle.rules = position.puzzle.rules!.map(candidate => candidate === rule ? { ...rule, except: [[source, target]] } : candidate)
    assert.throws(() => assertExclusionProof(position, example.deduction))
  }
})
