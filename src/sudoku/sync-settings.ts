import {
  ADVANCED_MODE_KEY, APPEARANCE_KEY, CELL_REFERENCE_STYLE_KEY, DIFFICULTY_KEY, ERROR_MODE_KEY, HIGHLIGHT_KEY,
  INPUT_SIZE_KEY, NEW_PUZZLE_KEY, WORKSPACE_MODE_KEY, readNewPuzzlePreference, readPreferences,
} from './preferences.ts'
import { readTiming, TIMING_KEY } from './puzzle-timing.ts'
import { readShortcuts, SHORTCUTS_KEY, storedShortcutPreferences } from './shortcuts.ts'
import { DISABLED_HINTS_KEY, readDisabledHintTechniques } from './hint-preferences.ts'
import { readSolverProfile, SOLVER_PROFILE_KEY } from './solver-profile.ts'
import { PLAY_PREFERENCES_KEY, readPinnedActions } from './play-preferences.ts'
import { parsePinnedActions } from './pinned-actions.ts'
import type { SyncRequest } from './sync-engine.ts'

export type SettingsValues = Record<string, string>
type Group = { key: string; fields: Record<string, unknown>; format: 'text' | 'json' | 'fields'; metadata?: Record<string, number> }
function groups(storage: Pick<Storage, 'getItem'>): Group[] {
  const prefs = readPreferences(storage)
  const single = (key: string, value: unknown, format: 'text' | 'json' = 'text'): Group => ({ key, fields: { '': value }, format })
  return [
    { key: APPEARANCE_KEY, fields: prefs.appearance, format: 'fields', metadata: { themeDefaultsVersion: 2 } },
    { key: ADVANCED_MODE_KEY, fields: prefs.advancedModes, format: 'fields' },
    { key: HIGHLIGHT_KEY, fields: prefs.highlighting, format: 'fields' },
    { key: TIMING_KEY, fields: readTiming(storage), format: 'fields' },
    { key: PLAY_PREFERENCES_KEY, fields: { pinnedActions: readPinnedActions(storage) }, format: 'fields' },
    single(ERROR_MODE_KEY, prefs.errorMode), single(CELL_REFERENCE_STYLE_KEY, prefs.cellReferenceStyle),
    single(INPUT_SIZE_KEY, prefs.inputSize), single(WORKSPACE_MODE_KEY, prefs.workspaceMode),
    single(DIFFICULTY_KEY, prefs.difficulty), single(NEW_PUZZLE_KEY, readNewPuzzlePreference(storage), 'json'),
    // A key map is one choice: merging individual shortcuts could bind two actions to the same key.
    single(SHORTCUTS_KEY, storedShortcutPreferences(readShortcuts(storage)), 'json'),
    single(DISABLED_HINTS_KEY, readDisabledHintTechniques(storage), 'json'),
    single(SOLVER_PROFILE_KEY, readSolverProfile(storage) ?? null, 'json'),
  ]
}

function fieldId(key: string, field: string) {
  return key.slice('sudoku-app:v1:'.length) + (field ? '.' + field : '')
}
function snapshot(groups: Group[]): SettingsValues {
  const values: SettingsValues = {}
  for (const { key, fields } of groups) {
    for (const [field, value] of Object.entries(fields)) values[fieldId(key, field)] = JSON.stringify(value)
  }
  return values
}
const defaults = snapshot(groups({ getItem: () => null }))

function normalizeSettings(values: SettingsValues): SettingsValues {
  const shortcuts = fieldId(SHORTCUTS_KEY, '')
  const pinned = fieldId(PLAY_PREFERENCES_KEY, 'pinnedActions')
  return {
    ...values,
    ...(values[shortcuts] === undefined ? {} : {
      [shortcuts]: JSON.stringify(storedShortcutPreferences(readShortcuts({ getItem: () => values[shortcuts] }))),
    }),
    ...(values[pinned] === undefined ? {} : {
      [pinned]: JSON.stringify(parsePinnedActions(JSON.parse(values[pinned]))),
    }),
  }
}

export async function syncSettings(storage: Storage, checkpoint: string, request: SyncRequest, remote: SettingsValues) {
  const previousRaw = storage.getItem(checkpoint)
  const previous = normalizeSettings(JSON.parse(previousRaw ?? '{}'))
  remote = normalizeSettings(remote)
  // An old default in the checkpoint does not represent a local choice.
  if (previous['error-mode'] === '"all"' && storage.getItem(ERROR_MODE_KEY) === null) delete previous['error-mode']
  const before = snapshot(groups(storage))
  const seeds: SettingsValues = {}, edits: SettingsValues = {}
  for (const [id, value] of Object.entries(before)) {
    if (Object.hasOwn(previous, id)) {
      if (value !== previous[id] && value !== remote[id]) edits[id] = value
    } else if (value !== defaults[id] && !Object.hasOwn(remote, id)) {
      seeds[id] = value
    }
  }
  if (Object.keys(seeds).length || Object.keys(edits).length) {
    remote = normalizeSettings(await request<SettingsValues>('settings', 'PATCH', { seeds, edits }))
  }
  const next: SettingsValues = {}
  const changed = []
  for (const group of groups(storage)) {
    const fields = { ...group.fields }
    let dirty = false
    for (const [field, value] of Object.entries(group.fields)) {
      const id = fieldId(group.key, field)
      next[id] = remote[id] ?? defaults[id]
      // Preserve edits made in this tab or another tab while the request was in flight.
      if (JSON.stringify(value) === before[id] && before[id] !== next[id]) {
        fields[field] = JSON.parse(next[id])
        dirty = true
      }
    }
    if (!dirty) continue
    const value = fields['']
    if (group.format === 'fields') {
      let old
      try { old = JSON.parse(storage.getItem(group.key) ?? '{}') } catch { /* Repair unreadable saved settings. */ }
      storage.setItem(group.key, JSON.stringify({ ...old, ...fields, ...group.metadata }))
    } else if (value === null) storage.removeItem(group.key)
    else storage.setItem(group.key, group.format === 'text' ? String(value) : JSON.stringify(value))
    changed.push(group.key)
  }
  const serialized = JSON.stringify(next)
  if (serialized !== previousRaw) storage.setItem(checkpoint, serialized)
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    for (const key of changed) window.dispatchEvent(new StorageEvent('storage', { key, storageArea: storage }))
  }
}
