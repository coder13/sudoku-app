import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical, Scaling } from 'lucide-react'
import {
  DockviewReact,
  type DockviewApi, type DockviewReadyEvent, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { PUZZLE_TOOL_ORDER, TOOL_PANEL_ORDER, type PuzzleTool, type ToolPanelTab } from '../sudoku/play-session'
import { animatePanelLayout, motionDuration } from './Presence'

import { IconButton } from './Button'
import { Modal } from './Modal'
import { ResizeStepControls } from './ResizeStepControls'
import { DESKTOP_PANEL_LAYOUT_KEY, DESKTOP_PANEL_LAYOUT_VERSION_KEY } from '../sudoku/preferences'
import { notifySettingsEdit } from '../sudoku/settings-events'
import { PLAY_PANEL_ORDER, PLAY_TOOL_REGISTRY } from './PlayToolRegistry'
import { PanelActivityBoundary, type PanelActivity } from './PanelActivity'

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
  tools: Partial<Record<PuzzleTool, ReactNode>>
  onToolVisibilityChange?: Partial<Record<PuzzleTool, (visible: boolean) => void>>
  hint: ReactNode
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
}
type PanelVisibility = Pick<DockContent, 'showLeft' | 'showRight' | 'showBottom'> & {
  showChains: boolean
  showBookmarks: boolean
  showColors: boolean
  showSolution: boolean
  showTechniques: boolean
  showRules: boolean
}
const DockContentContext = createContext<DockContent>({
  puzzle: null, input: null, tools: {}, hint: null, details: null, browser: null,
  showLeft: true, showRight: true, showBottom: true, activeToolPanel: 'digits', onSelectToolPanel: () => {}, focusHintRequest: 0,
  focusChainsRequest: 0,
})

function useDockPanelVisibility(api: IDockviewPanelProps['api'], onChange?: (visible: boolean) => void) {
  const [visible, setVisible] = useState(api.isVisible)
  useLayoutEffect(() => {
    const update = (next: boolean) => {
      setVisible(next)
      onChange?.(next)
    }
    update(api.isVisible)
    const subscription = api.onDidVisibilityChange(({ isVisible }) => update(isVisible))
    return () => {
      subscription.dispose()
      onChange?.(false)
    }
  }, [api, onChange])
  return visible
}

function PuzzlePanel() {
  return <div className="dock-panel-content dock-puzzle-panel" data-dock-puzzle-panel>{useContext(DockContentContext).puzzle}</div>
}

function InputPanel({ api }: IDockviewPanelProps) {
  const { input, onInputVisibleChange } = useContext(DockContentContext)
  useDockPanelVisibility(api, onInputVisibleChange)
  return <div className="dock-panel-content dock-input-panel">{input}</div>
}

function HintPanel() {
  return <div className="dock-panel-content dock-hint-panel">{useContext(DockContentContext).hint}</div>
}

const dockToolClasses: Partial<Record<PuzzleTool, string>> = {
  solution: 'dock-solution-panel', techniques: 'dock-analysis-panel',
}

function createToolDockPanel(tool: PuzzleTool) {
  function ToolDockPanel({ api }: IDockviewPanelProps) {
    const { tools, onToolVisibilityChange } = useContext(DockContentContext)
    const visible = useDockPanelVisibility(api, onToolVisibilityChange?.[tool])
    const activity: PanelActivity = visible ? 'active' : 'inactive'
    const className = ['dock-panel-content', dockToolClasses[tool]].filter(Boolean).join(' ')
    return <PanelActivityBoundary activity={activity}><div className={className}>{tools[tool]}</div></PanelActivityBoundary>
  }
  ToolDockPanel.displayName = `${PLAY_TOOL_REGISTRY[tool].label}DockPanel`
  return ToolDockPanel
}

const toolDockPanels = Object.fromEntries(PUZZLE_TOOL_ORDER.map(tool => [tool, createToolDockPanel(tool)]))

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

type ResizeAxis = 'width' | 'height'
type DockGridNode = ReturnType<DockviewApi['toJSON']>['grid']['root']

function findResizeAxes(node: DockGridNode, groupId: string, axis: ResizeAxis): ResizeAxis[] | undefined {
  if (!Array.isArray(node.data)) return node.data.id === groupId ? [] : undefined
  for (const child of node.data) {
    const axes = findResizeAxes(child, groupId, axis === 'width' ? 'height' : 'width')
    if (axes) return node.data.length > 1 && !axes.includes(axis) ? [...axes, axis] : axes
  }
}

function DockResizeOptions({ api, group, containerApi, activePanel }: IDockviewHeaderActionsProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [axes, setAxes] = useState<ResizeAxis[] | null>(null)
  const [size, setSize] = useState({ width: api.width, height: api.height })
  const title = `Resize ${activePanel?.api.title ?? 'workspace'} panel`

  if (containerApi.groups.length < 2) return null

  function openOptions() {
    const { root, orientation } = containerApi.toJSON().grid
    const available = findResizeAxes(root, api.id, orientation === 'HORIZONTAL' ? 'width' : 'height') ?? []
    setSize({ width: api.width, height: api.height })
    setAxes(available)
  }

  return <>
    <IconButton ref={trigger} variant="quiet" className="dock-resize-options" aria-label={title} title={title}
      aria-haspopup="dialog" onPointerDown={event => event.stopPropagation()} onClick={openOptions}>
      <Scaling size={15} aria-hidden="true" />
    </IconButton>
    <Modal title={title} className="resize-options-dialog" open={axes !== null} onClose={() => setAxes(null)}
      returnFocus={() => trigger.current}>
      {axes?.includes('width') && <ResizeStepControls axis="width" atMin={size.width <= group.minimumWidth}
        atMax={size.width >= group.maximumWidth} onStep={delta => {
          api.setSize({ width: api.width + delta })
          setSize({ width: api.width, height: api.height })
        }} />}
      {axes?.includes('height') && <ResizeStepControls axis="height" atMin={size.height <= group.minimumHeight}
        atMax={size.height >= group.maximumHeight} onStep={delta => {
          api.setSize({ height: api.height + delta })
          setSize({ width: api.width, height: api.height })
        }} />}
    </Modal>
  </>
}

const components = {
  puzzle: PuzzlePanel, input: InputPanel, chains: toolDockPanels.chains, cellColors: toolDockPanels.colors, hint: HintPanel,
  bookmarks: toolDockPanels.bookmarks,
  solutionPath: toolDockPanels.solution, techniques: toolDockPanels.techniques, rules: toolDockPanels.rules, details: DetailsPanel, browser: BrowserPanel,
  // Restore saved layouts before removing their retired panel.
  subsets: () => null,
}
type DockComponent = keyof typeof components
type DockToolBinding = { panelId: string; component: DockComponent }
const dockBindings = {
  solution: { panelId: 'solution-path', component: 'solutionPath' },
  techniques: { panelId: 'techniques', component: 'techniques' },
  colors: { panelId: 'cell-colors', component: 'cellColors' },
  chains: { panelId: 'chains', component: 'chains' },
  bookmarks: { panelId: 'bookmarks', component: 'bookmarks' },
  rules: { panelId: 'rules', component: 'rules' },
} satisfies Record<PuzzleTool, DockToolBinding>
const dockTools = Object.fromEntries(PUZZLE_TOOL_ORDER.map(tool => [tool, {
  id: dockBindings[tool].panelId,
  component: dockBindings[tool].component,
  title: PLAY_TOOL_REGISTRY[tool].label,
}])) as Record<PuzzleTool, { id: string; component: DockComponent; title: string }>
const dockToolIds: Record<ToolPanelTab, string> = {
  digits: 'input',
  solution: dockBindings.solution.panelId,
  techniques: dockBindings.techniques.panelId,
  colors: dockBindings.colors.panelId,
  chains: dockBindings.chains.panelId,
  bookmarks: dockBindings.bookmarks.panelId,
  rules: dockBindings.rules.panelId,
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

function syncRightPanels(api: DockviewApi, { showChains, showBookmarks, showColors, showSolution, showTechniques, showRules }: PanelVisibility) {
  const input = api.getPanel('input')
  if (!input) return
  const visible = { colors: showColors, chains: showChains, bookmarks: showBookmarks }
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
  const solution = api.getPanel(dockBindings.solution.panelId)
  if (!showSolution && solution) api.removePanel(solution)
  else if (showSolution && !solution) {
    api.addPanel({
      id: dockBindings.solution.panelId, component: dockBindings.solution.component,
      title: PLAY_TOOL_REGISTRY.solution.label, inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: details, index: details.group.panels.indexOf(details) + 1 },
    })
  }
  const techniques = api.getPanel(dockBindings.techniques.panelId)
  if (!showTechniques && techniques) api.removePanel(techniques)
  else if (showTechniques && !techniques) {
    api.addPanel({
      id: dockBindings.techniques.panelId, component: dockBindings.techniques.component,
      title: PLAY_TOOL_REGISTRY.techniques.label, inactive: true,
      minimumWidth: 240, minimumHeight: 130,
      position: { referencePanel: api.getPanel(dockBindings.solution.panelId) ?? details },
    })
  } else if (techniques && techniques.title !== PLAY_TOOL_REGISTRY.techniques.label) {
    techniques.api.setTitle(PLAY_TOOL_REGISTRY.techniques.label)
  }
  const rules = api.getPanel(dockBindings.rules.panelId)
  if (!showRules && rules) api.removePanel(rules)
  else if (showRules && !rules) {
    api.addPanel({
      id: dockBindings.rules.panelId, component: dockBindings.rules.component,
      title: PLAY_TOOL_REGISTRY.rules.label, inactive: true,
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
  } else removePanels(api, [dockBindings.rules.panelId, dockBindings.techniques.panelId, dockBindings.solution.panelId,
    'details', ...Object.values(dockTools).map(tool => tool.id), 'input'])
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
    localStorage.setItem(DESKTOP_PANEL_LAYOUT_KEY, JSON.stringify(api.toJSON()))
    localStorage.setItem(DESKTOP_PANEL_LAYOUT_VERSION_KEY, DESKTOP_LAYOUT_VERSION)
    notifySettingsEdit()
  }
  catch { /* The layout remains active for this session. */ }
}

function restoreLayout(api: DockviewApi) {
  try {
    const saved = localStorage.getItem(DESKTOP_PANEL_LAYOUT_KEY)
    const version = localStorage.getItem(DESKTOP_PANEL_LAYOUT_VERSION_KEY)
    if (saved && version === DESKTOP_LAYOUT_VERSION) {
      api.fromJSON(JSON.parse(saved))
      removePanels(api, ['subsets'])
      const panelIds = new Set(api.panels.map(({ id }) => id))
      const allowed = new Set(['puzzle', 'input', 'details', 'hint', dockBindings.solution.panelId, dockBindings.techniques.panelId,
        dockBindings.rules.panelId, 'browser', ...Object.values(dockTools).map(tool => tool.id)])
      if (panelIds.has('puzzle') && [...panelIds].every((id) => allowed.has(id))) return
    }
  } catch { /* Fall back to the default layout. */ }
  api.clear()
}

export function resetDesktopPanelLayout() {
  try {
    localStorage.removeItem(DESKTOP_PANEL_LAYOUT_KEY)
    localStorage.removeItem(DESKTOP_PANEL_LAYOUT_VERSION_KEY)
    notifySettingsEdit()
  }
  catch { /* The active layout can still be reset. */ }
  window.dispatchEvent(new Event(RESET_DESKTOP_LAYOUT_EVENT))
}

export function DesktopDockLayout({
  puzzle, input, tools, onToolVisibilityChange, hint, details, browser, showLeft, showRight, showBottom,
  activeToolPanel, onSelectToolPanel, focusHintRequest, focusChainsRequest,
  onInputVisibleChange,
}: DockContent) {
  const [layoutReady, setLayoutReady] = useState(false)
  const apiRef = useRef<DockviewApi | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const saveSubscription = useRef<{ dispose: () => void } | null>(null)
  const saveFrame = useRef<number | null>(null)
  const showChains = tools.chains != null
  const showBookmarks = tools.bookmarks != null
  const showColors = tools.colors != null
  const showSolution = tools.solution != null
  const showTechniques = tools.techniques != null
  const showRules = tools.rules != null
  const visibility = useRef<PanelVisibility>({ showLeft, showRight, showBottom, showChains, showBookmarks, showColors, showSolution, showTechniques, showRules })
  visibility.current = { showLeft, showRight, showBottom, showChains, showBookmarks, showColors, showSolution, showTechniques, showRules }

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
    function restoreSyncedLayout(event: StorageEvent) {
      if (event.storageArea !== localStorage || (event.key !== null
        && event.key !== DESKTOP_PANEL_LAYOUT_KEY && event.key !== DESKTOP_PANEL_LAYOUT_VERSION_KEY)) return
      const api = apiRef.current
      if (!api) return
      api.clear()
      restoreLayout(api)
    }
    window.addEventListener(RESET_DESKTOP_LAYOUT_EVENT, reset)
    window.addEventListener('storage', restoreSyncedLayout)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    window.addEventListener('pagehide', saveBeforeLeaving)
    return () => {
      window.removeEventListener(RESET_DESKTOP_LAYOUT_EVENT, reset)
      window.removeEventListener('storage', restoreSyncedLayout)
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
      (showBookmarks && !api.getPanel(dockTools.bookmarks.id)) ||
      (showSolution && !api.getPanel(dockBindings.solution.panelId)) ||
      (showTechniques && !api.getPanel(dockBindings.techniques.panelId)) ||
      (showRules && !api.getPanel(dockBindings.rules.panelId))
    )
    const duration = addingTab ? motionDuration('tabs') : 0
    const groups = duration ? api.groups.map(group => group.element) : []
    const before = groups.map(element => ({ element, bounds: element.getBoundingClientRect() }))
    syncPanelRegions(api, visibility.current)
    const animations = before.flatMap(({ element, bounds }) => {
      const animation = element.isConnected && animatePanelLayout(element, bounds, duration)
      return animation ? [animation] : []
    })
    return () => animations.forEach(animation => animation.cancel())
  }, [showLeft, showRight, showBottom, showChains, showBookmarks, showColors, showSolution, showTechniques, showRules])

  useEffect(() => {
    if (!focusHintRequest || !showBottom) return
    apiRef.current?.getPanel('hint')?.api.setActive()
  }, [focusHintRequest, showBottom])

  useEffect(() => {
    if (showRight && layoutReady) apiRef.current?.getPanel(dockToolIds[activeToolPanel])?.api.setActive()
  }, [activeToolPanel, showRight, layoutReady])

  useEffect(() => {
    if (focusChainsRequest && showRight) apiRef.current?.getPanel(dockBindings.chains.panelId)?.api.setActive()
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
    const tool = PLAY_PANEL_ORDER.find(tool => dockToolIds[tool] === tab.dataset.tabPanelId)
    if (tool !== undefined && tool !== activeToolPanel) onSelectToolPanel(tool)
  }

  return (
    <DockContentContext.Provider value={{
      puzzle, input, tools, onToolVisibilityChange, hint, details, browser, showLeft, showRight, showBottom,
      activeToolPanel, onSelectToolPanel, focusHintRequest, focusChainsRequest,
      onInputVisibleChange,
    }}>
      <section ref={rootRef} className={`desktop-dock ${layoutReady ? 'dock-ready' : ''}`} aria-label="Advanced workspace panels"
        onPointerDownCapture={event => { if (event.button === 0) selectDockTab(event.target) }}
        onKeyDownCapture={event => { if (event.key === 'Enter' || event.key === ' ') selectDockTab(event.target) }}>
        <DockviewReact className="desktop-dockview" theme={sudokuDockTheme} components={components}
          defaultTabComponent={FixedPanelTab} rightHeaderActionsComponent={DockResizeOptions} disableFloatingGroups hideBorders disableTabsOverflowList scrollbars="native"
          proportionalLayout dndStrategy="pointer" getTabContextMenuItems={() => []}
          onReady={ready} />
      </section>
    </DockContentContext.Provider>
  )
}
