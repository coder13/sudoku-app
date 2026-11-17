import { COLORS, type ColorTarget } from './game.ts'

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
}

// Keep this key independent of the app build and service-worker cache version.
export const PLAY_PREFERENCES_KEY = 'sudoku-app:v1:play-preferences'
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
}
const INPUT_MODE_KEYS = ['eraseMode', 'colorMode', 'highlightMode', 'pencil'] as const

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
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
  }
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function createPlayPreferenceStore(storage?: PreferenceStorage) {
  let current = { ...DEFAULT_PLAY_PREFERENCES }
  try {
    const target = storage ?? localStorage
    current = parsePlayPreferences(JSON.parse(target.getItem(PLAY_PREFERENCES_KEY) ?? 'null'))
  } catch { /* Defaults also work during server rendering or with blocked storage. */ }
  const listeners = new Set<() => void>()

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
      current = next === true && INPUT_MODE_KEYS.some((mode) => mode === key)
        ? { ...current, pencil: false, highlightMode: false, colorMode: false, eraseMode: false, [key]: next }
        : { ...current, [key]: next }
      // Save inside the action, before a refresh or an app-update reload can run.
      try { (storage ?? localStorage).setItem(PLAY_PREFERENCES_KEY, JSON.stringify(current)) }
      catch { /* Controls remain usable for this session when storage is full or blocked. */ }
      listeners.forEach((listener) => listener())
    },
  }
}

export const playPreferenceStore = createPlayPreferenceStore()
