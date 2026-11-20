import { Button, IconButton, buttonClassName } from './Button'
import { Link, useLocation, useMatch, useNavigate, useRouterState } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDownToLine, BarChart3, BookOpen, Check, Dices, Grid3X3, Keyboard, LoaderCircle, Menu, Minus, PanelBottom, PanelLeft, PanelRight, PanelsTopLeft, Plus,
  Monitor, Moon, SlidersHorizontal, Sun,
} from 'lucide-react'
import { stepAppTextZoom } from '../sudoku/app-text-zoom'
import { DEFAULT_DIFFICULTY, type DifficultyPreference } from '../sudoku/difficulty'
import { collectionDownloads } from '../sudoku/collection-downloads'
import { fiveJigsawForSeed, isRectangularSize, MINI_GRID, rectangularGridForBoxRows, sevenJigsawForSeed, type RectangularBoxRows, type SizedGrid } from '../sudoku/grid'
import { gameGenerationVariant, isSizedPuzzleId, rectangularPuzzleSize, type NewPuzzleId } from '../sudoku/new-puzzle'
import { createGameId, EMPTY, makeGame, type ErrorMode } from '../sudoku/game'
import { DEFAULT_CELL_REFERENCE_STYLE, type CellReferenceStyle } from '../sudoku/hints'
import { inProgress } from '../sudoku/puzzle-activity'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_INPUT_SIZE, INPUT_SIZE_STEP, MAX_INPUT_SIZE,
  ADVANCED_MODE_KEY, APPEARANCE_KEY, CELL_REFERENCE_STYLE_KEY, DIFFICULTY_KEY, ERROR_MODE_KEY, HIGHLIGHT_KEY,
  INPUT_SIZE_KEY, NEW_PUZZLE_KEY, WORKSPACE_MODE_KEY, MIN_INPUT_SIZE, readNewPuzzlePreference, readPanelHeight, readPreferences, saveAdvancedModes, saveAppearance, saveCellReferenceStyle, saveDifficulty, saveErrorMode,
  saveHighlightPreferences, saveInputSize, savePanelHeight, saveWorkspaceMode, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_WORKSPACE_MODE,
  saveNewPuzzlePreference, type AdvancedModes, type AppearancePreferences, type ColorMode, type HighlightPreferences, type NewPuzzlePreference, type WorkspaceMode,
} from '../sudoku/preferences'
import { deviceSync } from '../sudoku/device-sync'
import { roomStore } from '../sudoku/storage'
import { playSession } from '../sudoku/play-session'
import { puzzleGenerationRuleset } from '../sudoku/variant-rulesets'
import { appTextZoomShortcut, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { DesktopPlayLayout, PlayWorkspace } from './DesktopPlayLayout'
import { ImportPuzzle, openPuzzle } from './ImportPuzzle'
import { EditJigsawRegions } from './EditJigsawRegions'
import { EditSizedRules } from './EditSizedRules'
import { EditCages, SavePuzzle, SharePuzzle } from './PuzzleDialogs'
import { SharedPuzzlePage } from './SharedPuzzlePage'
import { MotionSurface, Presence } from './Presence'
import { useMobileLayout } from './mobile-layout'
import { PuzzlesPage } from './PuzzlesPage'
import { isSettingsSection, Settings, type SettingsSection } from './Settings'
import { SyncConnectionStatus } from './SyncConnectionStatus'
import { usePageAppearance } from './usePageAppearance'
import { usePlayPreference } from './usePlayPreference'
import { Worktable, type WorktableActions } from './Worktable'

type Panel = 'import' | 'share' | 'publish' | 'cages' | 'sized-rules' | 'jigsaw-regions' | null
type SettingsReturnLocation = { href: string; left: number; top: number; articleTop: number }
const PUZZLE_LINK = /^(?:puzzle|variant|sized)=/
type AdvancedPanelVisibility = { left: boolean; right: boolean; bottom: boolean; articles: boolean }
const ADVANCED_PANEL_VISIBILITY_KEY = 'sudoku-app:v1:advanced-panel-visibility'
const DEFAULT_ADVANCED_PANEL_VISIBILITY: AdvancedPanelVisibility = { left: true, right: true, bottom: true, articles: true }
const COLOR_MODE_ORDER: ColorMode[] = ['system', 'light', 'dark']
const COLOR_MODE_LABELS: Record<ColorMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }

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

const shellPreferenceKeys = new Set([ADVANCED_MODE_KEY, APPEARANCE_KEY, CELL_REFERENCE_STYLE_KEY, DIFFICULTY_KEY,
  ERROR_MODE_KEY, HIGHLIGHT_KEY, INPUT_SIZE_KEY, NEW_PUZZLE_KEY, WORKSPACE_MODE_KEY])

const PlayContent = createContext<ReactNode>(null)

export function Workspace() {
  return useContext(PlayContent)
}

// Never add this inert draft to roomStore. It reserves the real workspace layout.
const pendingWorkspaceGame = { ...makeGame('pending-workspace', 'New puzzle', EMPTY, 'draft', 0),
  paused: true, difficulty: 'easy' as const, score: 0 }

export function SudokuShell({ children }: { children: ReactNode }) {
  const settingsRoute = Boolean(useMatch({ from: '/settings', shouldThrow: false }))
  const homeRoute = Boolean(useMatch({ from: '/', shouldThrow: false }))
  const puzzlesRoute = Boolean(useMatch({ from: '/puzzles', shouldThrow: false }))
  const standalonePuzzlePage = useRouterState({
    select: state => state.matches.at(-1)?.staticData.standalonePuzzlePage === true,
  })
  const puzzleParam = useMatch({ from: '/', shouldThrow: false, select: m => m.search.puzzle })
  const shareParam = useMatch({ from: '/', shouldThrow: false, select: m => m.search.share })
  const learning = Boolean(useMatch({ from: '/learn', shouldThrow: false }))
  const settingsParam = useMatch({ from: '/settings/$section', shouldThrow: false, select: ({ params }) => params.section })
  const settingsSection = isSettingsSection(settingsParam) ? settingsParam : null
  const navigate = useNavigate()
  const locationHref = useLocation({ select: (location) => location.href })
  const { games, active, stoppedPlaying, storageAvailable } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const [panel, setPanel] = useState<Panel>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [multi, setMulti] = usePlayPreference('multi')
  const [advancedModes, setAdvancedModesState] = useState<AdvancedModes>(DEFAULT_ADVANCED_MODES)
  const [appearance, setAppearance] = useState<AppearancePreferences>(DEFAULT_APPEARANCE)
  const [highlighting, setHighlightingState] = useState<HighlightPreferences>(DEFAULT_HIGHLIGHT_PREFERENCES)
  const [errorMode, setErrorModeState] = useState<ErrorMode>(DEFAULT_ERROR_MODE)
  const [cellReferenceStyle, setCellReferenceStyleState] = useState<CellReferenceStyle>(DEFAULT_CELL_REFERENCE_STYLE)
  const [inputSize, setInputSizeState] = useState(DEFAULT_INPUT_SIZE)
  const [difficulty, setDifficultyState] = useState<DifficultyPreference>(DEFAULT_DIFFICULTY)
  const [newPuzzlePreference, setNewPuzzlePreference] = useState<NewPuzzlePreference | null>(null)
  const [preferredWorkspaceMode, setPreferredWorkspaceMode] = useState<WorkspaceMode>(DEFAULT_WORKSPACE_MODE)
  const [advancedPanels, setAdvancedPanels] = useState<AdvancedPanelVisibility>(DEFAULT_ADVANCED_PANEL_VISIBILITY)
  const [puzzleBrowserView, setPuzzleBrowserView] = usePlayPreference('puzzleBrowserView')
  const [panelHeight, setPanelHeight] = useState(280)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [openingOnLaunch, setOpeningOnLaunch] = useState(true)
  // Static hosting serves the same home HTML for every puzzle query.
  const requested = workspaceReady ? puzzleParam : undefined
  const shared = workspaceReady ? shareParam : undefined
  const [resizeMode, setResizeMode] = useState(false)
  const [linkError, setLinkError] = useState('')
  const savedAppearance = useRef(appearance)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const settingsReturnLocation = useRef<SettingsReturnLocation | null>(null)
  const worktableActions = useRef<WorktableActions | null>(null)
  const resizeStartHeight = useRef(panelHeight)
  const resizeStartInputSize = useRef(inputSize)
  const hasLocalPuzzleAtLaunch = useRef(false)
  const reloading = useRef(false)
  const session = useSyncExternalStore(playSession.subscribe, playSession.getSnapshot, playSession.getServerSnapshot)
  const sync = useSyncExternalStore(deviceSync.subscribe, deviceSync.getSnapshot, deviceSync.getServerSnapshot)
  const syncConnection = useSyncExternalStore(deviceSync.subscribeConnection, deviceSync.getConnection, deviceSync.getServerConnection)
  const peerPuzzles = useSyncExternalStore(deviceSync.subscribePresence, deviceSync.getPeerPuzzles, deviceSync.getServerPeerPuzzles)
  const locationHash = locationHref.split('#', 2)[1] ?? ''
  const puzzleLink = PUZZLE_LINK.test(locationHash)
  const activePuzzles = inProgress(games)
  const localLaunch = hasLocalPuzzleAtLaunch.current
  const launchPuzzle = homeRoute && workspaceReady && shared === undefined && !requested &&
    !stoppedPlaying && !linkError && !puzzleLink && (localLaunch || sync.ready)
    ? (localLaunch ? activePuzzles.find(item => item.id === active) : undefined) ?? activePuzzles[0]
    : undefined
  const game = launchPuzzle ?? games.find(item => item.id === (requested ?? active))
  const playRoute = homeRoute && Boolean(requested || launchPuzzle)
  const playing = playRoute || settingsRoute
  const missingPuzzle = playRoute && !game ? requested : undefined
  const savedLaunchPause = session.puzzleId === game?.id && session.launchPaused
  const pausedOnLaunch = openingOnLaunch && playRoute && !reloading.current
    ? puzzleTiming.getSnapshot().pauseOnOpen
    : savedLaunchPause
  const hasRequestedGame = Boolean(requested && game)
  const openingPuzzleLink = shared === undefined && puzzleLink && !hasRequestedGame && !linkError
  const viewedPuzzle = playRoute && game && game.source !== 'draft' ? game.id : null
  const peerPuzzle = playedPeerPuzzle()
  const boxRows = game?.grid && 'boxRows' in game.grid && isRectangularSize(game.grid.size) ? game.grid.boxRows : undefined
  const newPuzzleDefaults: NewPuzzlePreference = newPuzzlePreference ?? {
    variant: gameGenerationVariant(game) ?? 'classic', boxRows,
    difficulty: game?.generatedWithAuto ? 'auto' : game?.difficulty ?? difficulty,
  }
  const mobile = useMobileLayout()
  const workspaceMode = mobile ? 'standard' : preferredWorkspaceMode
  const desktopStandard = !mobile && workspaceMode === 'standard'
  const advancedShell = workspaceMode === 'advanced' && (playing || learning)
  const activeLeftPanelOpen = learning ? advancedPanels.articles : advancedPanels.left
  const colorModeIndex = COLOR_MODE_ORDER.indexOf(appearance.colorMode)
  const nextColorMode = COLOR_MODE_ORDER[(colorModeIndex + 1) % COLOR_MODE_ORDER.length]
  const ColorModeIcon = appearance.colorMode === 'system' ? Monitor : appearance.colorMode === 'light' ? Sun : Moon
  const close = () => setPanel(null)
  usePageAppearance(appearance, workspaceReady)

  function playedPeerPuzzle() {
    const id = peerPuzzles[0]
    if (!viewedPuzzle || !id || id === viewedPuzzle || syncConnection.mode !== 'live') return
    return inProgress(games).find(item => item.id === id && item.source !== 'draft')
  }

  useEffect(() => { deviceSync.showPuzzle(viewedPuzzle, missingPuzzle) }, [viewedPuzzle, missingPuzzle])

  function cycleColorMode() {
    setAppearance({ ...appearance, colorMode: nextColorMode })
  }

  useEffect(() => {
    function openShortcutHelp(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || !shortcutMatches(event, shortcuts, 'shortcutHelp')) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, [data-shortcut-capture]'))) return
      event.preventDefault()
      setMenuOpen(false)
      setPanel(null)
      void navigate({ to: '/shortcuts' })
    }
    window.addEventListener('keydown', openShortcutHelp)
    return () => window.removeEventListener('keydown', openShortcutHelp)
  }, [navigate, shortcuts])

  useEffect(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    reloading.current = navigation?.type === 'reload'
    const disconnect = roomStore.connect()
    hasLocalPuzzleAtLaunch.current = inProgress(roomStore.getSnapshot().games).length > 0
    const disconnectSync = deviceSync.connect()
    const disconnectDownloads = collectionDownloads.connect()
    function refreshPreferences(key: string | null) {
      const matches = (setting: string) => key === null || key === setting
      const preferences = readPreferences()
      if (matches(ADVANCED_MODE_KEY)) setAdvancedModesState(preferences.advancedModes)
      if (matches(APPEARANCE_KEY)) {
        savedAppearance.current = preferences.appearance
        setAppearance(preferences.appearance)
      }
      if (matches(HIGHLIGHT_KEY)) setHighlightingState(preferences.highlighting)
      if (matches(ERROR_MODE_KEY)) setErrorModeState(preferences.errorMode)
      if (matches(CELL_REFERENCE_STYLE_KEY)) setCellReferenceStyleState(preferences.cellReferenceStyle)
      if (matches(INPUT_SIZE_KEY)) setInputSizeState(preferences.inputSize)
      if (matches(DIFFICULTY_KEY)) setDifficultyState(preferences.difficulty)
      if (matches(NEW_PUZZLE_KEY)) setNewPuzzlePreference(readNewPuzzlePreference())
      if (matches(WORKSPACE_MODE_KEY)) setPreferredWorkspaceMode(preferences.workspaceMode)
    }
    function onStorage(event: StorageEvent) {
      if (event.storageArea === localStorage && (event.key === null || shellPreferenceKeys.has(event.key))) refreshPreferences(event.key)
    }
    window.addEventListener('storage', onStorage)
    refreshPreferences(null)
    setAdvancedPanels(readAdvancedPanelVisibility())
    const savedPanelHeight = readPanelHeight()
    if (savedPanelHeight !== null) setPanelHeight(savedPanelHeight)
    setWorkspaceReady(true)
    return () => {
      window.removeEventListener('storage', onStorage)
      disconnect(); disconnectSync(); disconnectDownloads()
    }
  }, [])
  useEffect(() => {
    if (!workspaceReady || savedAppearance.current === appearance) return
    savedAppearance.current = appearance
    saveAppearance(appearance)
  }, [appearance, workspaceReady])
  useEffect(() => {
    if (!workspaceReady) return
    function zoomText(event: KeyboardEvent) {
      const direction = appTextZoomShortcut(event)
      if (direction === null || event.defaultPrevented || !event.cancelable) return
      event.preventDefault()
      setAppearance((current) => {
        const appTextZoom = stepAppTextZoom(current.appTextZoom, direction)
        return appTextZoom === current.appTextZoom ? current : { ...current, appTextZoom }
      })
    }
    window.addEventListener('keydown', zoomText, true)
    return () => window.removeEventListener('keydown', zoomText, true)
  }, [workspaceReady])
  useEffect(() => roomStore.onPlay(id => {
    const location = new URL(window.location.href)
    const legacyLink = PUZZLE_LINK.test(location.hash.slice(1))
    if (!legacyLink) {
      setOpeningOnLaunch(false)
      if (id) playSession.set(id, 'launchPaused', false)
      else playSession.activate(null)
    }
    if (!id && !location.searchParams.has('puzzle')) return
    setLinkError('')
    if (id) {
      const replace = location.pathname === '/' && (legacyLink || location.searchParams.has('share'))
      void navigate({ to: '/', search: { puzzle: id }, replace, viewTransition: false })
    } else void navigate({ to: '/puzzles/browse', viewTransition: false })
  }), [navigate])
  useEffect(() => {
    if (!workspaceReady) return
    if (!homeRoute || shared !== undefined || (stoppedPlaying && !requested) || linkError) {
      if (openingOnLaunch) setOpeningOnLaunch(false)
      return
    }
    if (requested) {
      if (openingOnLaunch && game) {
        playSession.set(game.id, 'launchPaused', pausedOnLaunch)
        setOpeningOnLaunch(false)
      }
      return
    }
    if (puzzleLink) return
    if (launchPuzzle) {
      void navigate({ to: '/', search: { puzzle: launchPuzzle.id }, replace: true, viewTransition: false })
      return
    }
    if (!sync.ready) return
    if (!sync.linked) roomStore.startFirstPuzzle()
    if (openingOnLaunch) setOpeningOnLaunch(false)
  }, [workspaceReady, homeRoute, requested, shared, stoppedPlaying, linkError, sync.ready, sync.linked, game, launchPuzzle, navigate, puzzleLink, openingOnLaunch, pausedOnLaunch])
  useEffect(() => {
    if (!workspaceReady || !requested || !hasRequestedGame) return
    const location = new URL(window.location.href)
    // The address can change before the router finishes updating the matched puzzle.
    if (location.pathname !== '/' || location.searchParams.get('puzzle') !== requested) return
    roomStore.view(requested)
    playSession.activate(requested)
    if (PUZZLE_LINK.test(location.hash.slice(1))) {
      void navigate({ to: '/', search: { puzzle: requested }, replace: true, viewTransition: false })
    }
  }, [workspaceReady, requested, hasRequestedGame, locationHash, navigate])
  const acceptsPuzzleLinks = homeRoute || settingsRoute
  useEffect(() => {
    if (!acceptsPuzzleLinks || !workspaceReady || shared !== undefined || !puzzleLink || hasRequestedGame || (requested && !sync.ready)) return
    const href = window.location.href
    let active = true
    const cancelled = () => !active || window.location.href !== href || Boolean(requested &&
      roomStore.getSnapshot().games.some((saved) => saved.id === requested))
    async function handleLink() {
      setLinkError('')
      try {
        if (requested && sync.linked) await deviceSync.refreshPuzzles()
        if (!cancelled()) await openPuzzle(`#${locationHash}`, cancelled, { freshCopy: Boolean(requested) })
      } catch (error) {
        if (cancelled()) return
        setLinkError((error as Error).message)
        void navigate({ to: '/', search: requested ? { puzzle: requested } : {}, replace: true, viewTransition: false })
      }
    }
    void handleLink()
    return () => { active = false }
  }, [acceptsPuzzleLinks, workspaceReady, puzzleLink, hasRequestedGame, requested, shared, sync.ready, sync.linked, locationHref, locationHash, navigate])
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

  function openImport() {
    setMenuOpen(false)
    if (mobile) {
      setPanel(null)
      void navigate({ to: '/import' })
      return
    }
    setPanel('import')
  }

  function openNewPuzzle(step?: 'difficulty') {
    setPanel(null)
    const variant = gameGenerationVariant(game)
    if (step === 'difficulty' && variant) {
      void navigate({ to: '/puzzles/new/difficulty', search: { variant, ruleset: puzzleGenerationRuleset(game?.variant?.puzzle), boxRows } })
    } else {
      void navigate({ to: '/puzzles/new', search: {} })
    }
  }

  function openSettings(section?: SettingsSection) {
    if (!settingsRoute) settingsReturnLocation.current = {
      href: locationHref,
      left: window.scrollX,
      top: window.scrollY,
      articleTop: document.querySelector<HTMLElement>('.learn-content-scroll')?.scrollTop ?? 0,
    }
    setMenuOpen(false)
    setPanel(null)
    if (section) void navigate({ to: '/settings/$section', params: { section } })
    else void navigate({ to: '/settings' })
  }

  function closeSettings() {
    const origin = settingsReturnLocation.current
    settingsReturnLocation.current = null
    void navigate({ href: origin?.href ?? '/puzzles/browse', replace: true, resetScroll: false }).then(() => {
      requestAnimationFrame(() => {
        menuButtonRef.current?.focus({ preventScroll: true })
        if (!origin) return
        window.scrollTo(origin.left, origin.top)
        document.querySelector<HTMLElement>('.learn-content-scroll')?.scrollTo(0, origin.articleTop)
      })
    })
  }

  function setAdvancedModes(next: AdvancedModes) {
    setAdvancedModesState(next)
    saveAdvancedModes(next)
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

  function setDifficulty(next: DifficultyPreference) {
    setDifficultyState(next)
    saveDifficulty(next)
  }

  function rememberNewPuzzle(next: NewPuzzlePreference) {
    setNewPuzzlePreference(next)
    saveNewPuzzlePreference(next)
  }

  function setWorkspaceMode(next: WorkspaceMode) {
    setPreferredWorkspaceMode(next)
    saveWorkspaceMode(next)
    setResizeMode(false)
  }

  function beginResize() {
    setMenuOpen(false)
    setPanel(null)
    if (!playing && game) void navigate({ to: '/', search: { puzzle: game.id } })
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

  function setPanelVisibility(panel: keyof AdvancedPanelVisibility, open?: boolean) {
    setAdvancedPanels((current) => {
      const visible = open ?? !current[panel]
      if (visible === current[panel]) return current
      const next = { ...current, [panel]: visible }
      saveAdvancedPanelVisibility(next)
      return next
    })
  }

  function createPuzzle(variant?: NewPuzzleId, boxRows?: RectangularBoxRows, layout?: SizedGrid) {
    setPanel(null)
    const size = rectangularPuzzleSize(variant)
    const grid = layout ?? (size ? rectangularGridForBoxRows(size, boxRows)
      : variant === 'jigsaw-five' ? fiveJigsawForSeed() : variant === 'jigsaw-seven' ? sevenJigsawForSeed() : isSizedPuzzleId(variant) ? MINI_GRID : undefined)
    const givens = grid ? '0'.repeat(grid.size ** 2) : EMPTY
    const draft = makeGame(createGameId(), 'Untitled puzzle', givens, 'draft', undefined, grid)
    if (variant === 'algebraic-cages') draft.position.draftCages = []
    else if (grid) draft.position.draftSizedRules = []
    roomStore.add({ ...draft, returnId: active ?? undefined })
  }

  function editPuzzle() {
    if (!game || game.source !== 'custom') return
    const draft = makeGame(createGameId(), game.title, '0'.repeat(game.givens.length), 'draft', undefined, game.grid)
    roomStore.add({ ...draft, editingId: game.id, returnId: game.id,
      position: { ...draft.position, entries: game.givens, draftCages: game.algebraic?.rules, draftSizedRules: game.sized?.rules } })
  }

  function cancelDraft() {
    if (!game || game.source !== 'draft') return
    const returnId = game.returnId ?? game.editingId
    roomStore.remove(game.id)
    if (returnId) roomStore.select(returnId)
  }

  const boxlessDraftLayout = game?.grid && 'noRegions' in game.grid ? game.grid : undefined
  const onlyActivePuzzle = activePuzzles.length === 1 ? activePuzzles[0] : undefined
  const emptyPuzzleContent = <div className="empty-puzzle-content">
    <Link className={buttonClassName('primary')} to="/puzzles/new"><Plus size={18} />New puzzle</Link>
  </div>
  return (
    <DesktopPlayLayout className={`app-shell ${advancedShell ? 'advanced-mode' : 'standard-mode'} ${activeLeftPanelOpen ? '' : 'advanced-left-collapsed'} ${advancedPanels.right ? '' : 'advanced-right-collapsed'} ${advancedPanels.bottom ? '' : 'advanced-bottom-collapsed'}`}
      enabled={playing && workspaceReady && desktopStandard}>
      <header className={`topbar ${advancedShell ? 'advanced-topbar' : ''}`}>
        <div className="topbar-inner">
          <div className="topbar-brand">
            <Link to={onlyActivePuzzle ? '/' : '/puzzles/browse'} search={onlyActivePuzzle && { puzzle: onlyActivePuzzle.id }}
              className="wordmark" onClick={() => setMenuOpen(false)}>
              <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>Sudoku
            </Link>
            <SyncConnectionStatus connection={syncConnection} loadingAccount={sync.loadingAccount} />
          </div>
          <nav className="primary-navigation" aria-label="Primary navigation">
            <Link to="/puzzles/browse" activeOptions={{ exact: true }}
              aria-current={puzzlesRoute || homeRoute ? 'location' : undefined}>Puzzles</Link>
            <Link to="/learn">Learn</Link>
          </nav>
          <div className="topbar-actions" ref={menuRef}>
            {advancedShell && !settingsRoute && <div className="advanced-region-controls" role="group" aria-label="Workspace panels">
              <IconButton aria-pressed={activeLeftPanelOpen}
                aria-label={`${activeLeftPanelOpen ? 'Collapse' : 'Expand'} left panel`}
                title={`${activeLeftPanelOpen ? 'Collapse' : 'Expand'} ${learning ? 'articles' : 'puzzles'} panel`}
                onClick={() => setPanelVisibility(learning ? 'articles' : 'left')}><PanelLeft size={17} /></IconButton>
              {playing && <>
                <IconButton aria-pressed={advancedPanels.right}
                  aria-label={`${advancedPanels.right ? 'Collapse' : 'Expand'} right panel`}
                  title={`${advancedPanels.right ? 'Collapse' : 'Expand'} right panels`}
                  onClick={() => setPanelVisibility('right')}><PanelRight size={17} /></IconButton>
                <IconButton aria-pressed={advancedPanels.bottom}
                  aria-label={`${advancedPanels.bottom ? 'Collapse' : 'Expand'} bottom panel`}
                  title={`${advancedPanels.bottom ? 'Collapse' : 'Expand'} assistance panel`}
                  onClick={() => setPanelVisibility('bottom')}><PanelBottom size={17} /></IconButton>
              </>}
            </div>}
            <IconButton className="desktop-color-mode-toggle" onClick={cycleColorMode}
              aria-label={`Color mode: ${COLOR_MODE_LABELS[appearance.colorMode]}. Switch to ${COLOR_MODE_LABELS[nextColorMode]} mode.`}
              title={`${COLOR_MODE_LABELS[appearance.colorMode]} color mode`}>
              <ColorModeIcon size={19} />
            </IconButton>
            <IconButton ref={menuButtonRef} className="app-menu-trigger" aria-label="Open options menu" title="Options"
              aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => setMenuOpen((open) => !open)}>
              <Menu size={20} />
            </IconButton>
            <Presence open={menuOpen}>{(presence) => <div className="app-menu" id="app-menu" data-presence={presence}
              aria-hidden={presence === 'exit' || undefined} inert={presence === 'exit' || undefined}>
              <Link to="/puzzles/new" onClick={() => setMenuOpen(false)}><Dices size={17} /> New puzzle</Link>
              <div className="mobile-primary-navigation">
                <Link to="/puzzles/browse" onClick={() => setMenuOpen(false)}><Grid3X3 size={17} /> Active Puzzles</Link>
                <Link to="/learn" onClick={() => setMenuOpen(false)}><BookOpen size={17} /> Learn</Link>
                <div className="app-menu-separator" />
              </div>
              {!mobile && <button aria-pressed={workspaceMode === 'advanced'} onClick={() => {
                setMenuOpen(false)
                setWorkspaceMode(workspaceMode === 'advanced' ? 'standard' : 'advanced')
              }}><PanelsTopLeft size={17} /> {workspaceMode === 'advanced' ? 'Standard mode' : 'Advanced mode'}</button>}
              <button className="mobile-menu-only" onClick={cycleColorMode}
                aria-label={`Color mode: ${COLOR_MODE_LABELS[appearance.colorMode]}. Switch to ${COLOR_MODE_LABELS[nextColorMode]} mode.`}>
                <ColorModeIcon size={17} /> Color mode: {COLOR_MODE_LABELS[appearance.colorMode]}
              </button>
              <Link to="/puzzles/statistics" onClick={() => setMenuOpen(false)}>
                <BarChart3 size={17} /> Statistics
              </Link>
              <Link to="/sync" onClick={() => setMenuOpen(false)}><Monitor size={17} /> Device sync</Link>
              <button onClick={() => openSettings()}><SlidersHorizontal size={17} /> Settings</button>
              <Link to="/shortcuts" onClick={() => setMenuOpen(false)}><Keyboard size={17} /> Keyboard shortcuts</Link>
              {playing && game?.source === 'draft' && <button onClick={checkPuzzle}><Check size={17} /> Validate puzzle</button>}
              <div className="app-menu-separator" />
              <button onClick={openImport}><ArrowDownToLine size={17} /> Import</button>
            </div>}</Presence>
          </div>
        </div>
      </header>

      {!standalonePuzzlePage && (puzzlesRoute || (homeRoute && !playRoute && shared === undefined && !(workspaceReady && openingPuzzleLink))) && (
        <PuzzlesPage games={games} active={active} setDifficulty={setDifficulty} newPuzzlePreference={newPuzzleDefaults}
          rememberNewPuzzle={rememberNewPuzzle} preferencesReady={workspaceReady}
          loadingPuzzles={!workspaceReady || (sync.linked && !sync.ready)} onCreatePuzzle={createPuzzle}
          error={homeRoute ? linkError : undefined} />
      )}
      <PlayContent.Provider value={playing && !workspaceReady ? (
        <main className="page workspace-initializing" aria-hidden="true"><div className="workspace" /></main>
      ) : homeRoute && shared !== undefined ? (
        <SharedPuzzlePage key={shared} id={shared} games={games} linked={sync.linked} syncReady={sync.ready} />
      ) : homeRoute && workspaceReady && openingPuzzleLink ? (
        <main className="page sync-page"><h1>Opening puzzle…</h1></main>
      ) : playRoute && !game && !sync.ready ? (
        <main className="page sync-page">
          <p className="sync-connection-label" role="status"><LoaderCircle size={16} className="loading-spinner" aria-hidden="true" /> Loading puzzle…</p>
        </main>
      ) : playRoute && !game ? (
        <main className="page sync-page"><h1>Puzzle unavailable on this device</h1>
          {linkError ? <p role="alert">{linkError}</p> : <p>{sync.linked
            ? sync.message || 'Open this puzzle on your other device and choose Sync now from Puzzle options.'
            : 'Link the device that has this puzzle to open it here.'}</p>}
          <Link className={buttonClassName('primary')} to="/sync">Device sync</Link>
          <Link className={buttonClassName()} to="/puzzles/browse">Return to puzzles</Link>
        </main>
      ) : playing ? (
        <main id="sudoku-workspace" className={`page ${resizeMode ? 'resize-active' : ''} ${workspaceMode === 'advanced' ? 'advanced-workspace-page' : 'standard-workspace-page'}`} aria-label="Sudoku workspace">
          {!storageAvailable && <p className="workspace-error" role="alert">Local storage is unavailable. Changes may be lost.</p>}
          {linkError && <p className="workspace-error" role="alert">{linkError}</p>}
          <PlayWorkspace resizable={desktopStandard}>
            {game || !mobile ? (
              <Worktable game={game ?? pendingWorkspaceGame} placeholder={game ? undefined : emptyPuzzleContent} games={games} storageAvailable={storageAvailable} preferredDifficulty={difficulty}
                modalOpen={panel !== null || menuOpen || resizeMode || settingsRoute}
                advancedModes={advancedModes} appearance={appearance} highlighting={highlighting}
                errorMode={errorMode} cellReferenceStyle={cellReferenceStyle} multi={multi} actionsRef={worktableActions}
                inputSize={inputSize} panelHeight={panelHeight} setPanelHeight={setPanelHeight} beginResize={beginResize}
                toggleMulti={toggleMulti}
                pausedOnLaunch={pausedOnLaunch}
                onResumeLaunch={() => {
                  if (game) playSession.set(game.id, 'launchPaused', false)
                  setOpeningOnLaunch(false)
                }}
                loadingPuzzle={sync.loadingPuzzles}
                sharedOnOtherDevice={Boolean(viewedPuzzle && syncConnection.mode === 'live' && peerPuzzles.includes(viewedPuzzle))}
                catchUpPuzzle={peerPuzzle}
                workspaceMode={workspaceMode}
                showLeftPanel={advancedPanels.left} showRightPanel={advancedPanels.right} showBottomPanel={advancedPanels.bottom}
                onOpenHintPanel={() => setPanelVisibility('bottom', true)}
                onOpenRightPanel={() => setPanelVisibility('right', true)}
                puzzleBrowserView={puzzleBrowserView} setPuzzleBrowserView={setPuzzleBrowserView}
                onNewPuzzle={openNewPuzzle} onEditPuzzle={editPuzzle}
                onCreatePuzzle={() => createPuzzle(game?.algebraic ? 'algebraic-cages'
                  : game?.grid?.size === 8 ? 'eight' : game?.grid?.size === 6 ? 'six' : game?.grid?.size === 5 ? 'jigsaw-five' : game?.grid?.size === 7 ? 'jigsaw-seven' : game?.grid ? 'mini' : undefined,
                boxRows, boxlessDraftLayout)}
                onEditCages={() => setPanel('cages')}
                onEditSizedRules={() => setPanel('sized-rules')} onEditRegions={() => setPanel('jigsaw-regions')}
                onEditChainColors={() => openSettings('chain-colors')}
                onCancelDraft={cancelDraft} onShare={() => setPanel('share')} onPublish={() => setPanel('publish')}
                onStopPlaying={() => {
                  if (!game) return
                  roomStore.saveForLater(game.id)
                  void navigate({ to: '/puzzles/browse' })
                }} />
            ) : (
              <section className="surface empty-board">{emptyPuzzleContent}</section>
            )}
          </PlayWorkspace>
        </main>
      ) : null}>
        {children}
      </PlayContent.Provider>

      <MotionSurface>{playing && resizeMode && <div className="resize-session-bar" role="region" aria-label="Resize panels">
        <span className="resize-session-copy"><strong>Resize input panel</strong><small>Drag the handle or adjust digit size.</small></span>
        <span className="resize-size-controls" role="group" aria-label="Digit size">
          <IconButton aria-label="Decrease digit size" disabled={inputSize <= MIN_INPUT_SIZE}
            onClick={() => setInputSizeState(Math.max(MIN_INPUT_SIZE, inputSize - INPUT_SIZE_STEP))}><Minus size={18} /></IconButton>
          <IconButton aria-label="Increase digit size" disabled={inputSize >= MAX_INPUT_SIZE}
            onClick={() => setInputSizeState(Math.min(MAX_INPUT_SIZE, inputSize + INPUT_SIZE_STEP))}><Plus size={18} /></IconButton>
        </span>
        <span className="resize-session-actions">
          <Button onClick={cancelResize}>Cancel</Button>
          <Button variant="primary" onClick={finishResize}>Save</Button>
        </span>
      </div>}</MotionSurface>

      {panel === 'import' && <ImportPuzzle close={close} onPlay={close} />}
      {panel === 'share' && game && <SharePuzzle key={game.id} game={game} close={close} />}
      {settingsRoute && <Settings close={closeSettings} section={settingsSection}
        advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
        appearance={appearance} setAppearance={setAppearance}
        highlighting={highlighting} setHighlighting={setHighlighting}
        errorMode={errorMode} setErrorMode={setErrorMode} inputSize={inputSize} setInputSize={setInputSize}
        cellReferenceStyle={cellReferenceStyle} setCellReferenceStyle={setCellReferenceStyle}
        workspaceMode={workspaceMode} setWorkspaceMode={mobile ? undefined : setWorkspaceMode}
        draft={game?.source === 'draft'} />}
      {panel === 'publish' && game?.source === 'draft' && <SavePuzzle game={game} close={close} />}
      {panel === 'jigsaw-regions' && game?.grid && 'regions' in game.grid && game.source === 'draft' && <EditJigsawRegions
        game={game} layout={game.grid} close={close} />}
      {panel === 'sized-rules' && game?.grid && game.source === 'draft' && !game.position.draftCages && <EditSizedRules
        key={game.id} game={game} layout={game.grid} close={close} />}
      {panel === 'cages' && game?.position.draftCages && <EditCages game={game} close={close} />}
    </DesktopPlayLayout>
  )
}
