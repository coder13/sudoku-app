import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import type { PuzzleRating } from '../src/sudoku/engine.ts'
import { isSolved, makeGame } from '../src/sudoku/game.ts'
import { HINT_CANDIDATES_ERROR, HINT_ERROR } from '../src/sudoku/hints.ts'
import { PUZZLE_VARIANTS, variantRuleSections, type PuzzleVariantId } from '../src/sudoku/variants.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { describeHint, type CellReferenceStyle } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'

let Button: (props: Record<string, unknown>) => ReactNode
let server: ViteDevServer
let PlayHint: (props: Record<string, unknown>) => ReactNode
let PlayLayout: (props: Record<string, unknown>) => ReactNode
let Worktable: (props: Record<string, unknown>) => ReactNode
let AdvancedPuzzleBrowser: typeof import('../src/components/AdvancedPuzzleBrowser.tsx').AdvancedPuzzleBrowser
let SolutionReveal: (props: Record<string, unknown>) => ReactNode
let MobileInputTabs: (props: Record<string, unknown>) => ReactNode
let SolutionPath: (props: Record<string, unknown>) => ReactNode
let solutionEndSummary: typeof import('../src/components/SolutionPath.tsx').solutionEndSummary
let HintCard: (props: Record<string, unknown>) => ReactNode
let ChainsPanel: (props: Record<string, unknown>) => ReactNode
let Board: (props: Record<string, unknown>) => ReactNode
let PuzzleAnalysisContents: (props: Record<string, unknown>) => ReactNode
let preferences: Record<string, unknown>
let playSession: typeof import('../src/sudoku/play-session.ts').playSession

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Button } = await server.ssrLoadModule('/src/components/Button.tsx'))
  ;({ PlayLayout, PlayHint } = await server.ssrLoadModule('/src/components/PlayLayout.tsx'))
  ;({ MobileInputTabs } = await server.ssrLoadModule('/src/components/MobileInputTabs.tsx'))
  ;({ Worktable } = await server.ssrLoadModule('/src/components/Worktable.tsx'))
  ;({ AdvancedPuzzleBrowser } = await server.ssrLoadModule('/src/components/AdvancedPuzzleBrowser.tsx'))
  ;({ SolutionPath, SolutionReveal, solutionEndSummary } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
  ;({ HintCard } = await server.ssrLoadModule('/src/components/HintCard.tsx'))
  ;({ ChainsPanel } = await server.ssrLoadModule('/src/components/ChainsPanel.tsx'))
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ PuzzleAnalysisContents } = await server.ssrLoadModule('/src/components/PuzzleAnalysis.tsx'))
  preferences = await server.ssrLoadModule('/src/sudoku/preferences.ts')
  ;({ playSession } = await server.ssrLoadModule('/src/sudoku/play-session.ts'))
})
after(async () => { await server?.close() })

test('the advanced puzzle browser offers import and lets an existing draft be saved', () => {
  const noop = () => {}
  for (const source of ['custom', 'draft'] as const) {
    const game = makeGame(source, 'Puzzle', STARTER, source)
    const markup = renderToStaticMarkup(createElement(AdvancedPuzzleBrowser, {
      games: [game], active: game.id, view: 'active', onViewChange: noop, onSelect: noop,
      onNew: noop, onImport: noop, onSave: noop, onSavePuzzle: noop, onUnsavePuzzle: noop,
      onArchivePuzzle: noop, onRestorePuzzle: noop,
    }))
    assert.match(markup, /Import puzzle/)
    assert.doesNotMatch(markup, /Create puzzle|Edit puzzle/)
    assert.equal(/Save puzzle/.test(markup), source === 'draft')
  }
})

test('mixed rules group repeated clues under one heading and preserve both diagonal descriptions', () => {
  const sections = variantRuleSections({ version: 1, givens: STARTER, rules: [
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 8 }] },
    { type: 'diagonal', diagonal: 'main' },
    { type: 'quadruple', topLeft: 10, digits: [1, 2] },
    { type: 'diagonal', diagonal: 'anti' },
    { type: 'quadruple', topLeft: 20, digits: [3, 4] },
  ] })
  assert.deepEqual(sections.map(({ title, descriptions }) => [title, descriptions.length]), [
    ['Normal Sudoku', 1], ['Killer Sudoku', 1], ['Diagonal', 2], ['Quadruple', 1],
  ])
  assert.match(sections[2].descriptions[0], /top-left to bottom-right/)
  assert.match(sections[2].descriptions[1], /top-right to bottom-left/)
})

test('rendered hints and desktop/mobile solution lists share the selected cell naming style', () => {
  const corpus: Record<string, EngineLessonExample> = JSON.parse(readFileSync(
    new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8'))
  const parity = lessonExample(corpus.parity)
  for (const cellReferenceStyle of ['verbose', 'concise', 'automatic'] satisfies CellReferenceStyle[]) {
    const options = { cellReferenceStyle, difficulty: 'easy' as const }
    const diagram = lessonDiagram(parity, parity.pattern, options)
    const hint = describeHint(parity.deduction, options)
    const expected = cellReferenceStyle === 'concise' ? 'r9c9' : 'row 9, column 9'
    const card = renderToStaticMarkup(createElement(HintCard, {
      hint, explanation: [diagram.description, diagram.reason], onClose() {},
    }))
    assert.ok(card.includes(`${expected} has an odd circle`))
    assert.ok(card.includes(`Remove 8 from ${expected}.`))
    if (cellReferenceStyle !== 'concise') assert.doesNotMatch(card, /\br9c9\b/i)

    const props = { state: { status: 'ready', trace: { steps: [parity.deduction], rating: { status: { solved: 'easy' } } } },
      index: 0, cellReferenceStyle, techniqueDifficulties: { parity: 'easy' },
      onSelect() {}, onRetry() {}, onClose() {} }
    for (const embedded of [false, true]) {
      const html = renderToStaticMarkup(createElement(SolutionPath, { ...props, embedded }))
      assert.ok(html.includes(`Remove 8 from ${expected}.`))
      if (cellReferenceStyle !== 'concise') assert.doesNotMatch(html, /\br9c9\b/i)
    }
  }
  const forcing = lessonExample(corpus['nested-forcing-net'])
  const diagram = lessonDiagram(forcing, forcing.pattern, { cellReferenceStyle: 'verbose' })
  const html = renderToStaticMarkup(createElement(HintCard, {
    hint: describeHint(forcing.deduction, { cellReferenceStyle: 'verbose' }),
    explanation: [diagram.description, diagram.reason], trace: diagram.trace, onClose() {},
  }))
  assert.match(html, /Read the proof step by step/)
  assert.match(html, /row [1-9], column [1-9]/)
  assert.doesNotMatch(html, /\br[1-9]c[1-9]\b/i)
})

test('Automatic solution lists use each technique difficulty and absent preferences preserve lesson notation', () => {
  const props = { state: { status: 'ready', trace: { steps: [
    { technique: 'naked-single', actions: [{ place: { cell: 0, digit: 2 } }] },
    { technique: 'aic', actions: [{ eliminate: { cell: 80, digit: 8 } }] },
  ], rating: { status: { solved: 'hard' } } } }, index: 0,
  onSelect() {}, onRetry() {}, onClose() {} }
  const automatic = renderToStaticMarkup(createElement(SolutionPath, {
    ...props, cellReferenceStyle: 'automatic', techniqueDifficulties: { 'naked-single': 'easy', aic: 'hard' },
  }))
  assert.ok(automatic.includes('Place 2 in row 1, column 1.'))
  assert.ok(automatic.includes('Remove 8 from r9c9.'))
  const fallback = renderToStaticMarkup(createElement(SolutionPath, props))
  assert.ok(fallback.includes('Place 2 in R1C1.'))
  assert.ok(fallback.includes('Remove 8 from R9C9.'))
})

test('solution chain inspection uses the same preference for results and every link point form', () => {
  const options = { cellReferenceStyle: 'verbose', difficulty: 'hard' }
  const inspection = { ...options, deduction: { technique: 'grouped-aic', actions: [{ eliminate: { cell: 80, digit: 8 } }] },
    links: [
      { from: { cell: 0, digit: 1 }, to: { cells: [1, 2], digit: 2 } },
      { from: { candidates: [{ cell: 3, digit: 3 }, { cell: 4, digit: 4 }] }, to: { cell: 5, digit: 5 }, dashed: true },
    ] }
  const props = { sketch: {}, shortcuts: {}, onApply() {}, inspection }
  const long = renderToStaticMarkup(createElement(ChainsPanel, props))
  for (const column of [1, 2, 3, 4, 5, 6]) assert.ok(long.includes(`row 1, column ${column}`))
  assert.ok(long.includes('Remove 8 from row 9, column 9.'))
  assert.doesNotMatch(long, /\br[1-9]c[1-9]\b/i)
  const short = renderToStaticMarkup(createElement(ChainsPanel, {
    ...props, inspection: { ...inspection, cellReferenceStyle: 'automatic' },
  }))
  assert.ok(short.includes('Remove 8 from r9c9.'))
  assert.ok(short.includes('2 in r1c2 or r1c3'))
  assert.ok(short.includes('3 in r1c4 or 4 in r1c5'))
})

test('the variant finder explains invalid candidates and entries before showing technique counts', () => {
  const game = { ...makeGame('invalid-finder', 'Variant', STARTER, 'imported'), variant: {
    id: 'jigsaw', puzzle: { version: 1, givens: STARTER },
    solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
  } }
  game.position.eliminations = Array(81).fill(0)
  game.position.eliminations[2] = 1 << 3
  const candidates = renderToStaticMarkup(createElement(PuzzleAnalysisContents, { game }))
  assert.match(candidates, /role="alert"/)
  assert.ok(candidates.includes(HINT_CANDIDATES_ERROR.text))
  game.position.entries = '009' + '0'.repeat(78)
  const entries = renderToStaticMarkup(createElement(PuzzleAnalysisContents, { game }))
  assert.ok(entries.includes(HINT_ERROR.text))
  assert.ok(!entries.includes(HINT_CANDIDATES_ERROR.text))
})

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (node.type === Button) return elements(Button(node.props))
  if (node.type === SolutionReveal) return elements(SolutionReveal(node.props))
  return [node, ...Object.values(node.props).flatMap(elements)]
}

test('mobile solutions render a read-only Jigsaw preview, explanation, and navigable walkthrough', () => {
  const regions = { type: 'jigsaw', regions: Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)) }
  const solution = createElement(SolutionPath, {
    state: { status: 'ready', trace: { steps: [{ technique: 'hidden-single', actions: [{ place: { cell: 2, digit: 4 } }], evidence: {} }], rating: { status: { solved: 'medium' } } } },
    embedded: true, index: 0, onSelect() {}, onRetry() {}, onClose() {},
  })
  const html = renderToStaticMarkup(createElement(PlayLayout, {
    desktop: false,
    puzzle: createElement(Board, { variantPuzzle: { givens: STARTER, regions }, givens: STARTER, values: STARTER, label: 'Solution preview' }),
    hint: createElement(PlayHint, { mobile: true, children: createElement(HintCard, {
      hint: { title: 'Hidden Single', text: 'R1C3 is the only cell in region 1 that can contain 4.' }, onClose() {},
    }) }),
    input: createElement(MobileInputTabs, {
      active: 'solution', open: ['solution'], panels: { digits: null, solution }, onSelect() {}, onClose() {},
    }),
    mobile: { puzzleId: 'jigsaw-solution', rearranging: false, blocked: false, withHint: true, inputTitle: 'Input', onRearrangingChange() {} },
  }))
  assert.match(html, /class="mobile-panel-layout/)
  assert.match(html, /role="tab" aria-selected="true"[^>]*>Solution<\/button>/)
  assert.match(html, /jigsaw-board/)
  assert.match(html, /aria-label="Solution preview"/)
  assert.match(html, /aria-readonly="true"/)
  assert.match(html, /R1C3 is the only cell in region 1 that can contain 4/)
  assert.match(html, /aria-label="Solving steps"/)
  assert.match(html, /aria-label="Next step"/)
  assert.match(html, /Final grid/)
  assert.match(html, /aria-label="Close solution panel"/)
})

test('solution previews and walkthroughs distinguish a stalled path from a completed grid', () => {
  const cases = [
    { status: 'stalled', title: 'Last position', text: 'The solver reached the end of its available moves.' },
    { status: { solved: 'easy' }, title: 'Final grid', text: 'The solution is complete. The final grid is shown.' },
  ] satisfies { status: PuzzleRating['status']; title: string; text: string }[]
  for (const { status, title, text } of cases) {
    const steps = [{ technique: 'arrow', actions: [{ eliminate: { cell: 9, digit: 9 } }] }]
    const props = {
      state: { status: 'ready', trace: { steps, rating: { status } } },
      index: steps.length, onSelect() {}, onRetry() {}, onClose() {},
    }
    const summary = solutionEndSummary(status)
    const path = renderToStaticMarkup(createElement(SolutionPath, props))
    assert.ok(path.includes(`<strong>${title}</strong>`))
    assert.ok(path.includes(`role="status">${title}</span>`))

    for (const mobile of [false, true]) {
      const html = renderToStaticMarkup(createElement(PlayHint, {
        mobile, children: createElement(HintCard, { hint: summary, onClose() {} }),
      }))
      assert.ok(html.includes(title))
      assert.ok(html.includes(text))
      assert.ok(!html.includes(status === 'stalled' ? 'Final grid' : 'Last position'))
    }
  }
})

test('an exact solution is available without logical steps', () => {
  const path = renderToStaticMarkup(createElement(SolutionPath, {
    state: { status: 'ready', trace: { steps: [], rating: { status: 'stalled' }, exact: true } },
    embedded: true, index: 0, onSelect() {}, onRetry() {}, onClose() {},
  }))
  assert.match(path, /<strong>Exact solution<\/strong>/)
  assert.match(path, /Visible clues did not yield a complete logical path\./)
  assert.match(path, /aria-current="step"/)
})

function worktableTree(id: Exclude<PuzzleVariantId, 'mixed'>, workspaceMode: 'standard' | 'advanced', solved = false) {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const game = { ...makeGame('help-controls', 'Puzzle', STARTER, 'generated'), difficulty: 'medium' as const, score: 100 }
  if (solved) game.position.entries = [...solution].map((digit, cell) => STARTER[cell] === '0' ? digit : '0').join('')
  if (id !== 'classic') Object.assign(game, { variant: { id, puzzle: { givens: STARTER }, solution } })
  assert.equal(isSolved(game), solved)
  let tree: ReactNode
  function Capture() {
    tree = Worktable({
      game, games: [game], preferredDifficulty: 'medium', modalOpen: false,
      advancedModes: preferences.DEFAULT_ADVANCED_MODES, appearance: preferences.DEFAULT_APPEARANCE,
      highlighting: preferences.DEFAULT_HIGHLIGHT_PREFERENCES, errorMode: 'none',
      cellReferenceStyle: 'concise', workspaceMode, multi: false, actionsRef: { current: null },
      inputSize: 210, panelHeight: 280, setPanelHeight() {}, beginResize() {}, toggleMulti() {},
      onShare() {}, onPublish() {}, onCancelDraft() {}, onNewPuzzle() {},
      onImportPuzzle() {}, onStopPlaying() {},
      showLeftPanel: true, showRightPanel: true, showBottomPanel: true,
      onOpenHintPanel() {}, onOpenRightPanel() {}, puzzleBrowserView: 'active', setPuzzleBrowserView() {},
    })
    // Inspect the actual workspace affordances without mounting nested dock/router components.
    return null
  }
  renderToStaticMarkup(createElement(Capture))
  return elements(tree)
}

function desktopPlayMarkup(tree: ReturnType<typeof worktableTree>) {
  const layout = tree.find(({ type }) => type === PlayLayout)
  assert.ok(layout)
  const insights = layout.props.insights as { content: ReactElement }
  assert.equal(insights.content.type, PuzzleAnalysisContents)
  // Render the layout and tabs with inert slots. The workspace uses live engine and router state.
  return renderToStaticMarkup(createElement(PlayLayout, {
    ...layout.props, puzzle: null, input: null, hint: null, insights: { ...insights, content: null },
  }))
}

for (const id of Object.keys(PUZZLE_VARIANTS) as (Exclude<PuzzleVariantId, 'mixed'>)[]) {
  test(`${id} exposes hint actions, solution, and technique finder in both desktop workspaces`, () => {
    const previous = playSession.getServerSnapshot
    playSession.getServerSnapshot = () => ({ ...previous(), puzzleId: 'help-controls',
      toolPanels: { open: ['solution', 'techniques'], active: 'techniques' } })
    try {
      const standard = worktableTree(id, 'standard')
      if (id !== 'classic') assert.ok(standard.some(({ type, props }) => type === 'button' &&
        props['aria-label'] === `${PUZZLE_VARIANTS[id].name} Sudoku rules`), 'Global and local rules must remain discoverable')
      const html = desktopPlayMarkup(standard)
      assert.match(html, /data-insight-tab="solution"/)
      assert.match(html, /data-insight-tab="techniques"/)
      const completed = worktableTree(id, 'standard', true)
      assert.match(desktopPlayMarkup(completed), /data-insight-tab="techniques"/, 'An open finder stays visible after completion')
      for (const mode of ['standard', 'advanced'] as const) {
        const tree = worktableTree(id, mode)
        assert.ok(tree.some(({ type, props }) => type === 'button' && renderToStaticMarkup(createElement('span', null, props.children as ReactNode)).includes('View hint')))
        if (mode === 'advanced') {
          const dock = tree.find(({ props }) => props.solutionPath && props.techniques)!
          assert.ok(dock, 'Solution and technique finder must reach the dock')
          assert.ok(elements(dock.props.solutionPath).some(({ type, props }) => type === 'button' && !props.disabled))
          assert.ok(elements(dock.props.techniques).some(({ type }) => typeof type === 'function' && type.name === 'PuzzleAnalysisContents'))
        }
      }
    } finally { playSession.getServerSnapshot = previous }
  })
}
