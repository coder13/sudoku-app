import type { KakuroEntry } from './catalog.ts'

export type KakuroPosition = { values: number[]; notes: number[] }

function storageKey(entry: KakuroEntry) {
  return `kakuro.position.v1.${entry.id}`
}

export function emptyKakuroPosition(entry: KakuroEntry): KakuroPosition {
  return { values: entry.puzzle.cells.map(() => 0), notes: entry.puzzle.cells.map(() => 0) }
}

export function loadKakuroPosition(entry: KakuroEntry): KakuroPosition | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(entry)) ?? 'null')
    if (!stored || !Array.isArray(stored.values) || !Array.isArray(stored.notes) ||
      stored.values.length !== entry.puzzle.cells.length || stored.notes.length !== entry.puzzle.cells.length) return null
    const valid = (value: unknown, max: number) => typeof value === 'number' &&
      Number.isInteger(value) && value >= 0 && value <= max
    return {
      values: entry.puzzle.cells.map((cell, index) =>
        cell === null && valid(stored.values[index], 9) ? stored.values[index] : 0),
      notes: entry.puzzle.cells.map((cell, index) =>
        cell === null && valid(stored.notes[index], 511) ? stored.notes[index] : 0),
    }
  } catch {
    return null
  }
}

export function saveKakuroPosition(entry: KakuroEntry, position: KakuroPosition): boolean {
  try {
    localStorage.setItem(storageKey(entry), JSON.stringify(position))
    return true
  } catch {
    return false
  }
}
