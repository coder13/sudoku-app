import { COLORS, type ColorTarget } from './game.ts'

export const MODE_BADGE_EDGES = ['top', 'right', 'bottom', 'left'] as const
export type ModeBadgePosition = { edge: typeof MODE_BADGE_EDGES[number]; offset: number }
export const DEFAULT_DESKTOP_LAYOUT_WIDTH = 1128
export const MIN_DESKTOP_LAYOUT_WIDTH = 760
export const DEFAULT_DESKTOP_INPUT_WIDTH = 420
export const MIN_DESKTOP_INPUT_WIDTH = 324
export const MIN_DESKTOP_PUZZLE_WIDTH = 260

type DesktopPanelWidths = { input: number; puzzle: number | null }
const DEFAULT_DESKTOP_PANEL_WIDTHS: DesktopPanelWidths = { input: DEFAULT_DESKTOP_INPUT_WIDTH, puzzle: null }
const DESKTOP_VIEW_IDS = ['solution', 'techniques', 'chains'] as const
export type DesktopPuzzleView = typeof DESKTOP_VIEW_IDS[number]
type DesktopViewPreferences = { open: DesktopPuzzleView[]; active: DesktopPuzzleView | null }

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
  highlightCandidatePairs: boolean
  multi: boolean
  puzzleBrowserView: 'active' | 'past' | 'saved'
  cardModeBadgePosition: ModeBadgePosition
  desktopLayoutWidth: number
  desktopPanelWidths: DesktopPanelWidths
  desktopViews: DesktopViewPreferences
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
  highlightCandidatePairs: false,
  multi: false,
  puzzleBrowserView: 'active',
  cardModeBadgePosition: { edge: 'bottom', offset: 0.95 },
  desktopLayoutWidth: DEFAULT_DESKTOP_LAYOUT_WIDTH,
  desktopPanelWidths: DEFAULT_DESKTOP_PANEL_WIDTHS,
  desktopViews: { open: [], active: null },
}
const INPUT_MODE_KEYS = ['eraseMode', 'colorMode', 'highlightMode', 'pencil'] as const

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

function parseDesktopViews(value: unknown): DesktopViewPreferences {
  if (!value || typeof value !== 'object' || !('open' in value) || !Array.isArray(value.open)) {
    return DEFAULT_PLAY_PREFERENCES.desktopViews
  }
  const saved = value.open
  const open = DESKTOP_VIEW_IDS.filter((view) => saved.includes(view))
  const active = open.find((view) => 'active' in value && view === value.active) ?? open[0] ?? null
  return { open, active }
}

export function parsePlayPreferences(value: unknown): PlayPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PLAY_PREFERENCES }
  const saved = value as Record<string, unknown>
  // Invalid or older records can omit fields without losing the valid settings.
  const activeMode = INPUT_MODE_KEYS.find((key) => saved[key] === true)
  return {
    pencil: activeMode === 'pencil',
    candidateKind: saved.candidateKind === 'center' ? 'center' : 'corner',
    highlightMode: activeMode === 'highlightMode',
    colorMode: activeMode === 'colorMode',
    eraseMode: activeMode === 'eraseMode',
    selectedDigit: inRange(saved.selectedDigit, 1, 9) ? saved.selectedDigit : null,
    selectedColor: inRange(saved.selectedColor, 0, COLORS.length) ? saved.selectedColor : null,
    colorTarget: saved.colorTarget === 'candidate' ? 'candidate' : 'cell',
    colorBrush: inRange(saved.colorBrush, 0, COLORS.length) ? saved.colorBrush : null,
    highlightCandidatePairs: saved.highlightCandidatePairs === true,
    multi: saved.multi === true,
    puzzleBrowserView: saved.puzzleBrowserView === 'past' || saved.puzzleBrowserView === 'saved'
      ? saved.puzzleBrowserView : 'active',
    cardModeBadgePosition: parseModeBadgePosition(saved.cardModeBadgePosition),
    desktopLayoutWidth: inRange(saved.desktopLayoutWidth, MIN_DESKTOP_LAYOUT_WIDTH, Number.MAX_SAFE_INTEGER)
      ? saved.desktopLayoutWidth : DEFAULT_DESKTOP_LAYOUT_WIDTH,
    desktopPanelWidths: parseDesktopPanelWidths(saved.desktopPanelWidths, saved.desktopInputWidth),
    desktopViews: parseDesktopViews(saved.desktopViews),
  }
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function readSavedPreferences(storage: PreferenceStorage): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(PLAY_PREFERENCES_KEY) ?? 'null')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

export function createPlayPreferenceStore(storage?: PreferenceStorage) {
  let current = { ...DEFAULT_PLAY_PREFERENCES }
  try {
    const target = storage ?? localStorage
    const saved = readSavedPreferences(target)
    current = parsePlayPreferences(saved)
    if (saved?.desktopViews === undefined && target.getItem(LEGACY_TECHNIQUES_KEY) === 'true') {
      current.desktopViews = { open: ['techniques'], active: 'techniques' }
    }
  } catch { /* Defaults also work during server rendering or with blocked storage. */ }
  const listeners = new Set<() => void>()
  let pending: Partial<PlayPreferences> = {}

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => current,
    getServerSnapshot: () => DEFAULT_PLAY_PREFERENCES,
    set<K extends keyof PlayPreferences>(key: K, value: PlayPreferences[K] | ((previous: PlayPreferences[K]) => PlayPreferences[K])) {
      const next = typeof value === 'function' ? value(current[key]) : value
      if (Object.is(current[key], next)) return
      const changes = INPUT_MODE_KEYS.some((mode) => mode === key)
        ? { pencil: false, highlightMode: false, colorMode: false, eraseMode: false, [key]: next }
        : { [key]: next }
      current = { ...current, ...changes }
      pending = { ...pending, ...changes }
      // Save inside the action, before a refresh or an app-update reload can run.
      try {
        const target = storage ?? localStorage
        // Preserve unrelated settings from other tabs, including fields from newer app versions.
        target.setItem(PLAY_PREFERENCES_KEY, JSON.stringify({ ...(readSavedPreferences(target) ?? current), ...pending }))
        pending = {}
      }
      catch { /* Controls remain usable for this session when storage is full or blocked. */ }
      listeners.forEach((listener) => listener())
    },
  }
}

export const playPreferenceStore = createPlayPreferenceStore()
