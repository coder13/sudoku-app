import { useRef, useState, useSyncExternalStore } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { Worktable, type WorktableActions } from '../../src/components/Worktable'
import { DEFAULT_CELL_REFERENCE_STYLE } from '../../src/sudoku/hints'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE,
  DEFAULT_WORKSPACE_MODE,
} from '../../src/sudoku/preferences'
import { inProgress } from '../support/fixtures'
import { roomStore, seedRoom } from '../support/story-room'

function MobilePuzzleDropdown() {
  const room = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot)
  const game = room.games.find(({ id }) => id === room.active) ?? inProgress
  const actionsRef = useRef<WorktableActions | null>(null)
  const [panelHeight, setPanelHeight] = useState(280)

  return <div className="story-app mobile-action-worktable">
    <main className="page standard-workspace-page" aria-label="Sudoku workspace"><div className="workspace">
      <Worktable game={game} games={room.games} preferredDifficulty="easy" modalOpen={false}
        advancedModes={DEFAULT_ADVANCED_MODES} appearance={DEFAULT_APPEARANCE}
        highlighting={DEFAULT_HIGHLIGHT_PREFERENCES} errorMode={DEFAULT_ERROR_MODE}
        cellReferenceStyle={DEFAULT_CELL_REFERENCE_STYLE} workspaceMode={DEFAULT_WORKSPACE_MODE}
        multi={false} actionsRef={actionsRef} inputSize={DEFAULT_INPUT_SIZE} panelHeight={panelHeight}
        setPanelHeight={setPanelHeight} beginResize={() => {}} toggleMulti={() => {}}
        onShare={() => {}} onPublish={() => {}} onCancelDraft={() => {}} onStopPlaying={() => {}}
        onNewPuzzle={() => {}} onImportPuzzle={() => {}}
        showLeftPanel showRightPanel showBottomPanel onOpenHintPanel={() => {}} onOpenRightPanel={() => {}}
        puzzleBrowserView="active" setPuzzleBrowserView={() => {}} />
    </div></main>
  </div>
}

const meta = {
  title: 'Large/Play/Mobile puzzle actions',
  component: MobilePuzzleDropdown,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => { seedRoom([inProgress]) },
} satisfies Meta<typeof MobilePuzzleDropdown>

export default meta
type Story = StoryObj<typeof meta>

export const ActionsSheet: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Actions' }))
  },
}

export const PuzzleOptionsMenu: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = await canvas.findByRole('button', { name: 'Open puzzle options' })
    await userEvent.click(trigger)
    const stop = await canvas.findByRole('button', { name: 'Stop playing' })
    await expect(canvas.queryByRole('button', { name: /Change puzzle/ })).not.toBeInTheDocument()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.queryByRole('dialog', { name: 'Puzzle options' })).toBeNull()
    await waitFor(() => {
      const { left, top, width, height } = stop.getBoundingClientRect()
      expect(stop.contains(stop.ownerDocument.elementFromPoint(left + width / 2, top + height / 2))).toBe(true)
    })
  },
}
