import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import {
  DockviewReact,
  type DockviewApi, type DockviewReadyEvent, type IDockviewPanelHeaderProps, type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'

const DESKTOP_LAYOUT_KEY = 'sudoku-app:v1:desktop-panel-layout'
const DESKTOP_LAYOUT_VERSION_KEY = 'sudoku-app:v1:desktop-panel-layout-version'
const DESKTOP_LAYOUT_VERSION = '6'
const RESET_DESKTOP_LAYOUT_EVENT = 'sudoku-app:reset-desktop-panel-layout'
const PANEL_GAP = 2
const DEFAULT_BROWSER_PANEL_WIDTH = 260
const DEFAULT_INPUT_PANEL_WIDTH = 350
const DEFAULT_INPUT_PANEL_HEIGHT = 335
const DEFAULT_BOTTOM_PANEL_HEIGHT = 185
const MIN_BOTTOM_PANEL_HEIGHT = 150
const MIN_MAIN_PANEL_HEIGHT = 360
const sudokuDockTheme = {
  name: 'sudoku-app',
  className: 'dockview-theme-light',
  gap: PANEL_GAP,
} as const

type DockContent = {
  puzzle: ReactNode
  input: ReactNode
  chains?: ReactNode
  cellColors: ReactNode
  hint: ReactNode
  solutionPath: ReactNode
  techniques: ReactNode
  details: ReactNode
  browser: ReactNode
  showLeft: boolean
  showRight: boolean
  showBottom: boolean
  focusHintRequest: number
  focusAnalysisRequest: number
  focusSolutionRequest: number
  focusChainsRequest?: number
  focusColorsRequest?: number
  onChainsVisibleChange?: (visible: boolean) => void
  onColorsVisibleChange?: (visible: boolean) => void
  onSolutionVisibleChange?: (visible: boolean) => void
}
type PanelVisibility = Pick<DockContent, 'showLeft' | 'showRight' | 'showBottom'> & { showChains: boolean }
const DockContentContext = createContext<DockContent>({
  puzzle: null, input: null, chains: null, cellColors: null, hint: null, solutionPath: null, techniques: null, details: null, browser: null,
  showLeft: true, showRight: true, showBottom: true, focusHintRequest: 0, focusAnalysisRequest: 0, focusSolutionRequest: 0,
  focusChainsRequest: 0, onChainsVisibleChange: () => {}, onSolutionVisibleChange: () => {},
})

function PuzzlePanel() {
  return <div className="dock-panel-content dock-puzzle-panel">{useContext(DockContentContext).puzzle}</div>
}

function InputPanel() {
  return <div className="dock-panel-content dock-input-panel">{useContext(DockContentContext).input}</div>
}

function ChainsDockPanel({ api }: IDockviewPanelProps) {
  const { chains, onChainsVisibleChange } = useContext(DockContentContext)
  useEffect(() => {
    if (!onChainsVisibleChange) return
    onChainsVisibleChange(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => onChainsVisibleChange(isVisible))
    return () => {
      subscription.dispose()
      onChainsVisibleChange(false)
    }
  }, [api, onChainsVisibleChange])
  return <div className="dock-panel-content">{chains}</div>
}

function CellColorsPanel({ api }: IDockviewPanelProps) {
  const { cellColors, onColorsVisibleChange } = useContext(DockContentContext)
  useEffect(() => {
    onColorsVisibleChange?.(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => onColorsVisibleChange?.(isVisible))
    return () => {
      subscription.dispose()
      onColorsVisibleChange?.(false)
    }
  }, [api, onColorsVisibleChange])
  return <div className="dock-panel-content">{cellColors}</div>
}

function HintPanel() {
  return <div className="dock-panel-content dock-hint-panel">{useContext(DockContentContext).hint}</div>
}

function SolutionPathPanel({ api }: IDockviewPanelProps) {
  const { solutionPath, onSolutionVisibleChange } = useContext(DockContentContext)
  const [visible, setVisible] = useState(api.isVisible)
  useEffect(() => {
    const update = (next: boolean) => {
      setVisible(next)
      onSolutionVisibleChange?.(next)
    }
    update(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => update(isVisible))
    return () => {
      subscription.dispose()
      onSolutionVisibleChange?.(false)
    }
  }, [api, onSolutionVisibleChange])
  return <div className="dock-panel-content dock-solution-panel">{visible ? solutionPath : null}</div>
}

function TechniquesDockPanel({ api }: IDockviewPanelProps) {
  const { techniques } = useContext(DockContentContext)
  const [visible, setVisible] = useState(api.isVisible)
  useEffect(() => {
    setVisible(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => setVisible(isVisible))
    return () => subscription.dispose()
  }, [api])
  return <div className="dock-panel-content dock-analysis-panel">{visible ? techniques : null}</div>
}

function DetailsPanel() {
  return <div className="dock-panel-content dock-details-panel">{useContext(DockContentContext).details}</div>
}

function BrowserPanel() {
  return <div className="dock-panel-content dock-browser-panel">{useContext(DockContentContext).browser}</div>
}

function FixedPanelTab(props: IDockviewPanelHeaderProps) {
  return <span className="dock-panel-tab"
    title={`Move ${(props.api.title ?? props.api.id).toLowerCase()} panel; drop in another panel’s center to add it as a tab`}>
    <span>{props.api.title ?? props.api.id}</span>
    <GripVertical size={13} aria-hidden="true" />
  </span>
}

const components = {
  puzzle: PuzzlePanel, input: InputPanel, chains: ChainsDockPanel, cellColors: CellColorsPanel, hint: HintPanel,
  solutionPath: SolutionPathPanel, techniques: TechniquesDockPanel, details: DetailsPanel, browser: BrowserPanel,
}

function addBrowserPanel(api: DockviewApi) {
  const puzzle = api.getPanel('puzzle')
  if (!puzzle || api.getPanel('browser')) return
  api.addPanel({
    id: 'browser', component: 'browser', title: 'Puzzles',
    minimumWidth: 230, minimumHeight: 240, initialWidth: DEFAULT_BROWSER_PANEL_WIDTH,
    position: { referencePanel: puzzle, direction: 'left' },
  })
}

function addInputPanel(api: DockviewApi) {
  const puzzle = api.getPanel('puzzle')
  if (!puzzle || api.getPanel('input')) return
  api.addPanel({
    id: 'input', component: 'input', title: 'Input',
    minimumWidth: 260, minimumHeight: 250, initialWidth: DEFAULT_INPUT_PANEL_WIDTH,
    position: { referencePanel: puzzle, direction: 'right' },
  })
}

function bottomPanelHeight(api: DockviewApi) {
  const spaceBelowMainPanel = availableHeight(api) - MIN_MAIN_PANEL_HEIGHT
  return Math.min(DEFAULT_BOTTOM_PANEL_HEIGHT, Math.max(MIN_BOTTOM_PANEL_HEIGHT, spaceBelowMainPanel))
}

function detailsPanelHeight(api: DockviewApi) {
  return Math.max(MIN_BOTTOM_PANEL_HEIGHT, availableHeight(api) - DEFAULT_INPUT_PANEL_HEIGHT)
}

function addHintPanel(api: DockviewApi) {
  if (api.getPanel('hint')) return
  const puzzle = api.getPanel('puzzle')
  if (!puzzle) return
  api.addPanel({
    id: 'hint', component: 'hint', title: 'Hint', inactive: true,
    minimumWidth: 240, minimumHeight: 130, initialHeight: bottomPanelHeight(api),
    position: { referencePanel: puzzle, direction: 'below' },
  })
}

function addRightPanels(api: DockviewApi, showChains: boolean) {
  const input = api.getPanel('input')
  if (!input) return
  if (showChains && !api.getPanel('chains')) {
    api.addPanel({
      id: 'chains', component: 'chains', title: 'Chains', inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: input },
    })
  } else if (!showChains) removePanels(api, ['chains'])
  const details = api.getPanel('details') ?? api.addPanel({
      id: 'details', component: 'details', title: 'Puzzle details',
      minimumWidth: 240, minimumHeight: 130, initialHeight: detailsPanelHeight(api),
      position: { referencePanel: input, direction: 'below' },
    })
  const colors = api.getPanel('cell-colors')
  if (!colors) {
    api.addPanel({
      id: 'cell-colors', component: 'cellColors', title: 'Colors', inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: details, index: 1 },
    })
  } else if (colors.title === 'Cell colors') colors.api.setTitle('Colors')
  if (!api.getPanel('solution-path')) {
    api.addPanel({
      id: 'solution-path', component: 'solutionPath', title: 'Solution', inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: details },
    })
  }
  const solution = api.getPanel('solution-path')
  const techniques = api.getPanel('techniques')
  if (solution && !techniques) {
    api.addPanel({
      id: 'techniques', component: 'techniques', title: 'Available techniques', inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: solution },
    })
  } else if (techniques && techniques.title !== 'Available techniques') {
    techniques.api.setTitle('Available techniques')
  }
}

function availableHeight(api: DockviewApi) {
  return api.height || Math.max(0, document.documentElement.clientHeight - 64)
}

function removePanels(api: DockviewApi, ids: string[]) {
  for (const id of ids) {
    const panel = api.getPanel(id)
    if (panel) api.removePanel(panel)
  }
}

function syncPanelRegions(api: DockviewApi, { showLeft, showRight, showBottom, showChains }: PanelVisibility) {
  if (showLeft) addBrowserPanel(api)
  else removePanels(api, ['browser'])
  if (showRight) {
    addInputPanel(api)
    addRightPanels(api, showChains)
  } else removePanels(api, ['techniques', 'solution-path', 'cell-colors', 'details', 'chains', 'input'])
  if (showBottom) addHintPanel(api)
  else removePanels(api, ['hint'])
}

function addDefaultPanels(api: DockviewApi, visibility: PanelVisibility) {
  api.addPanel({
    id: 'puzzle', component: 'puzzle', title: 'Puzzle',
    minimumWidth: 340, minimumHeight: 300,
  })
  syncPanelRegions(api, visibility)
}

function saveLayout(api: DockviewApi) {
  try {
    localStorage.setItem(DESKTOP_LAYOUT_KEY, JSON.stringify(api.toJSON()))
    localStorage.setItem(DESKTOP_LAYOUT_VERSION_KEY, DESKTOP_LAYOUT_VERSION)
  }
  catch { /* The layout remains active for this session. */ }
}

function restoreLayout(api: DockviewApi) {
  try {
    const saved = localStorage.getItem(DESKTOP_LAYOUT_KEY)
    const version = localStorage.getItem(DESKTOP_LAYOUT_VERSION_KEY)
    if (saved && version === DESKTOP_LAYOUT_VERSION) {
      api.fromJSON(JSON.parse(saved))
      const panelIds = new Set(api.panels.map(({ id }) => id))
      const allowed = new Set(['puzzle', 'input', 'chains', 'cell-colors', 'details', 'hint', 'solution-path', 'techniques', 'browser'])
      if (panelIds.has('puzzle') && [...panelIds].every((id) => allowed.has(id))) return
    }
  } catch { /* Fall back to the default layout. */ }
  api.clear()
}

export function resetDesktopPanelLayout() {
  try {
    localStorage.removeItem(DESKTOP_LAYOUT_KEY)
    localStorage.removeItem(DESKTOP_LAYOUT_VERSION_KEY)
  }
  catch { /* The active layout can still be reset. */ }
  window.dispatchEvent(new Event(RESET_DESKTOP_LAYOUT_EVENT))
}

export function DesktopDockLayout({
  puzzle, input, chains, cellColors, hint, solutionPath, techniques, details, browser, showLeft, showRight, showBottom,
  focusHintRequest, focusAnalysisRequest, focusSolutionRequest, focusChainsRequest, focusColorsRequest,
  onChainsVisibleChange, onColorsVisibleChange, onSolutionVisibleChange,
}: DockContent) {
  const [layoutReady, setLayoutReady] = useState(false)
  const apiRef = useRef<DockviewApi | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const saveSubscription = useRef<{ dispose: () => void } | null>(null)
  const saveFrame = useRef<number | null>(null)
  const showChains = chains !== null && chains !== undefined
  const visibility = useRef({ showLeft, showRight, showBottom, showChains })
  visibility.current = { showLeft, showRight, showBottom, showChains }

  useEffect(() => {
    let dockInteraction = false
    function scheduleSave() {
      if (saveFrame.current !== null) cancelAnimationFrame(saveFrame.current)
      saveFrame.current = requestAnimationFrame(() => {
        saveFrame.current = null
        if (apiRef.current) saveLayout(apiRef.current)
      })
    }
    function handlePointerDown(event: PointerEvent) {
      dockInteraction = Boolean(rootRef.current?.contains(event.target as Node))
    }
    function handlePointerEnd() {
      if (!dockInteraction) return
      dockInteraction = false
      scheduleSave()
    }
    function saveBeforeLeaving() {
      if (apiRef.current) saveLayout(apiRef.current)
    }
    function reset() {
      const api = apiRef.current
      if (!api) return
      api.clear()
      addDefaultPanels(api, visibility.current)
      saveLayout(api)
    }
    window.addEventListener(RESET_DESKTOP_LAYOUT_EVENT, reset)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    window.addEventListener('pagehide', saveBeforeLeaving)
    return () => {
      window.removeEventListener(RESET_DESKTOP_LAYOUT_EVENT, reset)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
      window.removeEventListener('pagehide', saveBeforeLeaving)
      if (saveFrame.current !== null) cancelAnimationFrame(saveFrame.current)
      saveSubscription.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const api = apiRef.current
    if (api) syncPanelRegions(api, { showLeft, showRight, showBottom, showChains })
  }, [showLeft, showRight, showBottom, showChains])

  useEffect(() => {
    if (!focusHintRequest || !showBottom) return
    apiRef.current?.getPanel('hint')?.api.setActive()
  }, [focusHintRequest, showBottom])

  useEffect(() => {
    if (focusAnalysisRequest && showRight) apiRef.current?.getPanel('techniques')?.api.setActive()
  }, [focusAnalysisRequest, showRight])

  useEffect(() => {
    if (focusSolutionRequest && showRight) apiRef.current?.getPanel('solution-path')?.api.setActive()
  }, [focusSolutionRequest, showRight])

  useEffect(() => {
    if (focusChainsRequest && showRight) apiRef.current?.getPanel('chains')?.api.setActive()
  }, [focusChainsRequest, showRight])

  useEffect(() => {
    if (focusColorsRequest && showRight) apiRef.current?.getPanel('cell-colors')?.api.setActive()
  }, [focusColorsRequest, showRight])

  function ready({ api }: DockviewReadyEvent) {
    apiRef.current = api
    restoreLayout(api)
    if (!api.getPanel('puzzle')) addDefaultPanels(api, { showLeft, showRight, showBottom, showChains })
    else syncPanelRegions(api, { showLeft, showRight, showBottom, showChains })
    saveLayout(api)
    saveSubscription.current?.dispose()
    saveSubscription.current = api.onDidLayoutChange(() => {
      if (saveFrame.current !== null) cancelAnimationFrame(saveFrame.current)
      saveFrame.current = requestAnimationFrame(() => {
        saveFrame.current = null
        saveLayout(api)
      })
    })
    setLayoutReady(true)
  }

  return (
    <DockContentContext.Provider value={{
      puzzle, input, chains, cellColors, hint, solutionPath, techniques, details, browser, showLeft, showRight, showBottom,
      focusHintRequest, focusAnalysisRequest, focusSolutionRequest, focusChainsRequest, focusColorsRequest,
      onChainsVisibleChange, onColorsVisibleChange, onSolutionVisibleChange,
    }}>
      <section ref={rootRef} className={`desktop-dock ${layoutReady ? 'dock-ready' : ''}`} aria-label="Advanced workspace panels">
        <DockviewReact className="desktop-dockview" theme={sudokuDockTheme} components={components}
          defaultTabComponent={FixedPanelTab} disableFloatingGroups hideBorders
          proportionalLayout dndStrategy="pointer" getTabContextMenuItems={() => []}
          onReady={ready} />
      </section>
    </DockContentContext.Provider>
  )
}
