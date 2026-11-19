import { notifySettingsEdit } from './settings-events.ts'
export type EditableShortcutId =
  | 'digitMode'
  | 'pencilMode'
  | 'highlightMode'
  | 'colorMode'
  | 'switchColorShade'
  | 'eraseMode'
  | 'chainDrawing'
  | 'newChain'
  | 'actions'
  | 'generateCandidates'
  | 'solveSingles'
  | 'pauseOrSwitchView'
  | 'nextPuzzle'
  | 'shortcutHelp'

export type ShortcutPreferences = Record<EditableShortcutId, string>

export type EditableShortcutDefinition = {
  id: EditableShortcutId
  label: string
  description: string
  category: 'Input modes' | 'Puzzle actions'
}

export const SHORTCUTS_KEY = 'sudoku-app:v1:keyboard-shortcuts'

export const DEFAULT_SHORTCUTS: ShortcutPreferences = {
  digitMode: 'd',
  pencilMode: 'p',
  highlightMode: 'h',
  colorMode: 'c',
  switchColorShade: 'x',
  eraseMode: 'e',
  chainDrawing: 'l',
  newChain: 'b',
  actions: 'a',
  generateCandidates: 'g',
  solveSingles: 's',
  pauseOrSwitchView: ' ',
  nextPuzzle: 'n',
  shortcutHelp: '?',
}

export const EDITABLE_SHORTCUTS: readonly EditableShortcutDefinition[] = [
  { id: 'digitMode', label: 'Digit placement mode', description: 'Place digits in selected cells.', category: 'Input modes' },
  { id: 'pencilMode', label: 'Pencil mode', description: 'Add or remove candidates in selected cells.', category: 'Input modes' },
  { id: 'highlightMode', label: 'Highlight mode', description: 'Select cells while keeping a digit highlighted.', category: 'Input modes' },
  { id: 'colorMode', label: 'Color mode', description: 'Color cells or candidates.', category: 'Input modes' },
  { id: 'switchColorShade', label: 'Switch color shade', description: 'Switch the active brush between light and dark shades of the same color.', category: 'Puzzle actions' },
  { id: 'eraseMode', label: 'Erase mode', description: 'Erase cells as you select them.', category: 'Input modes' },
  { id: 'chainDrawing', label: 'Draw links', description: 'Start or stop drawing links in Chains.', category: 'Input modes' },
  { id: 'newChain', label: 'New chain', description: 'Start a separate chain while the Chains panel is open.', category: 'Puzzle actions' },
  { id: 'actions', label: 'Open Actions', description: 'Open the menu for common solving actions.', category: 'Puzzle actions' },
  { id: 'generateCandidates', label: 'Generate all candidates', description: 'Add every currently available candidate to empty cells.', category: 'Puzzle actions' },
  { id: 'solveSingles', label: 'Solve all singles', description: 'Place every currently available single.', category: 'Puzzle actions' },
  { id: 'pauseOrSwitchView', label: 'Pause or switch view', description: 'Pause or resume play. After solving, switch between the grid and results.', category: 'Puzzle actions' },
  { id: 'nextPuzzle', label: 'Next puzzle', description: 'Start the next puzzle after solving.', category: 'Puzzle actions' },
  { id: 'shortcutHelp', label: 'Keyboard shortcuts', description: 'Open this keyboard shortcut page.', category: 'Puzzle actions' },
]

const ids = EDITABLE_SHORTCUTS.map(({ id }) => id)
const listeners = new Set<() => void>()

export function shortcutLabel(key: string) {
  if (key === ' ') return 'Space'
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key
}

export function editableShortcutKey(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>, id?: EditableShortcutId) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  if (event.key === '?') return '?'
  const key = event.key.toLowerCase()
  return !event.shiftKey && validKey(key, id) ? key : null
}

export function shortcutMatches(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  shortcuts: ShortcutPreferences,
  id: EditableShortcutId,
) {
  if (event.altKey || event.ctrlKey || event.metaKey) return false
  const key = shortcuts[id]
  if (key === '?') return event.key === '?'
  return !event.shiftKey && event.key.toLowerCase() === key
}

export function highlightedDigitShortcut(event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
  if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null
  return Number(/^Digit([1-9])$/.exec(event.code)?.[1]) || null
}

export function appTextZoomShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'isComposing' | 'key' | 'metaKey'>) {
  if (event.altKey || event.isComposing || !(event.ctrlKey || event.metaKey)) return null
  if (event.key === '+' || event.key === '=') return 1
  if (event.key === '-') return -1
  if (event.key === '0') return 0
  return null
}

export function shortcutConflict(shortcuts: ShortcutPreferences, id: EditableShortcutId, key: string) {
  return ids.find((candidate) => candidate !== id && shortcuts[candidate] === key) ?? null
}

function validKey(value: unknown, id?: EditableShortcutId): value is string {
  return typeof value === 'string' && (/^[a-z]$/.test(value) || value === '?' || (id === 'pauseOrSwitchView' && value === ' '))
}

export function parseShortcutPreferences(value: unknown): ShortcutPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_SHORTCUTS
  const saved = value as Partial<ShortcutPreferences>
  const next = { ...DEFAULT_SHORTCUTS }
  const savedKeys = ids.map((id) => saved[id])
  for (const id of ['chainDrawing', 'newChain', 'switchColorShade'] as const) {
    if (saved[id] !== undefined || !savedKeys.includes(next[id])) continue
    const reserved = new Set([...Object.values(next), ...savedKeys])
    next[id] = [...'abcdefghijklmnopqrstuvwxyz'].find((key) => !reserved.has(key)) ?? next[id]
  }
  for (const id of ids) {
    if (saved[id] !== undefined && !validKey(saved[id], id)) return DEFAULT_SHORTCUTS
    if (validKey(saved[id], id)) {
      const conflictsWithUnsavedDefault = ids.some((candidate) => candidate !== id && saved[candidate] === undefined &&
        next[candidate] === saved[id])
      if (!conflictsWithUnsavedDefault) next[id] = saved[id]
    }
  }
  if (new Set(Object.values(next)).size !== ids.length) return DEFAULT_SHORTCUTS
  return ids.every((id) => next[id] === DEFAULT_SHORTCUTS[id]) ? DEFAULT_SHORTCUTS : next
}

export function readShortcuts(storage?: Pick<Storage, 'getItem'>) {
  if (!storage && typeof window === 'undefined') return DEFAULT_SHORTCUTS
  try { return parseShortcutPreferences(JSON.parse((storage ?? localStorage).getItem(SHORTCUTS_KEY) ?? 'null')) }
  catch { return DEFAULT_SHORTCUTS }
}

let current = readShortcuts()

if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== SHORTCUTS_KEY && event.key !== null)) return
    current = readShortcuts()
    listeners.forEach(listener => listener())
  })
}

function publish(next: ShortcutPreferences) {
  current = next
  listeners.forEach((listener) => listener())
  try { window.localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(next)); notifySettingsEdit() }
  catch { /* The shortcuts remain active for this session. */ }
}

export const shortcutStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => current,
  getServerSnapshot: () => DEFAULT_SHORTCUTS,
  set(id: EditableShortcutId, key: string) {
    if (!validKey(key, id) || shortcutConflict(current, id, key)) return false
    publish({ ...current, [id]: key })
    return true
  },
  reset(id: EditableShortcutId) {
    const key = DEFAULT_SHORTCUTS[id]
    const conflict = shortcutConflict(current, id, key)
    const next = conflict ? { ...current, [conflict]: current[id], [id]: key } : { ...current, [id]: key }
    publish(next)
  },
  resetAll() { publish(DEFAULT_SHORTCUTS) },
}
