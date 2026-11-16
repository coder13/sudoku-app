import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Braces, Check, CheckCheck, ChevronRight, Lightbulb, ListFilter, MoreHorizontal, PencilLine, RotateCcw, Share2, X,
} from 'lucide-react'
import { Worktable, type WorktableActions } from '../../src/components/Worktable'
import { DEFAULT_CELL_REFERENCE_STYLE } from '../../src/sudoku/hints'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE,
  DEFAULT_WORKSPACE_MODE,
} from '../../src/sudoku/preferences'
import { inProgress } from '../support/fixtures'
import { roomStore, seedRoom } from '../support/story-room'

type Experiment = 'quick-action' | 'action-rail' | 'anchored-menu'

const overflowActions = [
  { label: 'Generate all candidates', icon: PencilLine },
  { label: 'Highlight {x,y} cells', icon: Braces },
  { label: 'View hint', icon: Lightbulb },
  { label: 'Analyze all moves', icon: ListFilter },
  { label: 'Share puzzle', icon: Share2 },
  { label: 'Check puzzle', icon: Check },
  { label: 'Reset puzzle', icon: RotateCcw },
]

function ActionList({ includeSingles, select }: { includeSingles?: boolean; select: (label: string) => void }) {
  const actions = includeSingles
    ? [{ label: 'Solve all singles', icon: CheckCheck }, ...overflowActions]
    : overflowActions
  return <>{actions.map(({ label, icon: Icon }, index) => <button type="button" key={label}
    className={includeSingles && index === 0 ? 'story-priority-action' : undefined}
    onClick={() => select(label)}><Icon size={18} aria-hidden="true" /><span>{label}</span>
    {includeSingles && index === 0 && <ChevronRight size={17} aria-hidden="true" />}</button>)}</>
}

function ExperimentActions({ experiment, open, setOpen, select }: {
  experiment: Experiment
  open: boolean
  setOpen: (open: boolean) => void
  select: (label: string) => void
}) {
  return <div className="story-puzzle-action-set">
    {experiment === 'quick-action' && <button type="button" className="button soft story-solve-singles"
      onClick={() => select('Solve all singles')}><CheckCheck size={17} aria-hidden="true" /> Solve all singles</button>}
    <button type="button" className="icon-button borderless puzzle-menu-trigger" aria-label="Open puzzle actions"
      aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={20} aria-hidden="true" /></button>
    {experiment === 'action-rail' && open && <div className="story-action-rail" aria-label="Quick puzzle actions">
      <button type="button" onClick={() => select('Solve all singles')}><CheckCheck size={18} aria-hidden="true" /><span>Solve singles</span></button>
      <button type="button" onClick={() => select('Generate all candidates')}><PencilLine size={18} aria-hidden="true" /><span>Candidates</span></button>
      <button type="button" onClick={() => select('View hint')}><Lightbulb size={18} aria-hidden="true" /><span>Hint</span></button>
      <button type="button" onClick={() => setOpen(false)}><MoreHorizontal size={18} aria-hidden="true" /><span>More</span></button>
    </div>}
    {experiment === 'anchored-menu' && open && <div className="app-menu puzzle-menu story-anchored-menu" role="group" aria-label="Puzzle actions">
      <ActionList includeSingles select={select} />
    </div>}
  </div>
}

function MobilePuzzleActions({ experiment }: { experiment: Experiment }) {
  const room = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot)
  const game = room.games.find(({ id }) => id === room.active) ?? inProgress
  const hostRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<WorktableActions | null>(null)
  const [actionsTarget, setActionsTarget] = useState<Element | null>(null)
  const [open, setOpen] = useState(experiment !== 'quick-action')
  const [selection, setSelection] = useState('')
  const [panelHeight, setPanelHeight] = useState(280)

  useEffect(() => {
    setActionsTarget(hostRef.current?.querySelector('.puzzle-actions') ?? null)
  }, [game.id, experiment])

  function select(label: string) {
    setSelection(`${label} selected`)
    setOpen(false)
  }

  return <div className={`story-app mobile-action-worktable experiment-mode-${experiment}`} ref={hostRef}>
    <main className="page standard-workspace-page" aria-label="Sudoku workspace"><div className="workspace">
      <Worktable game={game} games={room.games} preferredDifficulty="easy" modalOpen={false}
        advancedModes={DEFAULT_ADVANCED_MODES} appearance={DEFAULT_APPEARANCE}
        highlighting={DEFAULT_HIGHLIGHT_PREFERENCES} errorMode={DEFAULT_ERROR_MODE}
        cellReferenceStyle={DEFAULT_CELL_REFERENCE_STYLE} workspaceMode={DEFAULT_WORKSPACE_MODE}
        multi={false} actionsRef={actionsRef} inputSize={DEFAULT_INPUT_SIZE} panelHeight={panelHeight}
        setPanelHeight={setPanelHeight} beginResize={() => {}} toggleMulti={() => {}}
        onDifficultyChange={() => {}} onShare={() => {}} onPublish={() => {}} onCancelDraft={() => {}}
        onNewPuzzle={() => {}} onCreatePuzzle={() => {}} onEditPuzzle={() => {}}
        showLeftPanel showRightPanel showBottomPanel onOpenHintPanel={() => {}}
        puzzleBrowserView="active" setPuzzleBrowserView={() => {}} />
    </div></main>
    {actionsTarget && createPortal(<ExperimentActions experiment={experiment} open={open} setOpen={setOpen} select={select} />, actionsTarget)}
    {experiment === 'quick-action' && open && <div className="story-action-sheet-backdrop" onClick={() => setOpen(false)}>
      <section className="story-action-sheet" aria-label="Other puzzle actions" onClick={(event) => event.stopPropagation()}>
        <header><strong>Other puzzle actions</strong><button type="button" className="icon-button borderless" aria-label="Close"
          onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button></header>
        <ActionList select={select} />
      </section>
    </div>}
    <p className="sr-only" role="status">{selection}</p>
  </div>
}

const meta = {
  title: 'Large/Play/Mobile puzzle actions experiments',
  component: MobilePuzzleActions,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => { seedRoom([inProgress]) },
} satisfies Meta<typeof MobilePuzzleActions>

export default meta
type Story = StoryObj<typeof meta>

export const QuickActionBesideMenu: Story = { args: { experiment: 'quick-action' } }
export const ExpandableActionRail: Story = { args: { experiment: 'action-rail' } }
export const AnchoredPriorityMenu: Story = { args: { experiment: 'anchored-menu' } }
