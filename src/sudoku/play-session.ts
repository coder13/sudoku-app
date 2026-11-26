import type { DigitHighlightMatch } from './highlighting.ts'
import { isHintStage, type HintStage } from './hints.ts'
import { readLegacyDesktopToolPanels } from './play-preferences.ts'

export const PUZZLE_TOOL_ORDER = ['colors', 'chains', 'bookmarks'] as const
export const TOOL_PANEL_ORDER = ['solution', 'techniques', ...PUZZLE_TOOL_ORDER, 'rules'] as const
export type PuzzleTool = typeof TOOL_PANEL_ORDER[number]
export type ToolPanelTab = 'digits' | PuzzleTool
export type ToolPanels = { open: PuzzleTool[]; active: ToolPanelTab; height?: number }
export const defaultToolPanels: ToolPanels = { open: [], active: 'digits' }

type PanelSelection<Panel extends string, Active extends string | null> = { open: Panel[]; active: Active }

/** Add requested panels in their shared display order and activate the requested tab. */
export function selectPanelState<Panel extends string, Active extends string | null, State extends PanelSelection<Panel, Active>>(
  current: State,
  active: Active,
  requested: readonly Panel[],
  order: readonly Panel[],
): State {
  const requestedPanels = new Set([...current.open, ...requested])
  const open = order.filter(panel => requestedPanels.has(panel))
  if (current.active === active && open.length === current.open.length && open.every((panel, index) => panel === current.open[index])) return current
  return { ...current, open, active } as State
}

/** Remove a panel and let each host choose its active-tab fallback policy. */
export function closePanelState<Panel extends string, Active extends string | null, State extends PanelSelection<Panel, Active>>(
  current: State,
  panel: Panel,
  fallback: (open: Panel[]) => Active,
): State {
  const open = current.open.filter(tab => tab !== panel)
  if (open.length === current.open.length) return current
  return { ...current, open, active: (current.active as string | null) === panel ? fallback(open) : current.active } as State
}

/** Change the persisted tool selection without depending on a particular panel host. */
export function selectPlayToolPanel(current: ToolPanels, tab: ToolPanelTab, alsoOpen?: PuzzleTool): ToolPanels {
  const requested = [...(tab === 'digits' ? [] : [tab]), ...(alsoOpen ? [alsoOpen] : [])]
  return selectPanelState<PuzzleTool, ToolPanelTab, ToolPanels>(current, tab, requested, TOOL_PANEL_ORDER)
}

/** Close a saved tool and return to Digits when the active panel closes. */
export function closePlayToolPanel(current: ToolPanels, tool: PuzzleTool): ToolPanels {
  const next = closePanelState<PuzzleTool, ToolPanelTab, ToolPanels>(current, tool, () => 'digits')
  return next.open.length ? next : defaultToolPanels
}

export type DigitHighlight = { mask: number; match: DigitHighlightMatch }
export const defaultDigitHighlight: DigitHighlight = { mask: 0, match: 'all' }
type SolutionView = { identity: string; step: number; hintOpen: boolean; hidden?: true }
export type HintSource = 'suggested' | 'all' | { technique: string }
export type SavedHintView = {
  position: string
  source: HintSource
  index: number
  stage: HintStage
  choice?: string
  visuals?: 'player'
  reviewingRemoval?: true
}

type PuzzleTabs = {
  toolPanels: ToolPanels
  drawingIntent: boolean | null
  digitHighlight: DigitHighlight
  showStrongLinks: boolean
  solutionView: SolutionView | null
  hintOpen: boolean
  hintView?: SavedHintView
  desktopHintSize?: number
}
export type PlaySession = PuzzleTabs & { puzzleId: string | null; launchPaused: boolean }
export type PlaySessionField = keyof Omit<PlaySession, 'puzzleId'>
export type PlaySessionUpdate<K extends PlaySessionField> = PlaySession[K] | ((previous: PlaySession[K]) => PlaySession[K])
type SavedPuzzleTabs = Partial<PuzzleTabs> & { mobileInput?: Partial<ToolPanels> }
type ToolLayout = Pick<ToolPanels, 'open' | 'active'>
const defaultTabs: PuzzleTabs = {
  toolPanels: defaultToolPanels, drawingIntent: null, digitHighlight: defaultDigitHighlight,
  showStrongLinks: false, solutionView: null, hintOpen: false,
}
const initial: PlaySession = { ...defaultTabs, puzzleId: null, launchPaused: false }
const key = 'sudoku-app:v1:play-session'
const toolPanelLayoutKey = 'sudoku-app:v1:tool-panel-layout'
const legacyMobileLayoutKey = 'sudoku-app:v1:mobile-input-layout'
type PlayStorage = Pick<Storage, 'getItem' | 'setItem'>
export const puzzleTabsKey = (id: string) => `sudoku-app:v1:puzzle-tabs:${id}`

function readToolLayout(input: unknown, fromDesktop = false): ToolLayout {
  const savedTools = input && typeof input === 'object' && 'open' in input ? input.open : undefined
  const active = input && typeof input === 'object' && 'active' in input ? input.active : undefined
  const open = Array.isArray(savedTools) ? TOOL_PANEL_ORDER.filter(tool => savedTools.includes(tool)) : []
  return { open, active: open.find(tool => tool === active) ?? (fromDesktop ? open[0] : undefined) ?? 'digits' }
}

function readHintView(view: SavedHintView | undefined): SavedHintView | undefined {
  if (!view || typeof view.position !== 'string' || !Number.isSafeInteger(view.index) || view.index < 0 || !isHintStage(view.stage)) return
  const source = view.source
  if (source !== 'suggested' && source !== 'all' &&
    (!source || typeof source !== 'object' || typeof source.technique !== 'string' || !source.technique)) return
  return {
    position: view.position,
    source: typeof source === 'object' ? { technique: source.technique } : source,
    index: view.index,
    stage: view.stage,
    ...(typeof view.choice === 'string' ? { choice: view.choice } : {}),
    ...(view.visuals === 'player' ? { visuals: 'player' } : {}),
    ...(view.reviewingRemoval === true ? { reviewingRemoval: true } : {}),
  }
}

function readTabs(value: SavedPuzzleTabs, legacyDesktop: ToolLayout): PuzzleTabs {
  const input = value.toolPanels ?? value.mobileInput
  const height = input?.height
  const layout = readToolLayout(input)
  const highlight = value.digitHighlight
  const solution = value.solutionView
  const hintView = value.hintOpen === true ? readHintView(value.hintView) : undefined
  return {
    toolPanels: {
      ...(value.toolPanels !== undefined || layout.open.length || height ? layout : legacyDesktop),
      ...(typeof height === 'number' && Number.isFinite(height) && height > 0 ? { height } : {}),
    },
    drawingIntent: typeof value?.drawingIntent === 'boolean' ? value.drawingIntent : null,
    digitHighlight: highlight && Number.isInteger(highlight.mask) && highlight.mask >= 0 && highlight.mask <= 0x1ff
      ? { mask: highlight.mask, match: highlight.match === 'any' ? 'any' : 'all' }
      : defaultDigitHighlight,
    showStrongLinks: value?.showStrongLinks === true,
    hintOpen: value?.hintOpen === true,
    ...(hintView ? { hintView } : {}),
    ...(typeof value?.desktopHintSize === 'number' && Number.isFinite(value.desktopHintSize) && value.desktopHintSize >= 96
      ? { desktopHintSize: Math.min(4000, value.desktopHintSize) } : {}),
    solutionView: solution && typeof solution.identity === 'string' && Number.isSafeInteger(solution.step) && solution.step >= 0
      ? { identity: solution.identity, step: solution.step, hintOpen: solution.hintOpen === true,
        ...(solution.hidden === true ? { hidden: true } : {}) }
      : null,
  }
}

export function createPlaySession(storage?: PlayStorage, persistentStorage?: PlayStorage) {
  const durable = () => persistentStorage ?? (storage ? undefined : localStorage)
  let current = initial
  let legacyDesktop: ToolLayout = defaultToolPanels
  let lastToolLayout: ToolLayout = defaultToolPanels
  try {
    const target = durable()
    if (target) {
      legacyDesktop = readToolLayout(readLegacyDesktopToolPanels(target), true)
      const savedLayout = target.getItem(toolPanelLayoutKey)
      if (savedLayout !== null) lastToolLayout = readToolLayout(JSON.parse(savedLayout))
      else {
        const oldMobile = readToolLayout(JSON.parse(target.getItem(legacyMobileLayoutKey) ?? 'null'))
        lastToolLayout = oldMobile.open.length ? oldMobile : legacyDesktop
      }
    }
  } catch { /* A fresh layout is available when persistent storage is unavailable. */ }
  try {
    const saved = JSON.parse((storage ?? sessionStorage).getItem(key) ?? 'null')
    if (typeof saved?.puzzleId === 'string') {
      const tabs = readTabs(saved, legacyDesktop)
      current = { ...tabs, puzzleId: saved.puzzleId, launchPaused: saved.launchPaused === true }
      lastToolLayout = readToolLayout(current.toolPanels)
      if ((saved.toolPanels === undefined || saved.solutionView === undefined) && !durable()?.getItem(puzzleTabsKey(saved.puzzleId))) {
        durable()?.setItem(puzzleTabsKey(saved.puzzleId), JSON.stringify(tabs))
      }
    }
  }
  catch { /* The tab can still play when session storage is unavailable. */ }
  const listeners = new Set<() => void>()

  function forPuzzle(puzzleId: string | null): PlaySession {
    if (current.puzzleId === puzzleId) return current
    if (puzzleId === null) return initial
    try {
      const saved = JSON.parse(durable()?.getItem(puzzleTabsKey(puzzleId)) ?? 'null')
      if (saved) return { ...readTabs(saved, legacyDesktop), puzzleId, launchPaused: false }
    } catch { /* Fall back to the latest tab layout when the puzzle has no usable save. */ }
    return { ...initial, puzzleId, toolPanels: lastToolLayout }
  }

  function commit(next: PlaySession, persistTabs = false) {
    const changedLayout = next.puzzleId && (current.puzzleId !== next.puzzleId ||
      current.toolPanels.open !== next.toolPanels.open || current.toolPanels.active !== next.toolPanels.active)
    current = next
    try { (storage ?? sessionStorage).setItem(key, JSON.stringify(next)) }
    catch { /* Keep changes in memory when session storage is unavailable. */ }
    if (changedLayout) {
      lastToolLayout = readToolLayout(next.toolPanels)
      try { durable()?.setItem(toolPanelLayoutKey, JSON.stringify(lastToolLayout)) }
      catch { /* Keep the latest layout in memory. */ }
    }
    if (persistTabs && next.puzzleId) {
      const { puzzleId, launchPaused, ...tabs } = next
      try { durable()?.setItem(puzzleTabsKey(puzzleId), JSON.stringify(tabs)) }
      catch { /* Leave the tab's session storage as a fallback. */ }
    }
    listeners.forEach(listener => listener())
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    activate(puzzleId: string | null) {
      if (current.puzzleId !== puzzleId) commit(forPuzzle(puzzleId), true)
    },
    set<K extends PlaySessionField>(puzzleId: string, field: K, value: PlaySessionUpdate<K>) {
      const session = forPuzzle(puzzleId)
      const next = typeof value === 'function' ? value(session[field]) : value
      if (current === session && Object.is(next, session[field])) return
      commit({ ...session, [field]: next }, current !== session || field !== 'launchPaused')
    },
  }
}

export const playSession = createPlaySession()
