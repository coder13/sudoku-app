import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import {
  DockviewReact,
  type DockviewApi, type DockviewReadyEvent, type IDockviewPanelHeaderProps, type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'
import { PUZZLE_TOOL_ORDER, TOOL_PANEL_ORDER, type ToolPanelTab } from '../sudoku/play-session'
import { animatePanelLayout, motionDuration } from './Presence'

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
  subsets?: ReactNode
  cellColors: ReactNode
  rules?: ReactNode
  hint: ReactNode
  solutionPath: ReactNode
  techniques: ReactNode
  details: ReactNode
  browser: ReactNode
  showLeft: boolean
  showRight: boolean
  showBottom: boolean
  activeToolPanel: ToolPanelTab
  onSelectToolPanel: (tool: ToolPanelTab) => void
  focusHintRequest: number
  focusChainsRequest?: number
  onInputVisibleChange?: (visible: boolean) => void
  onSubsetsVisibleChange?: (visible: boolean) => void
  onChainsVisibleChange?: (visible: boolean) => void
  onColorsVisibleChange?: (visible: boolean) => void
  onSolutionVisibleChange?: (visible: boolean) => void
}
type PanelVisibility = Pick<DockContent, 'showLeft' | 'showRight' | 'showBottom'> & {
  showChains: boolean
  showSubsets: boolean
  showColors: boolean
  showSolution: boolean
  showTechniques: boolean
  showRules: boolean
}
const DockContentContext = createContext<DockContent>({
  puzzle: null, input: null, chains: null, subsets: null, cellColors: null, hint: null, solutionPath: null, techniques: null, details: null, browser: null,
  showLeft: true, showRight: true, showBottom: true, activeToolPanel: 'digits', onSelectToolPanel: () => {}, focusHintRequest: 0,
  focusChainsRequest: 0, onChainsVisibleChange: () => {}, onSolutionVisibleChange: () => {},
})

function PuzzlePanel() {
  return <div className="dock-panel-content dock-puzzle-panel">{useContext(DockContentContext).puzzle}</div>
}

function InputPanel({ api }: IDockviewPanelProps) {
  const { input, onInputVisibleChange } = useContext(DockContentContext)
  useEffect(() => {
    onInputVisibleChange?.(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => onInputVisibleChange?.(isVisible))
    return () => {
      subscription.dispose()
      onInputVisibleChange?.(false)
    }
  }, [api, onInputVisibleChange])
  return <div className="dock-panel-content dock-input-panel">{input}</div>
}

function ChainsDockPanel({ api }: IDockviewPanelProps) {
  const { chains, onChainsVisibleChange } = useContext(DockContentContext)
  useLayoutEffect(() => {
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

function SubsetsDockPanel({ api }: IDockviewPanelProps) {
  const { subsets, onSubsetsVisibleChange } = useContext(DockContentContext)
  useEffect(() => {
    onSubsetsVisibleChange?.(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => onSubsetsVisibleChange?.(isVisible))
    return () => {
      subscription.dispose()
      onSubsetsVisibleChange?.(false)
    }
  }, [api, onSubsetsVisibleChange])
  return <div className="dock-panel-content">{subsets}</div>
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

function RulesDockPanel({ api }: IDockviewPanelProps) {
  const { rules } = useContext(DockContentContext)
  const [visible, setVisible] = useState(api.isVisible)
  useEffect(() => {
    setVisible(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => setVisible(isVisible))
    return () => subscription.dispose()
  }, [api])
  return <div className="dock-panel-content">{visible ? rules : null}</div>
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
  puzzle: PuzzlePanel, input: InputPanel, chains: ChainsDockPanel, subsets: SubsetsDockPanel, cellColors: CellColorsPanel, hint: HintPanel,
  solutionPath: SolutionPathPanel, techniques: TechniquesDockPanel, rules: RulesDockPanel, details: DetailsPanel, browser: BrowserPanel,
}
const dockTools = {
  colors: { id: 'cell-colors', component: 'cellColors', title: 'Colors' },
  chains: { id: 'chains', component: 'chains', title: 'Chains' },
  subsets: { id: 'subsets', component: 'subsets', title: 'Subsets' },
} as const
const dockToolIds: Record<ToolPanelTab, string> = {
  digits: 'input', solution: 'solution-path', techniques: 'techniques', rules: 'rules',
  colors: dockTools.colors.id, chains: dockTools.chains.id, subsets: dockTools.subsets.id,
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

function orderToolTabs(api: DockviewApi) {
  for (const group of api.groups) {
    const tools = TOOL_PANEL_ORDER.flatMap(tool => group.panels.filter(panel => panel.id === dockToolIds[tool]))
    if (tools.length < 2) continue
    let nextTool = 0
    const ordered = group.panels.map(panel => tools.includes(panel) ? tools[nextTool++] : panel)
    const active = group.activePanel
    ordered.forEach((panel, index) => {
      if (group.panels[index] !== panel) panel.api.moveTo({ index, skipSetActive: true })
    })
    if (active && group.activePanel !== active) group.model.openPanel(active, { skipSetGroupActive: true })
  }
}

function syncRightPanels(api: DockviewApi, { showChains, showSubsets, showColors, showSolution, showTechniques, showRules }: PanelVisibility) {
  const input = api.getPanel('input')
  if (!input) return
  const visible = { colors: showColors, chains: showChains, subsets: showSubsets }
  for (const tool of PUZZLE_TOOL_ORDER) {
    const options = dockTools[tool]
    const panel = api.getPanel(options.id)
    if (visible[tool] && !panel) {
      api.addPanel({ ...options, inactive: true, minimumWidth: 240, minimumHeight: 130, position: { referencePanel: input } })
    } else if (!visible[tool] && panel) api.removePanel(panel)
    else if (panel && panel.title !== options.title) panel.api.setTitle(options.title)
  }
  const details = api.getPanel('details') ?? api.addPanel({
      id: 'details', component: 'details', title: 'Puzzle details',
      minimumWidth: 240, minimumHeight: 130, initialHeight: detailsPanelHeight(api),
      position: { referencePanel: input, direction: 'below' },
    })
  const solution = api.getPanel('solution-path')
  if (!showSolution && solution) api.removePanel(solution)
  else if (showSolution && !solution) {
    api.addPanel({
      id: 'solution-path', component: 'solutionPath', title: 'Solution', inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: details, index: details.group.panels.indexOf(details) + 1 },
    })
  }
  const techniques = api.getPanel('techniques')
  if (!showTechniques && techniques) api.removePanel(techniques)
  else if (showTechniques && !techniques) {
    api.addPanel({
      id: 'techniques', component: 'techniques', title: TECHNIQUE_FINDER_TITLE, inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: api.getPanel('solution-path') ?? details },
    })
  } else if (techniques && techniques.title !== TECHNIQUE_FINDER_TITLE) {
    techniques.api.setTitle(TECHNIQUE_FINDER_TITLE)
  }
  const rules = api.getPanel('rules')
  if (!showRules && rules) api.removePanel(rules)
  else if (showRules && !rules) {
    api.addPanel({
      id: 'rules', component: 'rules', title: 'Rules', inactive: true,
      minimumWidth: 240, minimumHeight: 130, position: { referencePanel: details },
    })
  }
  orderToolTabs(api)
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

function syncPanelRegions(api: DockviewApi, visibility: PanelVisibility) {
  const { showLeft, showRight, showBottom } = visibility
  if (showLeft) addBrowserPanel(api)
  else removePanels(api, ['browser'])
  if (showRight) {
    addInputPanel(api)
    syncRightPanels(api, visibility)
  } else removePanels(api, ['rules', 'techniques', 'solution-path', 'cell-colors', 'details', 'chains', 'subsets', 'input'])
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
      const allowed = new Set(['puzzle', 'input', 'chains', 'subsets', 'cell-colors', 'details', 'hint', 'solution-path', 'techniques', 'rules', 'browser'])
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
  puzzle, input, chains, subsets, cellColors, rules, hint, solutionPath, techniques, details, browser, showLeft, showRight, showBottom,
  activeToolPanel, onSelectToolPanel, focusHintRequest, focusChainsRequest,
  onChainsVisibleChange, onInputVisibleChange, onSubsetsVisibleChange, onColorsVisibleChange, onSolutionVisibleChange,
}: DockContent) {
  const [layoutReady, setLayoutReady] = useState(false)
  const apiRef = useRef<DockviewApi | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const saveSubscription = useRef<{ dispose: () => void } | null>(null)
  const saveFrame = useRef<number | null>(null)
  const showChains = chains != null
  const showSubsets = subsets != null
  const showColors = cellColors != null
  const showSolution = solutionPath != null
  const showTechniques = techniques != null
  const showRules = rules != null
  const visibility = useRef<PanelVisibility>({ showLeft, showRight, showBottom, showChains, showSubsets, showColors, showSolution, showTechniques, showRules })
  visibility.current = { showLeft, showRight, showBottom, showChains, showSubsets, showColors, showSolution, showTechniques, showRules }

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
    if (!api) return
    const addingTab = showRight && (
      (showColors && !api.getPanel(dockTools.colors.id)) ||
      (showChains && !api.getPanel(dockTools.chains.id)) ||
      (showSubsets && !api.getPanel(dockTools.subsets.id)) ||
      (showSolution && !api.getPanel('solution-path')) ||
      (showTechniques && !api.getPanel('techniques')) ||
      (showRules && !api.getPanel('rules'))
    )
    const duration = addingTab ? motionDuration('panel') : 0
    const groups = duration ? rootRef.current?.querySelectorAll<HTMLElement>('.dv-groupview') ?? [] : []
    const before = Array.from(groups, element => ({ element, bounds: element.getBoundingClientRect() }))
    syncPanelRegions(api, visibility.current)
    const animations = before.flatMap(({ element, bounds }) => {
      const animation = element.isConnected && animatePanelLayout(element, bounds, duration)
      return animation ? [animation] : []
    })
    return () => animations.forEach(animation => animation.cancel())
  }, [showLeft, showRight, showBottom, showChains, showSubsets, showColors, showSolution, showTechniques, showRules])

  useEffect(() => {
    if (!focusHintRequest || !showBottom) return
    apiRef.current?.getPanel('hint')?.api.setActive()
  }, [focusHintRequest, showBottom])

  useEffect(() => {
    if (showRight && layoutReady) apiRef.current?.getPanel(dockToolIds[activeToolPanel])?.api.setActive()
  }, [activeToolPanel, showRight, layoutReady])

  useEffect(() => {
    if (focusChainsRequest && showRight) apiRef.current?.getPanel('chains')?.api.setActive()
  }, [focusChainsRequest, showRight])

  function ready({ api }: DockviewReadyEvent) {
    apiRef.current = api
    restoreLayout(api)
    if (!api.getPanel('puzzle')) addDefaultPanels(api, visibility.current)
    else syncPanelRegions(api, visibility.current)
    saveLayout(api)
    saveSubscription.current?.dispose()
    saveSubscription.current = api.onDidLayoutChange(() => {
      if (saveFrame.current !== null) cancelAnimationFrame(saveFrame.current)
      saveFrame.current = requestAnimationFrame(() => {
        saveFrame.current = null
        orderToolTabs(api)
        saveLayout(api)
      })
    })
    setLayoutReady(true)
  }

  function selectDockTab(target: EventTarget) {
    const tab = target instanceof Element ? target.closest<HTMLElement>('[data-tab-panel-id]') : null
    if (!tab) return
    const tool = (['digits', ...TOOL_PANEL_ORDER] as const).find(tool => dockToolIds[tool] === tab.dataset.tabPanelId)
    if (tool !== undefined && tool !== activeToolPanel) onSelectToolPanel(tool)
  }

  return (
    <DockContentContext.Provider value={{
      puzzle, input, chains, subsets, cellColors, rules, hint, solutionPath, techniques, details, browser, showLeft, showRight, showBottom,
      activeToolPanel, onSelectToolPanel, focusHintRequest, focusChainsRequest,
      onChainsVisibleChange, onInputVisibleChange, onSubsetsVisibleChange, onColorsVisibleChange, onSolutionVisibleChange,
    }}>
      <section ref={rootRef} className={`desktop-dock ${layoutReady ? 'dock-ready' : ''}`} aria-label="Advanced workspace panels"
        onPointerDownCapture={event => { if (event.button === 0) selectDockTab(event.target) }}
        onKeyDownCapture={event => { if (event.key === 'Enter' || event.key === ' ') selectDockTab(event.target) }}>
        <DockviewReact className="desktop-dockview" theme={sudokuDockTheme} components={components}
          defaultTabComponent={FixedPanelTab} disableFloatingGroups hideBorders disableTabsOverflowList scrollbars="native"
          proportionalLayout dndStrategy="pointer" getTabContextMenuItems={() => []}
          onReady={ready} />
      </section>
    </DockContentContext.Provider>
  )
}
