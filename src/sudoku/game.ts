import { STARTER } from './formats.ts'
import type { Candidate, DeductionAction, Difficulty } from './engine.ts'
import type { RatingAttempt } from './player-rating.ts'

export type Mode = 'value' | 'candidate' | 'center' | 'corner' | 'color'
export type CandidateLayout = 'grid' | 'center-corner'
export type ColorTarget = 'cell' | 'candidate'
export type ErrorMode = 'all' | 'incorrect' | 'none'
export type Source = 'starter' | 'generated' | 'imported' | 'custom' | 'draft'
export type EnterOptions = { allowMultipleValues?: boolean }

export type Position = {
  entries: string
  center: number[]
  corner: number[]
  colors: number[]
  candidateColors?: Record<number, Record<number, number>>
  eliminations?: number[]
}

export type Game = {
  id: string
  title: string
  source: Source
  difficulty?: Difficulty | null
  score?: number | null
  generatedWithAuto?: true
  ratingAttempt?: RatingAttempt
  givens: string
  position: Position
  past: Position[]
  future: Position[]
  elapsed: number
  started: boolean
  candidatesInitialized?: true
  paused: boolean
  created: number
  saved?: boolean
  archived?: boolean
  editingId?: string
  returnId?: string
}

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const EMPTY = '0'.repeat(81)
export const COLORS = ['Rose', 'Peach', 'Yellow', 'Mint', 'Blue', 'Lavender']
const HISTORY_SIZE = 64
const HOUSES = [
  ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => row * 9 + column)),
  ...Array.from({ length: 9 }, (_, column) => Array.from({ length: 9 }, (_, row) => row * 9 + column)),
  ...Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, offset) =>
    Math.floor(box / 3) * 27 + (box % 3) * 3 + Math.floor(offset / 3) * 9 + offset % 3)),
]

export function createGameId(): string {
  // getRandomValues works on plain HTTP. Set the UUID v4 version and variant bits.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

export function makeGame(id: string, title: string, givens: string, source: Source, created = Date.now()): Game {
  return {
    id, title, givens, source, created,
    position: { entries: EMPTY, center: Array(81).fill(0), corner: Array(81).fill(0), colors: Array(81).fill(0) },
    past: [], future: [], elapsed: 0, started: false, paused: false,
  }
}

export function restartGame(game: Game): Game {
  return {
    ...makeGame(game.id, game.title, game.givens, game.source, game.created),
    difficulty: game.difficulty,
    score: game.score,
    generatedWithAuto: game.generatedWithAuto,
    ratingAttempt: game.ratingAttempt && {
      ...game.ratingAttempt, priorElapsed: game.ratingAttempt.priorElapsed + game.elapsed,
    },
    saved: game.saved,
    archived: game.archived,
    editingId: game.editingId,
    returnId: game.returnId,
  }
}

export function isPuzzleSaved(game: Game): boolean {
  return game.saved ?? game.source === 'custom'
}

export const STARTER_GAME = makeGame('warmup', 'The Warm-up', STARTER, 'starter', 0)

export function peer(a: number, b: number): boolean {
  const ar = Math.floor(a / 9)
  const br = Math.floor(b / 9)
  const ac = a % 9
  const bc = b % 9
  return ar === br || ac === bc || (
    Math.floor(ar / 3) === Math.floor(br / 3) && Math.floor(ac / 3) === Math.floor(bc / 3)
  )
}

export function valuesOf(game: Game): string {
  return [...game.givens].map((digit, i) => digit === '0' ? game.position.entries[i] : digit).join('')
}

export function conflictsOf(values: string): Set<number> {
  const conflicts = new Set<number>()
  for (let i = 0; i < 81; i++) {
    if (values[i] === '0') continue
    for (let j = i + 1; j < 81; j++) {
      if (values[i] === values[j] && peer(i, j)) {
        conflicts.add(i)
        conflicts.add(j)
      }
    }
  }
  return conflicts
}

export function hasCandidate(mask: number, digit: number): boolean {
  return digit >= 1 && digit <= 9 && (mask & (1 << (digit - 1))) !== 0
}

export function candidateCount(mask: number): number {
  let count = 0
  for (let remaining = mask & 0x1ff; remaining; remaining &= remaining - 1) count++
  return count
}

export function isSolved(game: Game): boolean {
  const values = valuesOf(game)
  return game.source !== 'draft' && !values.includes('0') && !conflictsOf(values).size
}

export function progressOf(game: Game) {
  const total = [...game.givens].filter(digit => digit === '0').length
  const filled = [...game.position.entries].filter(digit => digit !== '0').length
  return { total, filled }
}

function hasCandidates({ center, corner }: Position): boolean {
  return center.some(Boolean) || corner.some(Boolean)
}

export function needsInitialCandidates(game: Game): boolean {
  // Older saves have candidate masks in their undo history without the marker.
  return !game.candidatesInitialized && !hasCandidates(game.position) &&
    !game.past.some(hasCandidates) && !game.future.some(hasCandidates)
}

export function move(game: Game, position: Position): Game {
  const { entries, center, corner } = game.position
  const candidatesInitialized = !needsInitialCandidates(game) || hasCandidates(position)
  return {
    ...game,
    candidatesInitialized: candidatesInitialized || undefined,
    position: entries === position.entries && center === position.center && corner === position.corner
      ? position : retainVisibleCandidateColors(game.givens, position),
    past: [...game.past.slice(1 - HISTORY_SIZE), game.position],
    future: [],
    started: true,
  }
}

function retainVisibleCandidateColors(givens: string, position: Position): Position {
  const { candidateColors, entries, center, corner } = position
  if (!candidateColors) return position

  const visible: NonNullable<Position['candidateColors']> = {}
  let removed = false
  for (const [key, colors] of Object.entries(candidateColors)) {
    const cell = Number(key)
    const mask = givens[cell] === '0' && entries[cell] === '0' ? center[cell] | corner[cell] : 0
    const marks = Object.entries(colors)
    const kept = marks.filter(([digit]) => hasCandidate(mask, Number(digit)))
    if (kept.length) visible[cell] = Object.fromEntries(kept)
    if (kept.length !== marks.length) removed = true
  }
  if (!removed) return position
  const next: Position = { ...position, candidateColors: visible }
  if (!Object.keys(visible).length) delete next.candidateColors
  return next
}

export function paintCandidate(game: Game, { cell, digit }: Candidate, color: number): Game {
  const { candidateColors, entries, center, corner } = game.position
  if (!Number.isInteger(color) || color < 0 || color > COLORS.length || !DIGITS.includes(digit) ||
    game.givens[cell] !== '0' || entries[cell] !== '0' || !hasCandidate(center[cell] | corner[cell], digit)) return game

  const current = candidateColors?.[cell]
  if ((current?.[digit] ?? 0) === color) return game
  const colors = { ...current }
  if (color) colors[digit] = color
  else delete colors[digit]

  const next = { ...candidateColors }
  if (Object.keys(colors).length) next[cell] = colors
  else delete next[cell]
  const position: Position = { ...game.position, candidateColors: next }
  if (!Object.keys(next).length) delete position.candidateColors
  return move(game, position)
}

export function clearCandidateColors(game: Game): Game {
  if (!game.position.candidateColors) return game
  const position = { ...game.position }
  delete position.candidateColors
  return move(game, position)
}

export function undo(game: Game): Game {
  const previous = game.past.at(-1)
  if (!previous) return game
  return {
    ...game,
    position: previous,
    past: game.past.slice(0, -1),
    future: [...game.future, game.position],
  }
}

export function redo(game: Game): Game {
  const next = game.future.at(-1)
  if (!next) return game
  return {
    ...game,
    position: next,
    future: game.future.slice(0, -1),
    past: [...game.past, game.position],
  }
}

export function enter(game: Game, selection: number[], mode: Mode, digit: number, options: EnterOptions = {}): Game {
  let { entries, center, corner, colors } = game.position
  let replacedEntry = false
  if (mode === 'color') {
    const add = digit !== 0 && selection.some((i) => colors[i] !== digit)
    colors = colors.map((color, i) => selection.includes(i) ? (add ? digit : 0) : color)
  } else {
    const editable = selection.filter((i) => game.givens[i] === '0')
    if (mode === 'value') {
      if (digit && editable.length !== 1 && !options.allowMultipleValues) return game
      for (const i of editable) {
        if (entries[i] !== '0' && entries[i] !== String(digit)) replacedEntry = true
        entries = entries.slice(0, i) + digit + entries.slice(i + 1)
      }
      if (digit) {
        const bit = 1 << (digit - 1)
        center = center.map((mask, i) => editable.includes(i) || editable.some((cell) => peer(cell, i)) ? mask & ~bit : mask)
        corner = corner.map((mask, i) => editable.includes(i) || editable.some((cell) => peer(cell, i)) ? mask & ~bit : mask)
      } else {
        center = center.map((mask, i) => editable.includes(i) && game.position.entries[i] === '0' ? 0 : mask)
        corner = corner.map((mask, i) => editable.includes(i) && game.position.entries[i] === '0' ? 0 : mask)
      }
    } else {
      const empty = editable.filter((i) => entries[i] === '0')
      const marks = mode === 'candidate' ? center.map((mask, i) => mask | corner[i]) : mode === 'center' ? center : corner
      const bit = digit ? 1 << (digit - 1) : 0
      const add = empty.some((i) => (marks[i] & bit) === 0)
      const next = marks.map((mask, i) => {
        if (!empty.includes(i)) return mask
        if (!digit) return 0
        return add ? mask | bit : mask & ~bit
      })
      if (mode === 'candidate') {
        center = Array(81).fill(0)
        corner = next
      } else if (mode === 'center') center = next
      else corner = next
    }
  }
  if (
    entries === game.position.entries &&
    center.every((mask, i) => mask === game.position.center[i]) &&
    corner.every((mask, i) => mask === game.position.corner[i]) &&
    colors.every((color, i) => color === game.position.colors[i])
  ) return game
  const position = { ...game.position, entries, center, corner, colors }
  if (replacedEntry) delete position.eliminations
  return move(game, position)
}

export function replaceCandidates(game: Game, masks: readonly number[], options: { recordHistory?: boolean } = {}): Game {
  if (masks.length !== 81) return game
  const center = Array(81).fill(0)
  const corner = masks.map((mask, index) =>
    game.givens[index] === '0' && game.position.entries[index] === '0'
      ? mask & 0x1ff & ~(game.position.eliminations?.[index] ?? 0)
      : 0)
  if (
    center.every((mask, index) => mask === game.position.center[index]) &&
    corner.every((mask, index) => mask === game.position.corner[index])
  ) return game
  const position = { ...game.position, center, corner }
  return options.recordHistory === false
    ? { ...game, candidatesInitialized: true, position: retainVisibleCandidateColors(game.givens, position), future: [] }
    : move(game, position)
}

export function completeCandidateMasks(game: Game): number[] | null {
  const values = valuesOf(game)
  const masks = game.position.center.map((mask, index) => mask | game.position.corner[index])
  return [...values].every((digit, index) => digit !== '0' || masks[index] !== 0) ? masks : null
}

export function hintEliminations(values: string, displayedCandidates: readonly number[] | null, applied?: readonly number[]) {
  if (!displayedCandidates) return applied
  return displayedCandidates.map((mask, cell) => {
    const removed = applied?.[cell] ?? 0
    return values[cell] === '0' ? removed | (0x1ff & ~mask) : removed
  })
}

export function fillEntries(game: Game, nextValues: string): Game {
  if (!/^[0-9]{81}$/.test(nextValues)) return game
  const entries = [...game.position.entries]
  const center = [...game.position.center]
  const corner = [...game.position.corner]
  let changed = false

  for (let index = 0; index < 81; index++) {
    const digit = Number(nextValues[index])
    if (game.givens[index] !== '0' || entries[index] !== '0' || digit === 0) continue
    entries[index] = String(digit)
    center[index] = 0
    corner[index] = 0
    const bit = 1 << (digit - 1)
    for (let peerIndex = 0; peerIndex < 81; peerIndex++) {
      if (!peer(index, peerIndex)) continue
      center[peerIndex] &= ~bit
      corner[peerIndex] &= ~bit
    }
    changed = true
  }

  return changed ? move(game, { ...game.position, entries: entries.join(''), center, corner }) : game
}

export function applyDeduction(game: Game, actions: readonly DeductionAction[], candidates: readonly number[]): Game {
  const first = actions[0]
  if (!first) return game
  const values = valuesOf(game)
  if ('place' in first) {
    const { cell, digit } = first.place
    if (values[cell] !== '0' || !hasCandidate(candidates[cell], digit)) return game
    return fillEntries(game, values.slice(0, cell) + digit + values.slice(cell + 1))
  }

  const { center, corner } = game.position
  const eliminations = [...(game.position.eliminations ?? Array(81).fill(0))]
  const affected = new Set<number>()
  for (const action of actions) {
    if (!('eliminate' in action)) return game
    const { cell, digit } = action.eliminate
    if (values[cell] !== '0' || !hasCandidate(candidates[cell] & ~eliminations[cell], digit)) return game
    eliminations[cell] |= 1 << (digit - 1)
    affected.add(cell)
  }
  return move(game, {
    ...game.position,
    eliminations,
    center: center.map((mask, cell) => affected.has(cell) ? mask & ~eliminations[cell] : mask),
    corner: corner.map((mask, cell) => {
      if (!affected.has(cell)) return mask
      const displayed = mask || center[cell] ? mask : candidates[cell]
      return displayed & ~eliminations[cell]
    }),
  })
}

export function singleFromCandidates(values: string, masks: readonly number[], eliminations?: readonly number[]): [number, number] | null {
  if (values.length !== 81 || masks.length !== 81) return null
  const remaining = (cell: number) => masks[cell] & ~(eliminations?.[cell] ?? 0)
  for (let index = 0; index < 81; index++) {
    const mask = remaining(index)
    if (values[index] === '0' && mask && (mask & (mask - 1)) === 0) {
      return [index, Math.log2(mask) + 1]
    }
  }
  for (const house of HOUSES) {
    for (let digit = 1; digit <= 9; digit++) {
      if (house.some((index) => values[index] === String(digit))) continue
      const bit = 1 << (digit - 1)
      const cells = house.filter((index) => values[index] === '0' && (remaining(index) & bit) !== 0)
      if (cells.length === 1) return [cells[0], digit]
    }
  }
  return null
}

export function marksOf(mask: number): number[] {
  return DIGITS.filter((digit) => mask & (1 << (digit - 1)))
}

export function formatTime(elapsed: number): string {
  const seconds = Math.floor(elapsed)
  const time = [Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':')
  return seconds < 3600 ? time : `${Math.floor(seconds / 3600)}:${time}`
}
