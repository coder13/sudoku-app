import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { isSolved, makeGame } from '../src/sudoku/game.ts'
import { PUZZLE_VARIANTS, type PuzzleVariantId } from '../src/sudoku/variants.ts'
import { STARTER } from '../src/sudoku/formats.ts'

let server: ViteDevServer
let Worktable: (props: Record<string, unknown>) => ReactNode
let SolutionDialog: (props: Record<string, unknown>) => ReactNode
let Board: (props: Record<string, unknown>) => ReactNode
let PuzzleAnalysisContents: (props: Record<string, unknown>) => ReactNode
let preferences: Record<string, unknown>
let playPreferences: { DEFAULT_PLAY_PREFERENCES: { desktopViews: { open: string[]; active: string | null } } }

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Worktable } = await server.ssrLoadModule('/src/components/Worktable.tsx'))
  ;({ SolutionDialog } = await server.ssrLoadModule('/src/components/SolutionPath.tsx'))
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  ;({ PuzzleAnalysisContents } = await server.ssrLoadModule('/src/components/PuzzleAnalysis.tsx'))
  preferences = await server.ssrLoadModule('/src/sudoku/preferences.ts')
  playPreferences = await server.ssrLoadModule('/src/sudoku/play-preferences.ts')
})
after(async () => { await server?.close() })

test('the variant finder explains invalid candidates and entries before showing technique counts', () => {
  const game = { ...makeGame('invalid-finder', 'Variant', STARTER, 'imported'), variant: {
    id: 'jigsaw', puzzle: { version: 1, givens: STARTER },
    solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
  } }
  game.position.eliminations = Array(81).fill(0)
  game.position.eliminations[2] = 1 << 3
  const candidates = renderToStaticMarkup(createElement(PuzzleAnalysisContents, { game }))
  assert.match(candidates, /role="alert"/)
  assert.match(candidates, /current candidates rule out the solution/)
  game.position.entries = '009' + '0'.repeat(78)
  const entries = renderToStaticMarkup(createElement(PuzzleAnalysisContents, { game }))
  assert.match(entries, /Resolve any conflicts/)
  assert.doesNotMatch(entries, /current candidates rule out the solution/)
})

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...Object.values(node.props).flatMap(elements)]
}

test('mobile solutions render a read-only Jigsaw preview, explanation, and navigable walkthrough', () => {
  const regions = { type: 'jigsaw', regions: Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)) }
  const html = renderToStaticMarkup(createElement(SolutionDialog, {
    grid: createElement(Board, { variantPuzzle: { givens: STARTER, regions }, givens: STARTER, values: STARTER, label: 'Solution preview' }),
    explanation: { title: 'Hidden Single', text: 'R1C3 is the only cell in region 1 that can contain 4.' },
    state: { status: 'ready', trace: { steps: [{ technique: 'hidden-single', actions: [{ place: { cell: 2, digit: 4 } }], evidence: {} }], rating: { status: { solved: 'medium' } } } },
    index: 0, onSelect() {}, onRetry() {}, onClose() {}, onReveal() {},
  }))
  assert.match(html, /mobile-solution-dialog/)
  assert.match(html, /jigsaw-board/)
  assert.match(html, /aria-label="Solution preview"/)
  assert.match(html, /aria-readonly="true"/)
  assert.match(html, /R1C3 is the only cell in region 1 that can contain 4/)
  assert.match(html, /aria-label="Solving steps"/)
  assert.match(html, /aria-label="Next step"/)
  assert.match(html, /Final grid/)
  assert.match(html, /aria-label="Close dialog"/)
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
      onDifficultyChange() {}, onShare() {}, onPublish() {}, onCancelDraft() {}, onNewPuzzle() {},
      onCreatePuzzle() {}, onEditPuzzle() {}, onStopPlaying() {},
      showLeftPanel: true, showRightPanel: true, showBottomPanel: true,
      onOpenHintPanel() {}, onOpenRightPanel() {}, puzzleBrowserView: 'active', setPuzzleBrowserView() {},
    })
    // Inspect the actual workspace affordances without mounting nested dock/router components.
    return null
  }
  renderToStaticMarkup(createElement(Capture))
  return elements(tree)
}

for (const id of Object.keys(PUZZLE_VARIANTS) as (Exclude<PuzzleVariantId, 'mixed'>)[]) {
  test(`${id} exposes hint actions, solution, and technique finder in both desktop workspaces`, () => {
    const previous = playPreferences.DEFAULT_PLAY_PREFERENCES.desktopViews
    playPreferences.DEFAULT_PLAY_PREFERENCES.desktopViews = { open: ['solution', 'techniques'], active: 'techniques' }
    try {
      const standard = worktableTree(id, 'standard')
      if (id !== 'classic') assert.ok(standard.some(({ type, props }) => type === 'button' &&
        props['aria-label'] === `${PUZZLE_VARIANTS[id].name} Sudoku rules`), 'Global and local rules must remain discoverable')
      assert.ok(standard.some(({ props }) => props['data-insight-tab'] === 'solution'))
      assert.ok(standard.some(({ props }) => props['data-insight-tab'] === 'techniques'))
      assert.ok(standard.some(({ type }) => typeof type === 'function' && type.name === 'PuzzleAnalysisContents'))
      const completed = worktableTree(id, 'standard', true)
      assert.ok(completed.some(({ props }) => props['data-insight-tab'] === 'techniques'), 'An open finder stays visible after completion')
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
    } finally { playPreferences.DEFAULT_PLAY_PREFERENCES.desktopViews = previous }
  })
}
