import { useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Board } from '../../../src/components/Board'
import { Board as BaselineBoard } from 'virtual:desktop-resize-baseline-board'
import type { BoardAnnotations } from '../../../src/components/BoardAnnotations'
import { Button, IconButton } from '../../../src/components/Button'
import { Controls } from '../../../src/components/Controls'
import { DesktopPlayLayout, PlayWorkspace } from '../../../src/components/DesktopPlayLayout'
import { HintCard } from '../../../src/components/HintCard'
import { DesktopPlayLayout as BaselineDesktopPlayLayout, PlayWorkspace as BaselinePlayWorkspace } from 'virtual:desktop-resize-baseline'
import { ModeBadge } from '../../../src/components/ModeBadge'
import { PlayHint, PlayLayout } from '../../../src/components/PlayLayout'
import { STARTER } from '../../../src/sudoku/formats'
import type { VariantPuzzle } from '../../../src/sudoku/engine'
import type { ModeBadgePosition } from '../../../src/sudoku/play-preferences'
import { DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE } from '../../../src/sudoku/preferences'
import { applyTheme } from '../../../src/sudoku/themes'
import '@fontsource-variable/dm-sans/wght.css'

const query = new URLSearchParams(location.search)
await (query.has('baseline') ? import('virtual:desktop-resize-baseline.css') : import('../../../src/styles.css'))
const theme = query.has('andoku') ? 'andoku' : DEFAULT_APPEARANCE.lightTheme
applyTheme(document.documentElement, theme, 'light')
document.documentElement.dataset.theme = theme
document.documentElement.dataset.colorMode = 'light'

const Layout = query.has('baseline') ? BaselineDesktopPlayLayout : DesktopPlayLayout
const Workspace = query.has('baseline') ? BaselinePlayWorkspace : PlayWorkspace
const candidateLayout = query.has('center') ? 'center-corner' : 'grid'
const noop = () => {}
const empty = '0'.repeat(81)
const givens = query.has('normal') ? STARTER : empty
// Precomputed classic notes keep solver work out of the measured resize path.
const center = [...givens].map((value, cell) => {
  if (value !== '0') return 0
  if (!query.has('normal')) return 511
  const row = Math.floor(cell / 9),
    column = cell % 9
  let mask = 511
  for (let peer = 0; peer < 81; peer++) {
    const peerRow = Math.floor(peer / 9),
      peerColumn = peer % 9
    if (peerRow === row || peerColumn === column || (Math.floor(peerRow / 3) === Math.floor(row / 3) && Math.floor(peerColumn / 3) === Math.floor(column / 3))) {
      const digit = Number(givens[peer])
      if (digit) mask &= ~(1 << (digit - 1))
    }
  }
  return mask
})
const position = { center, corner: Array(81).fill(0), colors: Array(81).fill(0) }
const annotations: BoardAnnotations | undefined = query.has('chains')
  ? {
      candidates: new Map([
        [
          2,
          new Map([
            [2, { color: '#5d72e4', mark: 'ring' as const }],
            [4, { color: '#e45d77', mark: 'emphasized' as const }],
          ]),
        ],
        [3, new Map([[2, { color: '#5d72e4', mark: 'ring' as const }]])],
        [11, new Map([[4, { color: '#e45d77', mark: 'emphasized' as const }]])],
      ]),
      links: [
        { from: { cell: 2, digit: 2 }, to: { cell: 3, digit: 2 }, color: '#5d72e4' },
        { from: { cell: 2, digit: 4 }, to: { cell: 11, digit: 4 }, color: '#e45d77', dashed: true },
      ],
    }
  : undefined
const outsidePuzzle: VariantPuzzle | undefined = query.has('outside')
  ? {
      version: 1,
      givens,
      rules: [
        { type: 'sandwich', direction: 'south', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72], sum: 15 },
        { type: 'x-sum', direction: 'east', cells: [36, 37, 38, 39, 40, 41, 42, 43, 44], sum: 20 },
        { type: 'skyscrapers', direction: 'east', cells: [36, 37, 38, 39, 40, 41, 42, 43, 44], count: 4 },
        { type: 'little-killer', direction: 'south-east', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80], sum: 45 },
      ],
    }
  : undefined

declare global {
  interface Window {
    desktopResizeFixture: {
      setEnabled: (enabled: boolean) => void
      setMounted: (mounted: boolean) => void
      setBadge: (position: ModeBadgePosition) => void
      candidates: number
    }
  }
}

function PlayContents({ badge, setBadge }: { badge: ModeBadgePosition; setBadge: (position: ModeBadgePosition) => void }) {
  const puzzle = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLDivElement>(null)
  const boundary = useRef<HTMLDivElement>(null)
  const hintColumn = useRef<HTMLDivElement>(null)
  const hintFrame = useRef<HTMLDivElement>(null)
  const hintCard = useRef<HTMLElement>(null)
  const hintBody = useRef<HTMLDivElement>(null)
  const hintToolbar = useRef<HTMLDivElement>(null)
  const hintLayout = { column: hintColumn, frame: hintFrame, card: hintCard, body: hintBody, toolbar: hintToolbar }
  const modeBadge = !query.has('solved') && (
    <ModeBadge
      mode="pencil"
      descriptionId="desktop-resize-mode"
      cardRef={boundary}
      position={badge}
      onPosition={setBadge}
      onActivate={noop}
      boundaryLabel="Sudoku grid"
    />
  )
  const board = query.has('baseline') ? (
    <BaselineBoard
      givens={givens}
      values={givens}
      position={position}
      variantPuzzle={outsidePuzzle}
      candidateLayout={candidateLayout}
      annotations={annotations}
      showGuides
      onCell={noop}
      modeBorder={query.has('solved') ? undefined : 'pencil'}
      modeBoundaryRef={boundary}
      modeBadge={modeBadge}
    />
  ) : (
    <Board
      content={{ givens, values: givens, position, variantPuzzle: outsidePuzzle }}
      appearance={{ candidateLayout, annotations, showGuides: true }}
      interaction={{ onCell: noop }}
      layout={{
        frameRef: hintFrame,
        modeBorder: query.has('solved') ? undefined : 'pencil',
        modeBoundaryRef: boundary,
        modeBadge,
      }}
    />
  )

  // Match Worktable's desktop input alignment observer. The fixture uses the
  // actual board/play layers and controls, but does not mount Worktable itself.
  useLayoutEffect(() => {
    const card = puzzle.current,
      gridStage = stage.current
    const puzzleStack = card?.closest<HTMLElement>('.standard-puzzle-stack')
    const inputStack = input.current?.closest<HTMLElement>('.standard-input-stack')
    if (!card || !gridStage || !puzzleStack || !inputStack) return
    const grid = gridStage.querySelector('.board-body') ?? gridStage
    const alignInput = () => {
      const page = puzzleStack.closest<HTMLElement>('.standard-workspace-page')
      const previewScale = page?.closest('.desktop-play-resizable')?.hasAttribute('data-layout-resizing') ? Number(page.style.scale) || 1 : 1
      const scale = (Number(getComputedStyle(puzzleStack).getPropertyValue('--desktop-layout-scale')) || 1) * previewScale
      const top = (grid.getBoundingClientRect().top - puzzleStack.getBoundingClientRect().top) / scale
      inputStack.style.setProperty('--puzzle-grid-offset', `${top + puzzleStack.scrollTop}px`)
    }
    alignInput()
    const observer = new ResizeObserver(alignInput)
    observer.observe(card, { box: 'border-box' })
    observer.observe(gridStage, { box: 'border-box' })
    observer.observe(grid, { box: 'border-box' })
    return () => {
      observer.disconnect()
      inputStack.style.removeProperty('--puzzle-grid-offset')
    }
  }, [])

  const puzzlePanel = (
    <div ref={hintColumn} className="puzzle-column" data-reserve-badge-space>
      <section ref={puzzle} className="puzzle puzzle-flat" aria-label="Desktop resize puzzle" data-desktop-solved={query.has('solved') || undefined}>
        <div className="puzzle-metadata">
          <span className="puzzle-difficulty">Hard</span>
          <span className="duration-counter">12:34</span>
        </div>
        <div className="puzzle-actions">
          <IconButton className="puzzle-menu-trigger" aria-label="Puzzle options">
            ⋯
          </IconButton>
        </div>
        <div className="puzzle-stage" ref={stage}>
          <div className="puzzle-play-layers">
            <div className="puzzle-play-layer puzzle-live-layer">
              {board}
            </div>
          </div>
        </div>
        {!query.has('solved') && (
          <nav className="puzzle-quick-actions" aria-label="Pinned puzzle actions">
            <Button variant="quiet">Hint</Button>
            <Button variant="quiet">Undo</Button>
            <Button variant="quiet">Redo</Button>
          </nav>
        )}
      </section>
    </div>
  )
  const inputPanel = (
    <div ref={input} className="workspace-controls">
      <Controls
        digits={{ mode: 'candidate', pencil: true, candidateKind: 'center', setCandidateKind: noop, selectedDigit: null, hasCellSelection: false, values: givens, input: noop }}
        tools={{
          togglePencil: noop,
          colorMode: false,
          colorTarget: 'cell',
          setColorTarget: noop,
          onSwitchShade: noop,
          eraseMode: false,
          toggleEraseMode: noop,
          highlightMode: false,
          toggleHighlightMode: noop,
          showMultiSelectButton: true,
          multi: false,
          toggleMulti: noop,
        }}
        history={{ undo: noop, redo: noop, canUndo: false, canRedo: false }}
        actions={{}}
        layout={{
          advancedModes: { ...DEFAULT_ADVANCED_MODES, candidateLayout },
          disabled: false,
          draft: false,
          inputSize: 210,
          panelHeight: 280,
          setPanelHeight: noop,
          beginResize: noop,
        }}
      />
    </div>
  )
  const [showHint, setShowHint] = useState(query.has('hint-detail'))
  const [hintIndex, setHintIndex] = useState(0)
  const hint = showHint ? (
    <PlayHint mobile={false}>
      <HintCard
        hint={{ title: 'WXYZ-Wing', text: '' }}
        navigation={{ index: hintIndex, count: 2, onMove: (offset) => setHintIndex((hintIndex + offset + 2) % 2) }}
        lesson={{ id: 'wxyz-wing', title: 'WXYZ-Wing' }}
        visuals={{ visible: true, onToggle: noop }}
        detailNavigation={{ first: false, last: true, onMove: noop }}
        action={{ label: 'Apply hint', onClick: noop }}
        explanation={Array(8).fill('The four wing cells have four possible digits between them. Compare their candidates to find the elimination.')}
        layoutAnchors={{ card: hintCard, body: hintBody, toolbar: hintToolbar }}
        onClose={() => setShowHint(false)}
      />
    </PlayHint>
  ) : query.has('hint') ? (
    <PlayHint mobile={false}>
      <section className="surface hint-card" style={{ minHeight: 130 }}>
        <h2>Hint</h2>
        <p>Compare the candidates in the highlighted row.</p>
      </section>
    </PlayHint>
  ) : undefined
  return (
    <PlayLayout
      desktop
      puzzle={puzzlePanel}
      input={inputPanel}
      hintLayout={hintLayout}
      hint={hint}
      mobile={{
        puzzleId: 'desktop-resize',
        rearranging: false,
        onRearrangingChange: noop,
        blocked: false,
        withHint: false,
        inputTitle: 'Input',
      }}
    />
  )
}

function Fixture() {
  const [enabled, setEnabled] = useState(true)
  const [mounted, setMounted] = useState(true)
  const [badge, setBadge] = useState<ModeBadgePosition>({ edge: 'right', offset: 0.6 })
  const pageRef = useRef<HTMLElement>(null)
  window.desktopResizeFixture = { setEnabled, setMounted, setBadge, candidates: center.reduce((total, mask) => total + mask.toString(2).replaceAll('0', '').length, 0) }
  return (
    mounted && (
      <Layout pageRef={pageRef} enabled={enabled} className="app-shell standard-mode">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-brand">
              <span className="wordmark">Sudoku</span>
            </div>
            <nav className="primary-navigation" aria-label="Primary navigation">
              <a href="#puzzles">Puzzles</a>
              <a href="#learn">Learn</a>
            </nav>
          </div>
        </header>
        <main ref={pageRef} id="sudoku-workspace" className="page standard-workspace-page" aria-label="Desktop resize fixture">
          <Workspace resizable={enabled}>
            <PlayContents badge={badge} setBadge={setBadge} />
          </Workspace>
        </main>
      </Layout>
    )
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
