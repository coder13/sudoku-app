import { useRef, useState, useSyncExternalStore, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, waitFor, within } from 'storybook/test'
import { Worktable, type WorktableActions } from '../../src/components/Worktable'
import { EMPTY, makeGame, paintCells, replaceCandidates } from '../../src/sudoku/game'
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
    beginResize: fn(), toggleMulti: fn(), onShare: fn(), onPublish: fn(), onCancelDraft: fn(), onStopPlaying: fn(),
    onNewPuzzle: fn(), onCreatePuzzle: fn(), onEditPuzzle: fn(),
    showLeftPanel: true, showRightPanel: true, showBottomPanel: true, onOpenHintPanel: fn(), onOpenRightPanel: fn(),
    puzzleBrowserView: 'active', setPuzzleBrowserView: fn(),
  },
  beforeEach: ({ args }) => { seedRoom([args.game, ...args.games.filter(({ id }) => id !== args.game.id)]) },
  render: (args) => <WorktableExample {...args} />,
} satisfies Meta<typeof Worktable>
export default meta
type Story = StoryObj<typeof meta>

export const Starter: Story = {}
export const MobileInputTools: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (!canvasElement.querySelector('.mobile-panel-layout')) return
    await userEvent.click(canvas.getByRole('button', { name: 'Open puzzle options' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Colors & Chains' }))
    const tabs = canvas.getByRole('tablist', { name: 'Sudoku input' })
    await expect(within(tabs).getByRole('tab', { name: 'Colors' })).toHaveAttribute('aria-selected', 'true')
    await expect(within(tabs).getByRole('tab', { name: 'Chains' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Close colors panel' }))
    await expect(within(tabs).getByRole('tab', { name: 'Digits' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    await expect(tabs).not.toBeInTheDocument()
  },
}
export const TemporaryPencil: Story = {
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3,/ })
    await userEvent.click(canvas.getByRole('button', { name: /^Select 4$/ }))
    await userEvent.keyboard('{Meta>}')
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName(/empty, candidates 4/)
    await userEvent.keyboard('{/Meta}')
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.keyboard('{Control>}')
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    await userEvent.keyboard('{/Control}')
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
  },
}
export const PenDigitToggle: Story = {
  play: async ({ canvas, userEvent }) => {
    const digit = canvas.getByRole('button', { name: /^Select 1$/ })
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 8,/ })
    await userEvent.click(digit)
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName('Row 1, column 8, digit 1')
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName('Row 1, column 8, empty')
    await expect(canvas.getByRole('button', { name: /^Deselect 1$/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(cell).toHaveAccessibleName('Row 1, column 8, digit 1')
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName('Row 1, column 8, empty')
  },
}
const rapidTapMasks = Array<number>(81).fill(0)
rapidTapMasks[2] = (1 << 3) | (1 << 4)
rapidTapMasks[40] = 1 << 4
export const PencilCandidatePreview: Story = {
  args: { game: replaceCandidates(starter, rapidTapMasks, { recordHistory: false }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select 4' }))
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    const removal = canvas.getByRole('gridcell', { name: 'Row 1, column 3, empty, candidates 4 5' })
    const addition = canvas.getByRole('gridcell', { name: 'Row 1, column 4, empty' })
    for (const [cell, description] of [[removal, 'Remove candidate 4'], [addition, 'Add candidate 4']] as const) {
      const { x, y, width, height } = cell.getBoundingClientRect()
      fireEvent.pointerMove(grid, { pointerType: 'mouse', clientX: x + width / 2, clientY: y + height / 2 })
      await expect(cell).toHaveAccessibleDescription(description)
    }
    for (const key of ['Meta', 'Control']) {
      await userEvent.keyboard(`{${key}>}`)
      await expect(grid).toHaveAccessibleDescription('Pencil mode')
      await expect(addition).toHaveAccessibleDescription('Add candidate 4')
      await userEvent.keyboard(`{/${key}}`)
      await expect(grid).toHaveAccessibleDescription('Pencil mode')
      await expect(addition).toHaveAccessibleDescription('Add candidate 4')
    }
    await expect(removal).toHaveAccessibleName(/^Row 1, column 3, empty, candidates 4 5(?:, cell highlighted for candidate 4)?$/)
    await expect(addition).toHaveAccessibleName('Row 1, column 4, empty')
    fireEvent.pointerMove(grid, { pointerType: 'mouse', clientX: 0, clientY: 0 })
  },
}
export const RapidPencilTaps: Story = {
  args: { game: replaceCandidates(starter, rapidTapMasks, { recordHistory: false }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select 4' }))
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })
    fireEvent.click(cell, { detail: 1 })
    await expect(cell).toHaveAccessibleName(/empty, candidates 5/)
    fireEvent.click(cell, { detail: 2 })
    fireEvent.doubleClick(cell, { detail: 2 })
    await expect(cell).toHaveAccessibleName(/empty, candidates 4 5/)
    fireEvent.click(cell, { detail: 3 })
    await expect(cell).toHaveAccessibleName(/empty, candidates 5/)
  },
}
export const DoubleClickSingle: Story = {
  args: { game: replaceCandidates(starter, rapidTapMasks, { recordHistory: false }) },
  play: async ({ canvas, userEvent }) => {
    const cell = canvas.getByRole('gridcell', { name: /^Row 5, column 5, empty/ })
    await userEvent.dblClick(cell)
    await expect(cell).toHaveAccessibleName(/digit 5/)
  },
}
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
export const OpenOnAnotherDevice: Story = { args: { game: inProgress, games: [inProgress], sharedOnOtherDevice: true } }
export const CatchUpOnAnotherDevice: Story = {
  args: { game: solved, games: [solved, inProgress], catchUpPuzzle: inProgress },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Catch up/ })).toBeVisible()
  },
}
export const GridModeCue: Story = {
  args: { game: inProgress, games: [inProgress] },
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    const highlight = canvas.getByRole('button', { name: 'Highlight mode' })
    await userEvent.click(highlight)
    await expect(grid).toHaveAccessibleDescription('Highlight mode')
    await userEvent.click(highlight)
    await expect(grid).toHaveAccessibleDescription('Pen mode')
  },
}
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

    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    grid.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
    await userEvent.keyboard(' ')
    await canvas.findByRole('status', { name: 'Puzzle paused' })
    await userEvent.keyboard(' ')
    await canvas.findByRole('grid', { name: 'Sudoku grid' })
  },
}
export const LargeGridText: Story = { args: { appearance: { ...DEFAULT_APPEARANCE, gridTextScale: MAX_GRID_TEXT_SCALE } } }
export const Draft: Story = { args: { game: namedDraft, games: [namedDraft] } }
export const Solved: Story = {
  args: { game: solved, games: [solved] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (canvasElement.querySelector('.mobile-panel-layout')) return
    const toggle = canvas.getByRole('button', { name: 'View grid' })
    const card = toggle.closest('.puzzle')!
    const stage = card.querySelector('.puzzle-stage')!
    const timer = canvas.getByRole('timer')
    const layout = () => [card, stage, toggle, timer].map(element => element.getBoundingClientRect().toJSON())
    await canvasElement.ownerDocument.fonts.ready
    const before = layout()

    await userEvent.click(toggle)
    await expect(toggle).toHaveAccessibleName('View results')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toBeVisible()
    await expect(layout()).toEqual(before)

    await userEvent.keyboard(' ')
    await expect(toggle).toHaveAccessibleName('View grid')
    await expect(canvas.getByRole('heading', { name: 'Puzzle solved' })).toBeVisible()
    await expect(layout()).toEqual(before)
  },
}

export const SolvedMobile: Story = {
  args: { ...Solved.args, appearance: { ...DEFAULT_APPEARANCE, showGuides: false } },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (!canvasElement.querySelector('.mobile-panel-layout')) return
    const toggle = canvas.getByRole('button', { name: 'View grid' })
    const stage = canvasElement.ownerDocument.getElementById(toggle.getAttribute('aria-controls')!)!
    const controls = canvasElement.querySelector('.workspace-controls')!
    const actions = canvas.getByRole('region', { name: 'Next puzzle options' })
    const results = canvas.getByRole('region', { name: 'Solve details' })
    const bounds = (element: Element) => element.getBoundingClientRect().toJSON()
    const layout = () => [toggle, stage, controls].map(bounds)
    const before = layout()
    await expect(bounds(actions)).toEqual(bounds(controls))
    await expect(within(actions).getByRole('button', { name: 'Next easy puzzle' })).toBeVisible()
    await userEvent.click(within(results).getByText('Action history'))
    await expect(layout()).toEqual(before)

    toggle.focus({ preventScroll: true })
    await userEvent.keyboard('{Enter}')
    await expect(toggle).toHaveAccessibleName('View results')
    await expect(toggle).toHaveFocus()
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toBeVisible()
    await expect(actions).not.toBeVisible()
    await expect(layout()).toEqual(before)

    await userEvent.keyboard('{Enter}')
    await expect(toggle).toHaveAccessibleName('View grid')
    await expect(toggle).toHaveFocus()
    await expect(results).toBeVisible()
    await expect(layout()).toEqual(before)

    await userEvent.click(toggle)
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })).toBeVisible()
    await expect(toggle).toHaveAccessibleName('View results')
    const original = roomStore.getSnapshot().games.find(game => game.id === solved.id)
    expect(original?.position).toEqual(solved.position)
    expect(original?.elapsed).toBe(solved.elapsed)
    await userEvent.click(toggle)
    await expect(within(results).getByText('06:27')).toBeVisible()
  },
}

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
  args: { game: paintCells(starter, [{ cell: 2, color: 1 }]) },
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
    const outcomeText = /Place [1-9] in|Remove [1-9] from|Remove candidates/
    await canvas.findByRole('button', { name: 'Show digits' })
    await expect(within(hint).queryByRole('button', { name: 'Hint visuals' })).not.toBeInTheDocument()
    await expect(hint).not.toHaveTextContent(outcomeText)
    await expect(hint).not.toHaveTextContent(/Look for digit/)
    await expect(canvas.getByRole('group', { name: 'Hint navigation' })).toHaveTextContent('1/10')
    await userEvent.click(canvas.getByRole('button', { name: 'Show digits' }))
    await expect(hint).toHaveTextContent(/Look for digit/)
    await expect(hint).not.toHaveTextContent(outcomeText)
    await expect(hint).not.toHaveTextContent(/Look in/)
    await userEvent.click(canvas.getByRole('button', { name: 'Show location' }))
    await expect(hint).toHaveTextContent(/Look in|Look at the highlighted cells/)
    await expect(hint).not.toHaveTextContent(outcomeText)
    const coloredCell = canvas.getByRole('gridcell', { name: /^Row 1, column 3,/ })
    const visuals = within(hint).getByRole('button', { name: 'Hint visuals' })
    await expect(visuals).toHaveAttribute('aria-pressed', 'true')
    await expect(coloredCell).not.toHaveClass('color-1')
    await userEvent.click(visuals)
    await expect(visuals).toHaveAttribute('aria-pressed', 'false')
    await expect(coloredCell).toHaveClass('color-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Show explanation' }))
    await expect(visuals).toHaveAttribute('aria-pressed', 'false')
    await expect(hint).toHaveTextContent(outcomeText)
    await expect(canvas.getByRole('button', { name: 'Apply hint' })).toBeVisible()
    await userEvent.click(visuals)
    await expect(visuals).toHaveAttribute('aria-pressed', 'true')
    await expect(coloredCell).not.toHaveClass('color-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Next hint' }))
    await expect(canvas.getByRole('button', { name: 'Show digits' })).toBeVisible()
    await expect(visuals).not.toBeInTheDocument()
    await expect(hint).not.toHaveTextContent(outcomeText)
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
  const actionsRef = useRef<WorktableActions | null>(null)
  const game = room.games.find(({ id }) => id === room.active) ?? args.game
  return <div className="story-app worktable-story">
    <main className="page standard-workspace-page" aria-label="Sudoku workspace"><div className="workspace">
      <Worktable {...args} key={`${game.id}-${game.source}`} game={game} games={room.games}
        actionsRef={actionsRef} panelHeight={height} setPanelHeight={setHeight} multi={multi}
        toggleMulti={() => setMulti((value) => !value)} />
    </div></main>
  </div>
}
