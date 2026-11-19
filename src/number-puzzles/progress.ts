import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from './catalog.ts'
import { generatedNumberToken, type GeneratedNumberGame } from './generated.ts'

export type NumberPosition = { values: number[]; notes: number[] }
export type NumberProgress = { position: NumberPosition; past: NumberPosition[]; future: NumberPosition[] }
export const NUMBER_HISTORY_SIZE = 64

export function emptyNumberPosition(cells: number): NumberPosition {
  return { values: Array(cells).fill(0), notes: Array(cells).fill(0) }
}

export function loadNumberProgress(key: string, editable: readonly boolean[], maxValue: number): NumberProgress | null {
  function readPosition(value: unknown): NumberPosition | null {
    if (!value || typeof value !== 'object' || !('values' in value) || !('notes' in value)) return null
    const { values, notes } = value
    if (!Array.isArray(values) || !Array.isArray(notes) ||
      values.length !== editable.length || notes.length !== editable.length) return null
    const valid = (entry: unknown, max: number) => typeof entry === 'number' &&
      Number.isInteger(entry) && entry >= 0 && entry <= max
    const maxNotes = 2 ** maxValue - 1
    return {
      values: editable.map((write, index) => write && valid(values[index], maxValue) ? values[index] : 0),
      notes: editable.map((write, index) => write && valid(notes[index], maxNotes) ? notes[index] : 0),
    }
  }

  function readHistory(value: unknown): NumberPosition[] {
    if (!Array.isArray(value)) return []
    const history = value.slice(-NUMBER_HISTORY_SIZE).map(readPosition)
    return history.every(position => position !== null) ? history : []
  }

  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
    const position = readPosition(stored)
    if (!position) return null
    return { position, past: readHistory(stored.past), future: readHistory(stored.future) }
  } catch {
    return null
  }
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
