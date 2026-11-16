export type EditableShortcutId =
  | 'digitMode'
  | 'pencilMode'
  | 'highlightMode'
  | 'colorMode'
  | 'eraseMode'
  | 'actions'
  | 'generateCandidates'
  | 'solveSingles'
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
  eraseMode: 'e',
  actions: 'a',
  generateCandidates: 'g',
  solveSingles: 's',
  nextPuzzle: 'n',
  shortcutHelp: '?',
}

export const EDITABLE_SHORTCUTS: readonly EditableShortcutDefinition[] = [
  { id: 'digitMode', label: 'Digit placement mode', description: 'Place digits in selected cells.', category: 'Input modes' },
  { id: 'pencilMode', label: 'Pencil mode', description: 'Add or remove candidates in selected cells.', category: 'Input modes' },
  { id: 'highlightMode', label: 'Highlight mode', description: 'Select cells while keeping a digit highlighted.', category: 'Input modes' },
  { id: 'colorMode', label: 'Color mode', description: 'Color cells or candidates when colors are enabled.', category: 'Input modes' },
  { id: 'eraseMode', label: 'Erase mode', description: 'Erase cells as you select them.', category: 'Input modes' },
  { id: 'actions', label: 'Open Actions', description: 'Open the menu for common solving actions.', category: 'Puzzle actions' },
  { id: 'generateCandidates', label: 'Generate all candidates', description: 'Add every currently available candidate to empty cells.', category: 'Puzzle actions' },
  { id: 'solveSingles', label: 'Solve all singles', description: 'Place every currently available single.', category: 'Puzzle actions' },
  { id: 'nextPuzzle', label: 'Next puzzle', description: 'Start the next puzzle after solving.', category: 'Puzzle actions' },
  { id: 'shortcutHelp', label: 'Keyboard shortcuts', description: 'Open this keyboard shortcut page.', category: 'Puzzle actions' },
]

const ids = EDITABLE_SHORTCUTS.map(({ id }) => id)
const listeners = new Set<() => void>()

export function shortcutLabel(key: string) {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key
}

export function editableShortcutKey(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  if (event.key === '?') return '?'
  if (event.shiftKey || !/^[a-z]$/i.test(event.key)) return null
  return event.key.toLowerCase()
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

export function shortcutConflict(shortcuts: ShortcutPreferences, id: EditableShortcutId, key: string) {
  return ids.find((candidate) => candidate !== id && shortcuts[candidate] === key) ?? null
}

function validKey(value: unknown): value is string {
  return typeof value === 'string' && (/^[a-z]$/.test(value) || value === '?')
}

export function parseShortcutPreferences(value: unknown): ShortcutPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_SHORTCUTS
  const saved = value as Partial<ShortcutPreferences>
  const next = { ...DEFAULT_SHORTCUTS }
  for (const id of ids) {
    if (saved[id] !== undefined && !validKey(saved[id])) return DEFAULT_SHORTCUTS
    if (validKey(saved[id])) {
      const conflictsWithUnsavedDefault = ids.some((candidate) => candidate !== id && saved[candidate] === undefined &&
        DEFAULT_SHORTCUTS[candidate] === saved[id])
      if (!conflictsWithUnsavedDefault) next[id] = saved[id]
    }
  }
  if (new Set(Object.values(next)).size !== ids.length) return DEFAULT_SHORTCUTS
  return ids.every((id) => next[id] === DEFAULT_SHORTCUTS[id]) ? DEFAULT_SHORTCUTS : next
}

function readShortcuts() {
  if (typeof window === 'undefined') return DEFAULT_SHORTCUTS
  try { return parseShortcutPreferences(JSON.parse(window.localStorage.getItem(SHORTCUTS_KEY) ?? 'null')) }
  catch { return DEFAULT_SHORTCUTS }
}

let current = readShortcuts()

function publish(next: ShortcutPreferences) {
  current = next
  listeners.forEach((listener) => listener())
  try { window.localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(next)) }
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
    if (!validKey(key) || shortcutConflict(current, id, key)) return false
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
