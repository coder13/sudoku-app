import { useRef, useState, useSyncExternalStore, type ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { Worktable, type WorktableActions } from '../../src/components/Worktable'
import { DesktopPlayLayout, PlayWorkspace } from '../../src/components/DesktopPlayLayout'
import { useMobileLayout } from '../../src/components/mobile-layout'
import { DEFAULT_CELL_REFERENCE_STYLE } from '../../src/sudoku/hints'
import { DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES,
  DEFAULT_INPUT_SIZE, DEFAULT_WORKSPACE_MODE } from '../../src/sudoku/preferences'
import { starter } from './fixtures'
import { roomStore } from './story-room'

export const defaultWorktableStoryArgs = {
  game: starter, games: [starter], preferredDifficulty: 'easy', modalOpen: false, advancedModes: DEFAULT_ADVANCED_MODES,
  appearance: DEFAULT_APPEARANCE, highlighting: DEFAULT_HIGHLIGHT_PREFERENCES, errorMode: DEFAULT_ERROR_MODE,
  workspaceMode: DEFAULT_WORKSPACE_MODE,
  cellReferenceStyle: DEFAULT_CELL_REFERENCE_STYLE,
  multi: false, actionsRef: { current: null }, inputSize: DEFAULT_INPUT_SIZE, panelHeight: 280, setPanelHeight: fn(),
  beginResize: fn(), toggleMulti: fn(), onShare: fn(), onPublish: fn(), onCancelDraft: fn(), onStopPlaying: fn(),
  onNewPuzzle: fn(), onImportPuzzle: fn(),
  showLeftPanel: true, showRightPanel: true, showBottomPanel: true, onOpenHintPanel: fn(), onOpenRightPanel: fn(),
  puzzleBrowserView: 'active', setPuzzleBrowserView: fn(),
} satisfies ComponentProps<typeof Worktable>

export function WorktableExample({ withTopbar, resizable, ...args }: ComponentProps<typeof Worktable> & { withTopbar?: boolean; resizable?: boolean }) {
  const room = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot)
  const [height, setHeight] = useState(args.panelHeight)
  const [multi, setMulti] = useState(args.multi)
  const pageRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<WorktableActions | null>(null)
  const game = room.games.find(({ id }) => id === room.active) ?? args.game
  const mobile = useMobileLayout()
  const desktopResize = Boolean(resizable && !mobile)
  return <DesktopPlayLayout pageRef={pageRef} enabled={desktopResize} className={withTopbar ? 'story-app app-shell' : 'story-app worktable-story'}>
    {withTopbar && <header className="topbar"><div className="topbar-inner"><span className="wordmark">Sudoku</span></div></header>}
    <main ref={pageRef} id="sudoku-workspace" className="page standard-workspace-page" aria-label="Sudoku workspace"><PlayWorkspace resizable={desktopResize}>
      <Worktable {...args} key={`${game.id}-${game.source}`} game={game} games={room.games}
        actionsRef={actionsRef} panelHeight={height} setPanelHeight={setHeight} multi={multi}
        toggleMulti={() => setMulti((value) => !value)} />
    </PlayWorkspace></main>
  </DesktopPlayLayout>
}
