import { useRef, useState, useSyncExternalStore, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, waitFor } from 'storybook/test'
import { Worktable, type WorktableActions } from '../../src/components/Worktable'
import { EMPTY, makeGame } from '../../src/sudoku/game'
import { DEFAULT_CELL_REFERENCE_STYLE } from '../../src/sudoku/hints'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE,
  DEFAULT_WORKSPACE_MODE, MAX_GRID_TEXT_SCALE,
} from '../../src/sudoku/preferences'
import { inProgress, namedDraft, solved, starter } from '../support/fixtures'
import { roomStore, seedRoom } from '../support/story-room'

const meta = {
  title: 'Large/Play/Worktable',
  component: Worktable,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    game: starter, games: [starter], preferredDifficulty: 'easy', modalOpen: false, advancedModes: DEFAULT_ADVANCED_MODES,
    appearance: DEFAULT_APPEARANCE, highlighting: DEFAULT_HIGHLIGHT_PREFERENCES, errorMode: DEFAULT_ERROR_MODE,
    workspaceMode: DEFAULT_WORKSPACE_MODE,
    cellReferenceStyle: DEFAULT_CELL_REFERENCE_STYLE,
    multi: false, actionsRef: { current: null }, inputSize: DEFAULT_INPUT_SIZE, panelHeight: 280, setPanelHeight: fn(),
    beginResize: fn(), toggleMulti: fn(), onDifficultyChange: fn(), onShare: fn(), onPublish: fn(), onCancelDraft: fn(), onStopPlaying: fn(),
    onNewPuzzle: fn(), onCreatePuzzle: fn(), onEditPuzzle: fn(),
    showLeftPanel: true, showRightPanel: true, showBottomPanel: true, onOpenHintPanel: fn(),
    puzzleBrowserView: 'active', setPuzzleBrowserView: fn(),
  },
  beforeEach: ({ args }) => { seedRoom([args.game, ...args.games.filter(({ id }) => id !== args.game.id)]) },
  render: (args) => <WorktableExample {...args} />,
} satisfies Meta<typeof Worktable>
export default meta
type Story = StoryObj<typeof meta>

export const Starter: Story = {}
export const Generating: Story = {
  args: {
    game: { ...makeGame('generating', 'New puzzle', EMPTY, 'draft', 0), paused: true, difficulty: 'easy', score: 0 },
    games: [],
    placeholder: <div role="status"><h2>Generating a puzzle…</h2></div>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Generating a puzzle…')
    await expect(canvas.getByRole('button', { name: 'Select 1' })).toBeDisabled()
  },
}
export const ClickAwayClearsCell: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })
    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 4' }))
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvasElement.querySelector('.puzzle-actions')!)
    await expect(cell).toHaveAttribute('aria-selected', 'false')
    await userEvent.click(cell)
    await userEvent.click(canvasElement)
    await expect(cell).toHaveAttribute('aria-selected', 'false')
  },
}
export const InProgress: Story = { args: { game: inProgress, games: [inProgress] } }
export const Paused: Story = {
  args: {
    game: { ...inProgress, paused: true }, games: [{ ...inProgress, paused: true }],
    appearance: { ...DEFAULT_APPEARANCE, showGuides: true },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const stage = canvasElement.querySelector<HTMLElement>('.puzzle-stage')!
    const puzzle = canvasElement.querySelector<HTMLElement>('.puzzle')!
    const stageBefore = stage.getBoundingClientRect()
    const puzzleBefore = puzzle.getBoundingClientRect()

    await userEvent.click(canvas.getAllByRole('button', { name: 'Resume puzzle' }).at(-1)!)
    await canvas.findByRole('grid', { name: 'Sudoku grid' })

    const stageAfter = stage.getBoundingClientRect()
    const puzzleAfter = puzzle.getBoundingClientRect()
    expect(stageAfter.width).toBeCloseTo(stageBefore.width, 2)
    expect(stageAfter.height).toBeCloseTo(stageBefore.height, 2)
    expect(puzzleAfter.width).toBeCloseTo(puzzleBefore.width, 2)
    expect(puzzleAfter.height).toBeCloseTo(puzzleBefore.height, 2)

    await userEvent.click(canvas.getByRole('button', { name: 'Pause puzzle' }))
    await canvas.findByRole('status', { name: 'Puzzle paused' })
  },
}
export const LargeGridText: Story = { args: { appearance: { ...DEFAULT_APPEARANCE, gridTextScale: MAX_GRID_TEXT_SCALE } } }
export const Draft: Story = { args: { game: namedDraft, games: [namedDraft] } }
export const Solved: Story = { args: { game: solved, games: [solved] } }
export const CandidateShortcut: Story = {
  play: async ({ canvas, userEvent }) => {
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })
    cell.focus()
    await expect(cell).toHaveAttribute('aria-selected', 'false')
    await userEvent.keyboard('{Meta>}4{/Meta}')
    await expect(cell).toHaveAccessibleName('Row 1, column 3, empty, candidates 4')
    await userEvent.click(cell)
    await userEvent.keyboard('{Control>}4{/Control}')
    await expect(cell).toHaveAccessibleName('Row 1, column 3, empty')
    fireEvent.keyDown(cell, { key: "'", code: 'Digit4', metaKey: true })
    await expect(cell).toHaveAccessibleName('Row 1, column 3, empty, candidates 4')
  },
}
export const HintWithGrid: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    const viewHint = await canvas.findByRole('button', { name: 'View hint' })
    await waitFor(() => {
      const { left, top, width, height } = viewHint.getBoundingClientRect()
      const hit = viewHint.ownerDocument.elementFromPoint(left + width / 2, top + height / 2)
      expect(viewHint.contains(hit)).toBe(true)
    })
    await userEvent.click(viewHint)
    const hint = await canvas.findByRole('complementary', { name: 'Puzzle hint' }, { timeout: 5000 })
    await canvas.findByRole('button', { name: 'Show digits' })
    await expect(hint).not.toHaveTextContent(/Place digit|Remove digit|Look for digit/)
    await expect(canvas.getByRole('group', { name: 'Hint navigation' })).toHaveTextContent('1/10')
    await userEvent.click(canvas.getByRole('button', { name: 'Show digits' }))
    await expect(hint).toHaveTextContent(/Look for digit/)
    await expect(hint).not.toHaveTextContent(/Look in|Place digit|Remove digit/)
    await userEvent.click(canvas.getByRole('button', { name: 'Show location' }))
    await expect(hint).toHaveTextContent(/Look in|Look at the highlighted cells/)
    await expect(hint).not.toHaveTextContent(/Place digit|Remove digit/)
    await userEvent.click(canvas.getByRole('button', { name: 'Show explanation' }))
    await expect(hint).toHaveTextContent(/Place digit|Remove digit/)
    await expect(canvas.getByRole('button', { name: 'Apply hint' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Next hint' }))
    await expect(canvas.getByRole('button', { name: 'Show digits' })).toBeVisible()
    await expect(hint).not.toHaveTextContent(/Place digit|Remove digit/)
  },
}

export const AnalyzeMoves: Story = {
  args: { workspaceMode: 'advanced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Analyze all moves' }))
    const navigation = await canvas.findByRole('group', { name: 'Hint navigation' }, { timeout: 5000 })
    const count = Number(navigation.textContent?.split('/')[1])
    await expect(count).toBeGreaterThan(10)
    await userEvent.click(canvas.getByRole('button', { name: 'Next hint' }))
    await expect(navigation).toHaveTextContent(`2/${count}`)
  },
}

function WorktableExample(args: ComponentProps<typeof Worktable>) {
  const room = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot)
  const [height, setHeight] = useState(args.panelHeight)
  const [multi, setMulti] = useState(args.multi)
  const [difficulty, setDifficulty] = useState(args.preferredDifficulty)
  const actionsRef = useRef<WorktableActions | null>(null)
  const game = room.games.find(({ id }) => id === room.active) ?? args.game
  return <div className="story-app worktable-story">
    <main className="page standard-workspace-page" aria-label="Sudoku workspace"><div className="workspace">
      <Worktable {...args} key={`${game.id}-${game.source}`} game={game} games={room.games} preferredDifficulty={difficulty}
        actionsRef={actionsRef} panelHeight={height} setPanelHeight={setHeight} multi={multi}
        toggleMulti={() => setMulti((value) => !value)} onDifficultyChange={setDifficulty} />
    </div></main>
  </div>
}
