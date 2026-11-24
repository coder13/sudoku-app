import { createRoot } from 'react-dom/client'
import { useRef, useState } from 'react'
import { Board } from '../../../src/components/Board'
import { Controls } from '../../../src/components/Controls'
import { MobileInputTabs } from '../../../src/components/MobileInputTabs'
import { MobilePanelLayout } from '../../../src/components/MobilePanelLayout'
import { MobilePanelLayout as BaselineMobilePanelLayout } from 'virtual:resize-baseline'
import { ModeBadge } from '../../../src/components/ModeBadge'
import { usePuzzleZoom } from '../../../src/components/usePuzzleZoom'
import { DEFAULT_ADVANCED_MODES } from '../../../src/sudoku/preferences'
import type { VariantPuzzle } from '../../../src/sudoku/engine'
import '@fontsource-variable/dm-sans/wght.css'

await (new URLSearchParams(location.search).has('baseline')
  ? import('virtual:resize-legacy.css') : import('../../../src/styles.css'))

const empty = '0'.repeat(81)
const position = { center: Array(81).fill(511), corner: Array(81).fill(0), colors: Array(81).fill(0) }
const noop = () => {}
const badgePosition = { edge: 'bottom', offset: .6 } as const
const withHint = new URLSearchParams(location.search).has('hint')
const outsidePuzzle: VariantPuzzle | undefined = new URLSearchParams(location.search).has('outside') ? {
  version: 1, givens: empty, rules: [
    { type: 'sandwich', direction: 'south', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72], sum: 15 },
    { type: 'x-sum', direction: 'east', cells: [36, 37, 38, 39, 40, 41, 42, 43, 44], sum: 20 },
    { type: 'skyscrapers', direction: 'east', cells: [36, 37, 38, 39, 40, 41, 42, 43, 44], count: 4 },
    { type: 'little-killer', direction: 'south-east', cells: [0, 10, 20, 30, 40, 50, 60, 70, 80], sum: 45 },
  ],
} : undefined
const PanelLayout = new URLSearchParams(location.search).has('baseline') ? BaselineMobilePanelLayout : MobilePanelLayout
Object.assign(window, { resizeCommits: [], puzzleGestureCommits: [] })

function Fixture() {
  const [savedHeight, setSavedHeight] = useState<number>()
  const [puzzlePosition, setPuzzlePosition] = useState({ space: 0, shrink: 0 })
  const boundary = useRef<HTMLDivElement>(null)
  const zoom = usePuzzleZoom(true, 'resize-regression', noop)
  const controls = <div className="workspace-controls"><Controls
    mode="value" pencil={false} togglePencil={noop} candidateKind="center" setCandidateKind={noop}
    advancedModes={DEFAULT_ADVANCED_MODES} colorMode={false} colorTarget="cell" setColorTarget={noop}
    onSwitchShade={noop} eraseMode={false} toggleEraseMode={noop} highlightMode={false} toggleHighlightMode={noop}
    selectedDigit={null} hasCellSelection={false} values={empty} input={noop} undo={noop} redo={noop}
    compact canUndo={false} canRedo={false} disabled={false} draft={false}
    inputSize={210} panelHeight={280} setPanelHeight={noop} beginResize={noop} multi={false} toggleMulti={noop} />
  </div>
  return <div className="app-shell">
    <div style={{ height: 'var(--topbar-height)' }} />
    <main className="page standard-workspace-page" aria-label="Mobile resize fixture">
      <div className="workspace"><PanelLayout puzzleId="resize-regression" rearranging={false}
        onRearrangingChange={noop} blocked={false} withHint={withHint} resizableInput savedInputHeight={savedHeight}
        puzzleTopSpace={puzzlePosition.space} puzzleShrink={puzzlePosition.shrink}
        onPuzzleTopSpaceChange={(space, shrink) => {
          (window as unknown as { puzzleGestureCommits: { space: number; shrink: number }[] }).puzzleGestureCommits.push({ space, shrink })
          setPuzzlePosition({ space, shrink })
        }}
        onInputHeightChange={height => {
          (window as unknown as { resizeCommits: (number | undefined)[] }).resizeCommits.push(height)
          setSavedHeight(height)
        }} panels={{
          puzzle: { title: 'Puzzle', content: <div className="puzzle-column" data-reserve-badge-space>
            <section className="puzzle puzzle-flat" aria-label="Dense candidate puzzle">
              <div className="puzzle-metadata"><span className="puzzle-difficulty">Hard</span><span className="duration-counter">12:34</span></div>
              <div className="puzzle-actions"><button className="puzzle-menu-trigger icon-button" aria-label="Puzzle options">⋯</button></div>
              <div className="puzzle-stage"><div className="puzzle-zoom" {...zoom.viewportProps}><div className="puzzle-zoom-content" ref={zoom.content}>
                <Board givens={empty} values={empty} position={position} variantPuzzle={outsidePuzzle} showGuides onCell={noop}
                  modeBorder="pencil" modeBoundaryRef={boundary}
                  modeBadge={<ModeBadge mode="pencil" descriptionId="resize-mode" cardRef={boundary}
                    position={badgePosition} onPosition={noop} onActivate={noop} boundaryLabel="Sudoku grid" />} />
              </div></div></div>
              <nav className="puzzle-quick-actions" aria-label="Pinned puzzle actions">
                <button className="button">Hint</button><button className="button">Undo</button><button className="button">Redo</button>
              </nav>
            </section>
          </div> },
          input: { title: 'Input', content: <MobileInputTabs active="digits" open={[]} activeTabRef={null}
            toolsDisabled={false} toolToggles={<button className="button">Settings</button>} onSelect={noop} onClose={noop}
            panels={{ digits: controls, solution: null, techniques: null, colors: null, chains: null, subsets: null }} /> },
          ...(withHint ? { hint: { title: 'Hint', content: <div className="mobile-hint-panel" style={{ height: 130 }}>Hint panel</div> } } : {}),
        }} /></div>
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
