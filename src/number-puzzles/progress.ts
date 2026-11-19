import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from './catalog.ts'
import { generatedNumberToken, type GeneratedNumberGame } from './generated.ts'

export type NumberPosition = { values: number[]; notes: number[] }
export type NumberMove = readonly [cell: number, value: number, notes: number]
export type NumberProgress = { position: NumberPosition; past: NumberMove[]; future: NumberMove[] }
export type SavedNumberProgress = { values: unknown[]; notes: unknown[]; past?: unknown; future?: unknown }
export const NUMBER_HISTORY_SIZE = 64

export function emptyNumberPosition(cells: number): NumberPosition {
  return { values: Array(cells).fill(0), notes: Array(cells).fill(0) }
}

export function readNumberProgress(key: string): SavedNumberProgress | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    return Array.isArray(saved?.values) && Array.isArray(saved?.notes) ? saved : null
  } catch {
    return null
  }
}

export function parseNumberProgress(saved: SavedNumberProgress, editable: readonly boolean[], maxValue: number): NumberProgress | null {
  const { values, notes, past, future } = saved
  if (values.length !== editable.length || notes.length !== editable.length) return null
  const maxNotes = 2 ** maxValue - 1
  const valid = (entry: unknown, max: number): entry is number => typeof entry === 'number' &&
    Number.isInteger(entry) && entry >= 0 && entry <= max

  function readHistory(value: unknown): NumberMove[] {
    if (!Array.isArray(value)) return []
    const history: NumberMove[] = []
    for (const move of value.slice(-NUMBER_HISTORY_SIZE)) {
      if (!Array.isArray(move) || move.length !== 3) return []
      const [cell, digit, notes] = move
      if (!valid(cell, editable.length - 1) || !editable[cell] || !valid(digit, maxValue) || !valid(notes, maxNotes)) return []
      history.push([cell, digit, notes])
    }
    return history
  }

  return {
    position: {
      values: editable.map((write, index) => write && valid(values[index], maxValue) ? values[index] : 0),
      notes: editable.map((write, index) => write && valid(notes[index], maxNotes) ? notes[index] : 0),
    },
    past: readHistory(past),
    future: readHistory(future),
  }
}

export function loadNumberProgress(key: string, editable: readonly boolean[], maxValue: number): NumberProgress | null {
  const saved = readNumberProgress(key)
  return saved && parseNumberProgress(saved, editable, maxValue)
}

export function saveNumberProgress(key: string, { position, past, future }: NumberProgress): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ ...position, past, future }))
    return true
  } catch {
    return false
  }
}

export function generatedNumberTokens(game: GeneratedNumberGame): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(`${game}.generated.v1`) ?? '[]')
    return Array.isArray(stored) ? stored.filter(token => generatedNumberToken(token)) : []
  } catch {
    return []
  }
}

export function rememberGeneratedNumberPuzzle(game: GeneratedNumberGame, token: string): void {
  try {
    const known = generatedNumberTokens(game)
    if (!known.includes(token)) localStorage.setItem(`${game}.generated.v1`, JSON.stringify([...known, token]))
  } catch {
    // The puzzle link still identifies the board when storage is unavailable.
  }
}

export function loadNumberDifficulty(game: string): NumberPuzzleDifficulty | undefined {
  try {
    const saved = localStorage.getItem(`${game}.difficulty.v1`)
    return numberPuzzleDifficulties.find(level => level === saved)
  } catch {
    return undefined
  }
}

export function rememberNumberDifficulty(game: string, difficulty: NumberPuzzleDifficulty) {
  try {
    localStorage.setItem(`${game}.difficulty.v1`, difficulty)
  } catch { /* The picker works without storage. */ }
}
