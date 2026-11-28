import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from './catalog.ts'
import type { CandidateColors, ImportedCellColors } from '../sudoku/imported-colors.ts'
import { validNumberImportedCandidateColors, validNumberImportedCellColors } from './imported-codec.ts'

export type NumberPosition = {
  values: number[]
  notes: number[]
  importedCellColors?: ImportedCellColors
  importedCandidateColors?: CandidateColors<string>
}
export type NumberMove = readonly [cell: number, value: number, notes: number]
export type NumberClock = { elapsed: number; finished?: true } | 'untimed'
export type NumberProgress = { position: NumberPosition; past: NumberMove[]; future: NumberMove[]; clock?: NumberClock }
export type SavedNumberProgress = {
  values: unknown[]
  notes: unknown[]
  importedCellColors?: unknown
  importedCandidateColors?: unknown
  past?: unknown
  future?: unknown
  clock?: unknown
}
export const NUMBER_HISTORY_SIZE = 64

export function readNumberClock(value: unknown): NumberClock | undefined {
  if (value === 'untimed') return value
  if (!value || typeof value !== 'object') return
  const { elapsed, finished } = value as Partial<Record<'elapsed' | 'finished', unknown>>
  if (typeof elapsed !== 'number' || !Number.isSafeInteger(elapsed) || elapsed < 0) return
  return finished === true ? { elapsed, finished } : { elapsed }
}

export function numberProgressWithClock(progress: SavedNumberProgress, previous?: SavedNumberProgress): SavedNumberProgress {
  const saved = readNumberClock(previous?.clock)
  if (saved === undefined) return progress
  const incoming = readNumberClock(progress.clock)
  if (saved === 'untimed' || saved.finished || incoming === undefined) return { ...progress, clock: saved }
  if (incoming === 'untimed') return { ...progress, clock: incoming }
  return { ...progress, clock: { ...incoming, elapsed: Math.max(saved.elapsed, incoming.elapsed) } }
}

export function advanceNumberClock(clock: NumberClock | undefined, change: number | 'untimed') {
  if (clock === undefined || clock === 'untimed' || clock.finished) return clock
  return change === 'untimed' ? change : { elapsed: Math.min(Number.MAX_SAFE_INTEGER, clock.elapsed + change) }
}

export function hasNumberMoves({ position, past, future }: NumberProgress) {
  return Boolean(past.length || future.length || position.values.some(Boolean) || position.notes.some(Boolean))
}

export function emptyNumberPosition(cells: number): NumberPosition {
  return { values: Array(cells).fill(0), notes: Array(cells).fill(0) }
}

export function parseSavedNumberProgress(raw: string | null): SavedNumberProgress | null {
  try {
    const saved = JSON.parse(raw ?? 'null')
    return Array.isArray(saved?.values) && Array.isArray(saved?.notes) ? saved : null
  } catch {
    return null
  }
}

export function readNumberProgress(key: string): SavedNumberProgress | null {
  try { return parseSavedNumberProgress(localStorage.getItem(key)) } catch { return null }
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

  const clock = readNumberClock(saved.clock)
  const position: NumberPosition = {
    values: editable.map((write, index) => write && valid(values[index], maxValue) ? values[index] : 0),
    notes: editable.map((write, index) => write && valid(notes[index], maxNotes) ? notes[index] : 0),
  }
  if (saved.importedCellColors !== undefined && validNumberImportedCellColors(saved.importedCellColors, maxValue)) {
    position.importedCellColors = saved.importedCellColors as ImportedCellColors
  }
  if (saved.importedCandidateColors !== undefined && validNumberImportedCandidateColors(saved.importedCandidateColors, maxValue)) {
    position.importedCandidateColors = saved.importedCandidateColors as CandidateColors<string>
  }
  return {
    position,
    past: readHistory(past),
    future: readHistory(future),
    ...(clock === undefined ? {} : { clock }),
  }
}

export function loadNumberProgress(key: string, editable: readonly boolean[], maxValue: number): NumberProgress | null {
  const saved = readNumberProgress(key)
  return saved && parseNumberProgress(saved, editable, maxValue)
}

function writeNumberProgress(key: string, progress: SavedNumberProgress) {
  try {
    localStorage.setItem(key, JSON.stringify(progress))
    return true
  } catch {
    return false
  }
}

export function saveNumberProgress(key: string, { position, past, future, clock }: NumberProgress): boolean {
  return writeNumberProgress(key, numberProgressWithClock({ ...position, past, future, clock }, readNumberProgress(key) ?? undefined))
}

export function saveNumberClock(key: string, change: number | 'untimed') {
  const progress = readNumberProgress(key)
  if (!progress) return
  const previous = readNumberClock(progress.clock)
  const clock = advanceNumberClock(previous, change)
  if (clock === previous || writeNumberProgress(key, { ...progress, clock })) return clock
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
