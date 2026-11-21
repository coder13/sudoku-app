import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from './catalog.ts'

export type NumberPosition = { values: number[]; notes: number[]; cornerNotes?: number[]; annotationsHidden?: boolean }
export type NumberCellMove = readonly [cell: number, value: number, notes: number, cornerNotes?: number]
// A boolean move records whether the imported player annotations are hidden.
export type NumberMove = NumberCellMove | boolean
export type NumberClock = { elapsed: number; finished?: true } | 'untimed'
export type NumberProgress = { position: NumberPosition; past: NumberMove[]; future: NumberMove[]; clock?: NumberClock; lastPlayed?: number }
export type SavedNumberProgress = { values: unknown[]; notes: unknown[]; cornerNotes?: unknown; annotationsHidden?: unknown; past?: unknown; future?: unknown; clock?: unknown; lastPlayed?: unknown }
export const NUMBER_HISTORY_SIZE = 64

export function readNumberClock(value: unknown): NumberClock | undefined {
  if (value === 'untimed') return value
  if (!value || typeof value !== 'object') return
  const { elapsed, finished } = value as Partial<Record<'elapsed' | 'finished', unknown>>
  if (typeof elapsed !== 'number' || !Number.isSafeInteger(elapsed) || elapsed < 0) return
  return finished === true ? { elapsed, finished } : { elapsed }
}

export function readNumberLastPlayed(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15 ? value : undefined
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
  return Boolean(past.length || future.length || position.values.some(Boolean) || position.notes.some(Boolean) || position.cornerNotes?.some(Boolean) || position.annotationsHidden === false)
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

function validNumberValue(entry: unknown, max: number): entry is number {
  return typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry <= max
}

function readNumberValues({ values, notes }: SavedNumberProgress, editable: readonly boolean[], maxValue: number): number[] | null {
  if (!Array.isArray(values) || !Array.isArray(notes) ||
    values.length !== editable.length || notes.length !== editable.length) return null
  return editable.map((write, index) => write && validNumberValue(values[index], maxValue) ? values[index] : 0)
}

function readNumberHistory(value: unknown, editable: readonly boolean[], maxValue: number, maxNotes: number): NumberMove[] {
  if (!Array.isArray(value)) return []
  const recent = value.slice(-NUMBER_HISTORY_SIZE)
  for (let index = 0; index < recent.length; index++) {
    const move = recent[index]
    if (typeof move === 'boolean') continue
    if (!Array.isArray(move) || move.length !== 3 && move.length !== 4) return []
    const [cell, digit, notes, corner] = move
    if (!validNumberValue(cell, editable.length - 1) || !editable[cell] ||
      !validNumberValue(digit, maxValue) || !validNumberValue(notes, maxNotes) ||
      move.length === 4 && !validNumberValue(corner, maxNotes)) return []
    recent[index] = corner ? [cell, digit, notes, corner] : [cell, digit, notes]
  }
  return recent
}

// Results need the current values. Read notes and undo history only if they
// are the only evidence that the player started a blank grid.
export function numberValuesWithMoves(saved: SavedNumberProgress, editable: readonly boolean[], maxValue: number) {
  const values = readNumberValues(saved, editable, maxValue)
  if (!values || values.some(Boolean)) return values
  const maxNotes = 2 ** maxValue - 1
  const hasNotes = editable.some((write, index) => {
    const notes = saved.notes[index]
    return write && validNumberValue(notes, maxNotes) && notes > 0
  })
  const corner = Array.isArray(saved.cornerNotes) ? saved.cornerNotes : undefined
  const hasCornerNotes = corner?.length === editable.length && editable.some((write, index) =>
    write && validNumberValue(corner[index], maxNotes) && corner[index] > 0)
  if (hasNotes || hasCornerNotes || saved.annotationsHidden === false || readNumberHistory(saved.past, editable, maxValue, maxNotes).length ||
    readNumberHistory(saved.future, editable, maxValue, maxNotes).length) return values
  return null
}

export function parseNumberProgress(saved: SavedNumberProgress, editable: readonly boolean[], maxValue: number): NumberProgress | null {
  const values = readNumberValues(saved, editable, maxValue)
  if (!values) return null
  const maxNotes = 2 ** maxValue - 1
  const { notes, cornerNotes, past, future } = saved
  const readNotes = (marks: unknown[]) =>
    editable.map((write, index) => write && validNumberValue(marks[index], maxNotes) ? marks[index] : 0)
  const corner = Array.isArray(cornerNotes) && cornerNotes.length === editable.length ? readNotes(cornerNotes) : undefined
  const clock = readNumberClock(saved.clock)
  const lastPlayed = readNumberLastPlayed(saved.lastPlayed)
  return {
    position: {
      values,
      notes: readNotes(notes),
      ...(corner?.some(Boolean) && { cornerNotes: corner }),
      ...(typeof saved.annotationsHidden === 'boolean' && { annotationsHidden: saved.annotationsHidden }),
    },
    past: readNumberHistory(past, editable, maxValue, maxNotes),
    future: readNumberHistory(future, editable, maxValue, maxNotes),
    ...(clock === undefined ? {} : { clock }),
    ...(lastPlayed === undefined ? {} : { lastPlayed }),
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

export function saveNumberProgress(key: string, { position, past, future, clock, lastPlayed }: NumberProgress): boolean {
  return writeNumberProgress(key, numberProgressWithClock({ ...position, past, future, clock, lastPlayed }, readNumberProgress(key) ?? undefined))
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

export function readNumberPause(key: string) {
  try { return localStorage.getItem(key + '.paused') === '1' }
  catch { return false }
}

export function saveNumberPause(key: string, paused: boolean) {
  try {
    if (paused) localStorage.setItem(key + '.paused', '1')
    else localStorage.removeItem(key + '.paused')
  } catch { /* The pause control still works for this page. */ }
}
