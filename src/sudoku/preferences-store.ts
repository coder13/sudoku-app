import {
  ADVANCED_MODE_KEY, APPEARANCE_KEY, CELL_REFERENCE_STYLE_KEY, DIFFICULTY_KEY, ERROR_MODE_KEY, HIGHLIGHT_KEY,
  INPUT_SIZE_KEY, NEW_PUZZLE_KEY, WORKSPACE_MODE_KEY, readNewPuzzlePreference, readPreferences,
  saveAdvancedModes, saveAppearance, saveCellReferenceStyle, saveDifficulty, saveErrorMode,
  saveHighlightPreferences, saveInputSize, saveNewPuzzlePreference, saveWorkspaceMode,
} from './preferences.ts'
import { notifySettingsEdit } from './settings-events.ts'
import type { NewPuzzlePreference } from './preferences.ts'
import type { DifficultyPreference } from './difficulty.ts'

export type AppPreferences = Omit<ReturnType<typeof readPreferences>, 'difficulty'> & {
  difficulty: DifficultyPreference
  newPuzzlePreference: NewPuzzlePreference | null
}
export type PreferenceUpdate<T> = T | ((previous: T) => T)
export type AppPreferenceKey = keyof AppPreferences

const emptyStorage = { getItem: (_key: string) => null }
const serverSnapshot: AppPreferences = { ...readPreferences(emptyStorage), newPuzzlePreference: null }
const preferenceKeys = new Set([
  ADVANCED_MODE_KEY, APPEARANCE_KEY, CELL_REFERENCE_STYLE_KEY, DIFFICULTY_KEY, ERROR_MODE_KEY,
  HIGHLIGHT_KEY, INPUT_SIZE_KEY, NEW_PUZZLE_KEY, WORKSPACE_MODE_KEY,
])

function readSnapshot(): AppPreferences {
  return { ...readPreferences(), newPuzzlePreference: readNewPuzzlePreference() }
}

let snapshot = typeof window === 'undefined' ? serverSnapshot : readSnapshot()
const listeners = new Set<() => void>()

function publish() {
  for (const listener of listeners) listener()
}

function refresh() {
  const next = readSnapshot()
  if (JSON.stringify(snapshot) === JSON.stringify(next)) return
  snapshot = next
  publish()
}

function persist<K extends AppPreferenceKey>(key: K, value: AppPreferences[K]) {
  switch (key) {
    case 'advancedModes': saveAdvancedModes(value as AppPreferences['advancedModes']); break
    case 'appearance': saveAppearance(value as AppPreferences['appearance']); break
    case 'cellReferenceStyle': saveCellReferenceStyle(value as AppPreferences['cellReferenceStyle']); break
    case 'difficulty': saveDifficulty(value as AppPreferences['difficulty']); break
    case 'errorMode': saveErrorMode(value as AppPreferences['errorMode']); break
    case 'highlighting': saveHighlightPreferences(value as AppPreferences['highlighting']); break
    case 'inputSize': saveInputSize(value as AppPreferences['inputSize']); break
    case 'newPuzzlePreference':
      if (value) saveNewPuzzlePreference(value as NewPuzzlePreference)
      else {
        try { localStorage.removeItem(NEW_PUZZLE_KEY); notifySettingsEdit() }
        catch { /* The choice remains active for this session. */ }
      }
      break
    case 'workspaceMode': saveWorkspaceMode(value as AppPreferences['workspaceMode']); break
  }
}

function change<K extends AppPreferenceKey>(key: K, update: PreferenceUpdate<AppPreferences[K]>) {
  const value = typeof update === 'function'
    ? (update as (previous: AppPreferences[K]) => AppPreferences[K])(snapshot[key])
    : update
  if (!Object.is(snapshot[key], value)) {
    snapshot = { ...snapshot, [key]: value }
    publish()
  }
  return value
}

function set<K extends AppPreferenceKey>(key: K, update: PreferenceUpdate<AppPreferences[K]>) {
  persist(key, change(key, update))
}

function onStorage(event: StorageEvent) {
  if (event.storageArea === localStorage && (event.key === null || preferenceKeys.has(event.key))) refresh()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', onStorage)
}

export const appPreferencesStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => serverSnapshot,
  refresh,
  update: change,
  save: persist,
  set,
}
