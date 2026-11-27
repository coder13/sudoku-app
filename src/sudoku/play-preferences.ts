import { COLORS, type ColorTarget } from './game.ts'
import { parsePinnedActions, type PinnedAction } from './pinned-actions.ts'
import { notifySettingsEdit } from './settings-events.ts'
import { CHAIN_COLORS, CHAIN_COLOR_PAIRS, type ChainColorPair } from './chain-sketch.ts'
import { inputToolPreferencesFromState, inputToolStateFromPreferences, transitionInputTool, type InputToolAction } from './input-tool-mode.ts'

export const MODE_BADGE_EDGES = ['top', 'right', 'bottom', 'left'] as const
export type ModeBadgePosition = { edge: typeof MODE_BADGE_EDGES[number]; offset: number }
export const DEFAULT_DESKTOP_LAYOUT_WIDTH = 1128
export const MIN_DESKTOP_LAYOUT_WIDTH = 760
export const DEFAULT_DESKTOP_INPUT_WIDTH = 420
export const MIN_DESKTOP_INPUT_WIDTH = 324
export const MIN_DESKTOP_PUZZLE_WIDTH = 260

type DesktopPanelWidths = { input: number; puzzle: number | null }
const DEFAULT_DESKTOP_PANEL_WIDTHS: DesktopPanelWidths = { input: DEFAULT_DESKTOP_INPUT_WIDTH, puzzle: null }

export type PlayPreferences = {
  pencil: boolean
  candidateKind: 'center' | 'corner'
  highlightMode: boolean
  colorMode: boolean
  eraseMode: boolean
  selectedDigit: number | null
  selectedColor: number | null
  colorTarget: ColorTarget
  colorBrush: number | null
  chainColorPairs: readonly ChainColorPair[]
  highlightCandidatePairs: boolean
  showKillerCombinations: boolean
  /** Null opens the first visible section. An empty list keeps all sections closed. */
  expandedTechniqueGroups: readonly string[] | null
  multi: boolean
  puzzleBrowserView: 'active' | 'past' | 'saved'
  cardModeBadgePosition: ModeBadgePosition
  pinnedActions: readonly PinnedAction[]
  mobileHintPinned: boolean
  desktopLayoutWidth: number
  desktopPanelWidths: DesktopPanelWidths
}

// Keep this key independent of the app build and service-worker cache version.
export const PLAY_PREFERENCES_KEY = 'sudoku-app:v1:play-preferences'
const LEGACY_TECHNIQUES_KEY = 'sudoku-app:v1:techniques-card-open'
export const DEFAULT_PLAY_PREFERENCES: PlayPreferences = {
  pencil: false,
  candidateKind: 'corner',
  highlightMode: false,
  colorMode: false,
  eraseMode: false,
  selectedDigit: null,
  selectedColor: null,
  colorTarget: 'cell',
  colorBrush: null,
  chainColorPairs: CHAIN_COLOR_PAIRS,
  highlightCandidatePairs: false,
  showKillerCombinations: true,
  expandedTechniqueGroups: null,
  multi: false,
  puzzleBrowserView: 'active',
  cardModeBadgePosition: { edge: 'bottom', offset: 0.95 },
  pinnedActions: [],
  mobileHintPinned: false,
  desktopLayoutWidth: DEFAULT_DESKTOP_LAYOUT_WIDTH,
  desktopPanelWidths: DEFAULT_DESKTOP_PANEL_WIDTHS,
}
const INPUT_TOOL_KEYS = ['pencil', 'highlightMode', 'colorMode', 'eraseMode'] as const
type InputToolPreferenceKey = typeof INPUT_TOOL_KEYS[number]

function isInputToolPreferenceKey(key: keyof PlayPreferences): key is InputToolPreferenceKey {
  return INPUT_TOOL_KEYS.includes(key as InputToolPreferenceKey)
}

function inputToolActionForPreference(key: InputToolPreferenceKey, enabled: boolean): InputToolAction {
  if (key === 'pencil') return { type: 'select-pencil', pencil: enabled }
  const override = key === 'highlightMode' ? 'highlight' : key === 'colorMode' ? 'color' : 'erase'
  return { type: 'set-override', override: enabled ? override : null }
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function parseModeBadgePosition(value: unknown): ModeBadgePosition {
  if (value && typeof value === 'object' && 'edge' in value && 'offset' in value) {
    const edge = MODE_BADGE_EDGES.find((edge) => edge === value.edge)
    const offset = value.offset
    if (edge && typeof offset === 'number' && Number.isFinite(offset) && offset >= 0 && offset <= 1) return { edge, offset }
  }
  return DEFAULT_PLAY_PREFERENCES.cardModeBadgePosition
}

function parseDesktopPanelWidths(value: unknown, legacyInputWidth: unknown): DesktopPanelWidths {
  const maxInputWidth = DEFAULT_DESKTOP_LAYOUT_WIDTH - MIN_DESKTOP_PUZZLE_WIDTH
  if (value && typeof value === 'object' && 'input' in value && 'puzzle' in value
    && inRange(value.input, MIN_DESKTOP_INPUT_WIDTH, maxInputWidth)) {
    if (value.puzzle === null || inRange(value.puzzle, MIN_DESKTOP_PUZZLE_WIDTH, DEFAULT_DESKTOP_LAYOUT_WIDTH - value.input)) {
      return { input: value.input, puzzle: value.puzzle }
    }
  }
  if (value === undefined && inRange(legacyInputWidth, MIN_DESKTOP_INPUT_WIDTH, maxInputWidth)) {
    return { input: legacyInputWidth, puzzle: null }
  }
  return DEFAULT_DESKTOP_PANEL_WIDTHS
}

function parseChainColorPairs(value: unknown): readonly ChainColorPair[] {
  if (!Array.isArray(value)) return CHAIN_COLOR_PAIRS
  return CHAIN_COLOR_PAIRS.map((fallback, index) => {
    const pair = value[index]
    if (!Array.isArray(pair) || pair.length !== 2) return fallback
    const first = CHAIN_COLORS.find(color => color === pair[0])
    const second = CHAIN_COLORS.find(color => color === pair[1])
    return first && second && first !== second ? [first, second] : fallback
  })
}

export function parsePlayPreferences(value: unknown): PlayPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PLAY_PREFERENCES }
  const saved = value as Record<string, unknown>
  const expandedTechniqueGroups = saved.expandedTechniqueGroups
  // Invalid or older records can omit fields without losing the valid settings.
  const inputTool = inputToolPreferencesFromState(inputToolStateFromPreferences({
    pencil: saved.pencil === true,
    highlightMode: saved.highlightMode === true,
    colorMode: saved.colorMode === true,
    eraseMode: saved.eraseMode === true,
  }))
  return {
    ...inputTool,
    candidateKind: saved.candidateKind === 'center' ? 'center' : 'corner',
    selectedDigit: inRange(saved.selectedDigit, 1, 9) ? saved.selectedDigit : null,
    selectedColor: inRange(saved.selectedColor, 0, COLORS.length) ? saved.selectedColor : null,
    colorTarget: saved.colorTarget === 'candidate' ? 'candidate' : 'cell',
    colorBrush: inRange(saved.colorBrush, 0, COLORS.length) ? saved.colorBrush : null,
    chainColorPairs: parseChainColorPairs(saved.chainColorPairs),
    highlightCandidatePairs: saved.highlightCandidatePairs === true,
    showKillerCombinations: saved.showKillerCombinations !== false,
    expandedTechniqueGroups: Array.isArray(expandedTechniqueGroups) && expandedTechniqueGroups.every(title => typeof title === 'string')
      ? [...new Set<string>(expandedTechniqueGroups)] : null,
    multi: saved.multi === true,
    puzzleBrowserView: saved.puzzleBrowserView === 'past' || saved.puzzleBrowserView === 'saved'
      ? saved.puzzleBrowserView : 'active',
    cardModeBadgePosition: parseModeBadgePosition(saved.cardModeBadgePosition),
    pinnedActions: parsePinnedActions(saved.pinnedActions),
    mobileHintPinned: saved.mobileHintPinned === true,
    desktopLayoutWidth: inRange(saved.desktopLayoutWidth, MIN_DESKTOP_LAYOUT_WIDTH, Number.MAX_SAFE_INTEGER)
      ? saved.desktopLayoutWidth : DEFAULT_DESKTOP_LAYOUT_WIDTH,
    desktopPanelWidths: parseDesktopPanelWidths(saved.desktopPanelWidths, saved.desktopInputWidth),
  }
}

export function readPlayPreferences(storage: Pick<Storage, 'getItem'>): PlayPreferences {
  return parsePlayPreferences(readSavedPreferences(storage))
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function readSavedPreferences(storage: Pick<Storage, 'getItem'>): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(PLAY_PREFERENCES_KEY) ?? 'null')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

export function readPinnedActions(storage: Pick<Storage, 'getItem'>): readonly PinnedAction[] {
  return parsePinnedActions(readSavedPreferences(storage)?.pinnedActions)
}

export function readLegacyDesktopToolPanels(storage: PreferenceStorage) {
  const saved = readSavedPreferences(storage)
  if (saved?.desktopViews !== undefined) return saved.desktopViews
  const colors = saved?.colorsPanelOpen === true
  const techniques = storage.getItem(LEGACY_TECHNIQUES_KEY) === 'true'
  return { open: [techniques && 'techniques', colors && 'colors'], active: colors ? 'colors' : 'techniques' }
}

export function createPlayPreferenceStore(storage?: PreferenceStorage) {
  let current = { ...DEFAULT_PLAY_PREFERENCES }
  try {
    const target = storage ?? localStorage
    const saved = readSavedPreferences(target)
    current = parsePlayPreferences(saved)
  } catch { /* Defaults also work during server rendering or with blocked storage. */ }
  const listeners = new Set<() => void>()
  let pending: Partial<PlayPreferences> = {}

  function commit(changes: Partial<PlayPreferences>) {
    if (!Object.keys(changes).some(key => !Object.is(current[key as keyof PlayPreferences], changes[key as keyof PlayPreferences]))) return
    current = { ...current, ...changes }
    pending = { ...pending, ...changes }
    // Save inside the action, before a refresh or an app-update reload can run.
    try {
      const target = storage ?? localStorage
      // Preserve unrelated settings from other tabs, including fields from newer app versions.
      target.setItem(PLAY_PREFERENCES_KEY, JSON.stringify({ ...(readSavedPreferences(target) ?? current), ...pending }))
      pending = {}
      if (storage === undefined) notifySettingsEdit()
    }
    catch { /* Controls remain usable for this session when storage is full or blocked. */ }
    listeners.forEach((listener) => listener())
  }

  function applyInputToolAction(action: InputToolAction) {
    commit(inputToolPreferencesFromState(transitionInputTool(inputToolStateFromPreferences(current), action)))
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => current,
    getServerSnapshot: () => DEFAULT_PLAY_PREFERENCES,
    refreshPinnedActions() {
      if (Object.keys(pending).length) return
      let saved: PlayPreferences
      try { saved = readPlayPreferences(storage ?? localStorage) }
      catch { return }
      if (JSON.stringify(saved) === JSON.stringify(current)) return
      current = saved
      listeners.forEach((listener) => listener())
    },
    set<K extends keyof PlayPreferences>(key: K, value: PlayPreferences[K] | ((previous: PlayPreferences[K]) => PlayPreferences[K])) {
      const next = typeof value === 'function' ? value(current[key]) : value
      if (Object.is(current[key], next)) return
      if (isInputToolPreferenceKey(key)) applyInputToolAction(inputToolActionForPreference(key, next as boolean))
      else commit({ [key]: next })
    },
    transitionInputTool: applyInputToolAction,
  }
}

export const playPreferenceStore = createPlayPreferenceStore()

if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', event => {
    if (event.storageArea === window.localStorage && (event.key === PLAY_PREFERENCES_KEY || event.key === null)) {
      playPreferenceStore.refreshPinnedActions()
    }
  })
}
