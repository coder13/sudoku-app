export type PuzzleSelection = { active: number; anchor: number; selected: number[] }
type SelectionStorage = Pick<Storage, 'getItem' | 'setItem'>

export function puzzleSelectionKey(id: string) { return `sudoku-app:v1:cell-selection:${id}` }

function isCell(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 81
}

export function parsePuzzleSelection(value: unknown, start: number): PuzzleSelection {
  const fallback = isCell(start) ? start : 40
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    active: isCell(saved.active) ? saved.active : fallback,
    anchor: isCell(saved.anchor) ? saved.anchor : fallback,
    selected: Array.isArray(saved.selected) ? [...new Set(saved.selected.filter(isCell))] : [],
  }
}

export function createPuzzleSelectionStore(id: string, start: number, storage?: SelectionStorage) {
  const initial = parsePuzzleSelection(null, start)
  let current = initial
  try {
    current = parsePuzzleSelection(JSON.parse((storage ?? localStorage).getItem(puzzleSelectionKey(id)) ?? 'null'), start)
  } catch { /* The grid still works without saved selection. */ }
  const listeners = new Set<() => void>()

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    set<K extends keyof PuzzleSelection>(key: K, value: PuzzleSelection[K] | ((previous: PuzzleSelection[K]) => PuzzleSelection[K])) {
      const next = typeof value === 'function' ? value(current[key]) : value
      const previous = current[key]
      if (Object.is(previous, next) || (Array.isArray(previous) && Array.isArray(next) &&
        previous.length === next.length && previous.every((cell, index) => cell === next[index]))) return
      current = { ...current, [key]: next }
      try { (storage ?? localStorage).setItem(puzzleSelectionKey(id), JSON.stringify(current)) }
      catch { /* Keep the selection for this session when storage is full or blocked. */ }
      listeners.forEach((listener) => listener())
    },
  }
}
