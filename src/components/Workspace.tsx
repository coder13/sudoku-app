import { Link, useMatch, useNavigate } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDownToLine, BookOpen, Check, Grid3X3, Menu, Minus, PanelBottom, PanelLeft, PanelRight, PanelsTopLeft, Play, Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { DEFAULT_DIFFICULTY } from '../sudoku/difficulty'
import type { Difficulty } from '../sudoku/engine'
import { parsePuzzle } from '../sudoku/formats'
import { createGameId, EMPTY, makeGame, type ErrorMode } from '../sudoku/game'
import { DEFAULT_CELL_REFERENCE_STYLE, type CellReferenceStyle } from '../sudoku/hints'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_INPUT_SIZE, INPUT_SIZE_STEP, MAX_INPUT_SIZE,
  MIN_INPUT_SIZE, readPanelHeight, readPreferences, saveAdvancedModes, saveAppearance, saveCellReferenceStyle, saveDifficulty, saveErrorMode,
  saveHighlightPreferences, saveInputSize, savePanelHeight, saveWorkspaceMode, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_WORKSPACE_MODE,
  type AdvancedModes, type AppearancePreferences, type HighlightPreferences, type WorkspaceMode,
} from '../sudoku/preferences'
import { roomStore } from '../sudoku/storage'
import { ImportPuzzle, NewPuzzle, openPuzzle, SavePuzzle, SharePuzzle } from './PuzzleDialogs'
import type { PuzzleBrowserView } from './AdvancedPuzzleBrowser'
import { PuzzlesPage } from './PuzzlesPage'
import { isSettingsSection, Settings } from './Settings'
import { usePageAppearance } from './usePageAppearance'
import { usePuzzleGeneration } from './usePuzzleGeneration'
import { Worktable, type WorktableActions } from './Worktable'

type Panel = 'new' | 'import' | 'share' | 'publish' | null
type AdvancedPanelVisibility = { left: boolean; right: boolean; bottom: boolean; articles: boolean }
const ADVANCED_PANEL_VISIBILITY_KEY = 'sudoku-app:v1:advanced-panel-visibility'
const DEFAULT_ADVANCED_PANEL_VISIBILITY: AdvancedPanelVisibility = { left: true, right: true, bottom: true, articles: true }

function readAdvancedPanelVisibility() {
  try {
    const value = JSON.parse(localStorage.getItem(ADVANCED_PANEL_VISIBILITY_KEY) ?? '') as Partial<AdvancedPanelVisibility>
    return {
      left: typeof value.left === 'boolean' ? value.left : true,
      right: typeof value.right === 'boolean' ? value.right : true,
      bottom: typeof value.bottom === 'boolean' ? value.bottom : true,
      articles: typeof value.articles === 'boolean' ? value.articles : true,
    }
  } catch { return DEFAULT_ADVANCED_PANEL_VISIBILITY }
}

function saveAdvancedPanelVisibility(value: AdvancedPanelVisibility) {
  try { localStorage.setItem(ADVANCED_PANEL_VISIBILITY_KEY, JSON.stringify(value)) }
  catch { /* Panel visibility remains active for this session. */ }
}

const PlayContent = createContext<ReactNode>(null)
type PuzzlesContentValue = {
  games: ReturnType<typeof roomStore.getSnapshot>['games']
  active: string | null
  difficulty: Difficulty
  setDifficulty: (difficulty: Difficulty) => void
}
const PuzzlesContent = createContext<PuzzlesContentValue | null>(null)

export function Workspace() {
  return useContext(PlayContent)
}

export function PuzzlesWorkspace() {
  const content = useContext(PuzzlesContent)
  return content ? <PuzzlesPage {...content} /> : null
}

export function SudokuShell({ children }: { children: ReactNode }) {
  const settingsRoute = Boolean(useMatch({ from: '/settings', shouldThrow: false }))
  const playing = Boolean(useMatch({ from: '/', shouldThrow: false })) || settingsRoute
  const learning = Boolean(useMatch({ from: '/learn', shouldThrow: false }))
  const settingsParam = useMatch({ from: '/settings/$section', shouldThrow: false, select: ({ params }) => params.section })
  const settingsSection = isSettingsSection(settingsParam) ? settingsParam : null
  const navigate = useNavigate()
  const { games, active, storageAvailable } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const [panel, setPanel] = useState<Panel>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [multi, setMulti] = useState(false)
  const [advancedModes, setAdvancedModesState] = useState<AdvancedModes>(DEFAULT_ADVANCED_MODES)
  const [appearance, setAppearanceState] = useState<AppearancePreferences>(DEFAULT_APPEARANCE)
  const [highlighting, setHighlightingState] = useState<HighlightPreferences>(DEFAULT_HIGHLIGHT_PREFERENCES)
  const [errorMode, setErrorModeState] = useState<ErrorMode>(DEFAULT_ERROR_MODE)
  const [cellReferenceStyle, setCellReferenceStyleState] = useState<CellReferenceStyle>(DEFAULT_CELL_REFERENCE_STYLE)
  const [inputSize, setInputSizeState] = useState(DEFAULT_INPUT_SIZE)
  const [difficulty, setDifficultyState] = useState<Difficulty>(DEFAULT_DIFFICULTY)
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>(DEFAULT_WORKSPACE_MODE)
  const [advancedPanels, setAdvancedPanels] = useState<AdvancedPanelVisibility>(DEFAULT_ADVANCED_PANEL_VISIBILITY)
  const [puzzleBrowserView, setPuzzleBrowserView] = useState<PuzzleBrowserView>('active')
  const [panelHeight, setPanelHeight] = useState(280)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [resizeMode, setResizeMode] = useState(false)
  const [linkError, setLinkError] = useState('')
  const automaticPuzzle = usePuzzleGeneration()
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const worktableActions = useRef<WorktableActions | null>(null)
  const resizeStartHeight = useRef(panelHeight)
  const resizeStartInputSize = useRef(inputSize)
  const automaticPuzzleStarted = useRef(false)
  const game = games.find((item) => item.id === active)
  const advancedShell = workspaceMode === 'advanced' && (playing || learning)
  const activeLeftPanelOpen = learning ? advancedPanels.articles : advancedPanels.left
  const close = () => setPanel(null)
  usePageAppearance(appearance)

  useEffect(() => {
    const disconnect = roomStore.connect()
    const preferences = readPreferences()
    setAdvancedModesState(preferences.advancedModes)
    setAppearanceState(preferences.appearance)
    setHighlightingState(preferences.highlighting)
    setErrorModeState(preferences.errorMode)
    setCellReferenceStyleState(preferences.cellReferenceStyle)
    setInputSizeState(preferences.inputSize)
    setDifficultyState(preferences.difficulty)
    setWorkspaceModeState(preferences.workspaceMode)
    setAdvancedPanels(readAdvancedPanelVisibility())
    const savedPanelHeight = readPanelHeight()
    if (savedPanelHeight !== null) setPanelHeight(savedPanelHeight)
    setWorkspaceReady(true)
    return disconnect
  }, [])
  useEffect(() => {
    if (!workspaceReady) return
    if (game) {
      automaticPuzzleStarted.current = false
      return
    }
    if (games.length) {
      roomStore.select(games[0].id)
      return
    }
    if (automaticPuzzleStarted.current) return
    automaticPuzzleStarted.current = true
    void automaticPuzzle.generate(difficulty)
  }, [workspaceReady, game, games.length, difficulty])
  useEffect(() => {
    if (!playing) return
    let attempt = 0
    async function handleLink() {
      const id = ++attempt
      if (!window.location.hash.startsWith('#puzzle=')) return
      setLinkError('')
      try {
        await openPuzzle(parsePuzzle(window.location.href), () => id !== attempt)
      } catch (error) {
        if (id === attempt) setLinkError((error as Error).message)
      }
      if (id === attempt) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
    void handleLink()
    window.addEventListener('hashchange', handleLink)
    return () => {
      attempt++
      window.removeEventListener('hashchange', handleLink)
    }
  }, [playing])
  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  function openPanel(nextPanel: Exclude<Panel, null>) {
    setMenuOpen(false)
    setPanel(nextPanel)
    if (!playing) void navigate({ to: '/' })
  }

  function openSettings() {
    setMenuOpen(false)
    setPanel(null)
    void navigate({ to: '/settings' })
  }

  function setAdvancedModes(next: AdvancedModes) {
    setAdvancedModesState(next)
    saveAdvancedModes(next)
  }

  function setAppearance(next: AppearancePreferences) {
    setAppearanceState(next)
    saveAppearance(next)
  }

  function setErrorMode(next: ErrorMode) {
    setErrorModeState(next)
    saveErrorMode(next)
  }

  function setCellReferenceStyle(next: CellReferenceStyle) {
    setCellReferenceStyleState(next)
    saveCellReferenceStyle(next)
  }

  function setHighlighting(next: HighlightPreferences) {
    setHighlightingState(next)
    saveHighlightPreferences(next)
  }

  function setInputSize(next: number) {
    setInputSizeState(next)
    saveInputSize(next)
  }

  function setDifficulty(next: Difficulty) {
    setDifficultyState(next)
    saveDifficulty(next)
  }

  function setWorkspaceMode(next: WorkspaceMode) {
    setWorkspaceModeState(next)
    saveWorkspaceMode(next)
    setResizeMode(false)
  }

  function beginResize() {
    setMenuOpen(false)
    setPanel(null)
    if (!playing) void navigate({ to: '/' })
    setResizeMode((current) => {
      if (!current) {
        resizeStartHeight.current = panelHeight
        resizeStartInputSize.current = inputSize
      }
      return true
    })
  }

  function cancelResize() {
    setPanelHeight(resizeStartHeight.current)
    setInputSizeState(resizeStartInputSize.current)
    setResizeMode(false)
  }

  function finishResize() {
    savePanelHeight(panelHeight)
    saveInputSize(inputSize)
    setResizeMode(false)
  }

  function checkPuzzle() {
    setMenuOpen(false)
    worktableActions.current?.check()
  }

  function toggleMulti() {
    setMulti((current) => !current)
  }

  function toggleAdvancedPanel(panel: keyof AdvancedPanelVisibility) {
    setAdvancedPanels((current) => {
      const next = { ...current, [panel]: !current[panel] }
      saveAdvancedPanelVisibility(next)
      return next
    })
  }

  function createPuzzle() {
    setPanel(null)
    roomStore.add({ ...makeGame(createGameId(), 'Untitled puzzle', EMPTY, 'draft'), returnId: active ?? undefined })
  }

  function editPuzzle() {
    if (!game || game.source !== 'custom') return
    const draft = makeGame(createGameId(), game.title, EMPTY, 'draft')
    roomStore.add({ ...draft, editingId: game.id, returnId: game.id, position: { ...draft.position, entries: game.givens } })
  }

  function cancelDraft() {
    if (!game || game.source !== 'draft') return
    const returnId = game.returnId ?? game.editingId
    roomStore.remove(game.id)
    if (returnId) roomStore.select(returnId)
  }

  return (
    <div className={`app-shell ${advancedShell ? 'advanced-mode' : 'standard-mode'} ${activeLeftPanelOpen ? '' : 'advanced-left-collapsed'} ${advancedPanels.right ? '' : 'advanced-right-collapsed'} ${advancedPanels.bottom ? '' : 'advanced-bottom-collapsed'}`}>
      <header className={`topbar ${advancedShell ? 'advanced-topbar' : ''}`}>
        <div className="topbar-inner">
          <Link to="/" className="wordmark" onClick={() => setMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>Sudoku
          </Link>
          <nav className="primary-navigation" aria-label="Primary navigation">
            {workspaceMode === 'advanced' ? <>
              <Link to="/" activeOptions={{ exact: true }}>Play</Link>
              <Link to="/learn">Learn</Link>
            </> : <>
              <Link to="/" activeOptions={{ exact: true }}>Play</Link>
              <Link to="/puzzles">Puzzles</Link>
              <Link to="/learn">Learn</Link>
            </>}
          </nav>
          <div className="topbar-actions" ref={menuRef}>
            {advancedShell && !settingsRoute && <div className="advanced-region-controls" role="group" aria-label="Workspace panels">
              <button className="icon-button" aria-pressed={activeLeftPanelOpen}
                aria-label={`${activeLeftPanelOpen ? 'Collapse' : 'Expand'} left panel`}
                title={`${activeLeftPanelOpen ? 'Collapse' : 'Expand'} ${learning ? 'articles' : 'puzzles'} panel`}
                onClick={() => toggleAdvancedPanel(learning ? 'articles' : 'left')}><PanelLeft size={17} /></button>
              {playing && <>
                <button className="icon-button" aria-pressed={advancedPanels.right}
                  aria-label={`${advancedPanels.right ? 'Collapse' : 'Expand'} right panel`}
                  title={`${advancedPanels.right ? 'Collapse' : 'Expand'} right panels`}
                  onClick={() => toggleAdvancedPanel('right')}><PanelRight size={17} /></button>
                <button className="icon-button" aria-pressed={advancedPanels.bottom}
                  aria-label={`${advancedPanels.bottom ? 'Collapse' : 'Expand'} bottom panel`}
                  title={`${advancedPanels.bottom ? 'Collapse' : 'Expand'} assistance panel`}
                  onClick={() => toggleAdvancedPanel('bottom')}><PanelBottom size={17} /></button>
              </>}
            </div>}
            <button ref={menuButtonRef} className="icon-button app-menu-trigger" aria-label="Open options menu" title="Options"
              aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => setMenuOpen((open) => !open)}>
              <Menu size={20} />
            </button>
            {menuOpen && <div className="app-menu" id="app-menu">
              <div className="mobile-primary-navigation">
                <Link to="/" onClick={() => setMenuOpen(false)}><Play size={17} /> Play</Link>
                {workspaceMode !== 'advanced' && <Link to="/puzzles" onClick={() => setMenuOpen(false)}><Grid3X3 size={17} /> Puzzles</Link>}
                <Link to="/learn" onClick={() => setMenuOpen(false)}><BookOpen size={17} /> Learn</Link>
                <div className="app-menu-separator" />
              </div>
              <button aria-pressed={workspaceMode === 'advanced'} onClick={() => {
                setMenuOpen(false)
                setWorkspaceMode(workspaceMode === 'advanced' ? 'standard' : 'advanced')
              }}><PanelsTopLeft size={17} /> {workspaceMode === 'advanced' ? 'Standard mode' : 'Advanced mode'}</button>
              <button onClick={openSettings}><SlidersHorizontal size={17} /> Settings</button>
              {playing && game?.source === 'draft' && <button onClick={checkPuzzle}><Check size={17} /> Validate puzzle</button>}
              <div className="app-menu-separator" />
              <button onClick={() => openPanel('import')}><ArrowDownToLine size={17} /> Import</button>
            </div>}
          </div>
        </div>
      </header>

      <PuzzlesContent.Provider value={{ games, active, difficulty, setDifficulty }}>
      <PlayContent.Provider value={playing && !workspaceReady ? (
        <main className="page workspace-initializing" aria-hidden="true"><div className="workspace" /></main>
      ) : playing ? (
        <main className={`page ${resizeMode ? 'resize-active' : ''} ${workspaceMode === 'advanced' ? 'advanced-workspace-page' : 'standard-workspace-page'}`} aria-label="Sudoku workspace">
          {!storageAvailable && <p className="workspace-error" role="alert">Local storage is unavailable. Changes may be lost.</p>}
          {linkError && <p className="workspace-error" role="alert">{linkError}</p>}
          <div className="workspace">
            {game ? (
              <Worktable game={game} games={games} preferredDifficulty={difficulty}
                modalOpen={panel !== null || menuOpen || resizeMode || settingsRoute}
                advancedModes={advancedModes} appearance={appearance} highlighting={highlighting}
                errorMode={errorMode} cellReferenceStyle={cellReferenceStyle} multi={multi} actionsRef={worktableActions}
                inputSize={inputSize} panelHeight={panelHeight} setPanelHeight={setPanelHeight} beginResize={beginResize}
                toggleMulti={toggleMulti} onDifficultyChange={setDifficulty}
                workspaceMode={workspaceMode}
                showLeftPanel={advancedPanels.left} showRightPanel={advancedPanels.right} showBottomPanel={advancedPanels.bottom}
                puzzleBrowserView={puzzleBrowserView} setPuzzleBrowserView={setPuzzleBrowserView}
                onNewPuzzle={() => setPanel('new')} onCreatePuzzle={createPuzzle} onEditPuzzle={editPuzzle}
                onCancelDraft={cancelDraft} onShare={() => setPanel('share')} onPublish={() => setPanel('publish')} />
            ) : (
              <section className="surface empty-board">
                <h2>{automaticPuzzle.busy ? 'Generating a puzzle…' : 'Start a Sudoku'}</h2>
                {automaticPuzzle.error && <p className="workspace-error" role="alert">{automaticPuzzle.error}</p>}
                {!automaticPuzzle.busy && <button className="button primary" onClick={() => {
                  automaticPuzzleStarted.current = true
                  void automaticPuzzle.generate(difficulty)
                }}><Plus size={18} /> {automaticPuzzle.error ? 'Try again' : 'New puzzle'}</button>}
              </section>
            )}
          </div>
        </main>
      ) : null}>
        {children}
      </PlayContent.Provider>
      </PuzzlesContent.Provider>

      {playing && resizeMode && <div className="resize-session-bar" role="region" aria-label="Resize panels">
        <span className="resize-session-copy"><strong>Resize input panel</strong><small>Drag the handle or adjust digit size.</small></span>
        <span className="resize-size-controls" role="group" aria-label="Digit size">
          <button className="icon-button" aria-label="Decrease digit size" disabled={inputSize <= MIN_INPUT_SIZE}
            onClick={() => setInputSizeState(Math.max(MIN_INPUT_SIZE, inputSize - INPUT_SIZE_STEP))}><Minus size={18} /></button>
          <button className="icon-button" aria-label="Increase digit size" disabled={inputSize >= MAX_INPUT_SIZE}
            onClick={() => setInputSizeState(Math.min(MAX_INPUT_SIZE, inputSize + INPUT_SIZE_STEP))}><Plus size={18} /></button>
        </span>
        <span className="resize-session-actions">
          <button className="button secondary" onClick={cancelResize}>Cancel</button>
          <button className="button primary" onClick={finishResize}>Save</button>
        </span>
      </div>}

      {panel === 'new' && <NewPuzzle close={close} difficulty={difficulty} onDifficultyChange={setDifficulty} onCreate={createPuzzle} />}
      {panel === 'import' && <ImportPuzzle close={close} onImport={(text, cancelled) => openPuzzle(parsePuzzle(text), cancelled)} />}
      {panel === 'share' && game && <SharePuzzle game={game} close={close} />}
      {settingsRoute && <Settings close={() => { void navigate({ to: '/' }) }} section={settingsSection}
        advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
        appearance={appearance} setAppearance={setAppearance}
        highlighting={highlighting} setHighlighting={setHighlighting}
        errorMode={errorMode} setErrorMode={setErrorMode} inputSize={inputSize} setInputSize={setInputSize}
        cellReferenceStyle={cellReferenceStyle} setCellReferenceStyle={setCellReferenceStyle}
        workspaceMode={workspaceMode} setWorkspaceMode={setWorkspaceMode}
        draft={game?.source === 'draft'} />}
      {panel === 'publish' && game?.source === 'draft' && <SavePuzzle game={game} close={close} />}
    </div>
  )
}
