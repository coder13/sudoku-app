import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from './catalog.ts'
import { generatedNumberToken, type GeneratedNumberGame } from './generated.ts'

export type NumberPosition = { values: number[]; notes: number[] }

export function emptyNumberPosition(cells: number): NumberPosition {
  return { values: Array(cells).fill(0), notes: Array(cells).fill(0) }
}

export function loadNumberPosition(key: string, editable: readonly boolean[], maxValue: number): NumberPosition | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!stored || !Array.isArray(stored.values) || !Array.isArray(stored.notes) ||
      stored.values.length !== editable.length || stored.notes.length !== editable.length) return null
    const valid = (value: unknown, max: number) => typeof value === 'number' &&
      Number.isInteger(value) && value >= 0 && value <= max
    return {
      values: editable.map((write, index) => write && valid(stored.values[index], maxValue) ? stored.values[index] : 0),
      notes: editable.map((write, index) => write && valid(stored.notes[index], 2 ** maxValue - 1) ? stored.notes[index] : 0),
    }
  } catch {
    return null
  }
}

export function saveNumberPosition(key: string, position: NumberPosition): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(position))
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
