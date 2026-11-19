import { STARTER } from './formats.ts'
import type { Candidate, DeductionAction, Difficulty, VariantPuzzle } from './engine.ts'
import { globalEntropyState } from './global-entropy.ts'
import { betweenState } from './between.ts'
import { littleKillerState } from './little-killer.ts'
import { sandwichState } from './sandwich.ts'
import { regionSumState } from './region-sum.ts'
import { isPuzzleVariantId, variantDigitExclusions, variantHouseCells, variantPeers, type VariantGame } from './variants.ts'
import type { RatingAttempt } from './player-rating.ts'
import type { ActionHistoryEntry } from './action-history.ts'
import type { CollectionReference } from './collection-reference.ts'

export type Mode = 'value' | 'candidate' | 'center' | 'corner' | 'color'
export type CandidateLayout = 'grid' | 'center-corner'
export type ColorTarget = 'cell' | 'candidate'
export type ErrorMode = 'all' | 'incorrect' | 'none'
export type Source = 'starter' | 'generated' | 'imported' | 'collection' | 'custom' | 'draft'
export type EnterOptions = { allowMultipleValues?: boolean; toggleValue?: boolean; candidateAction?: 'add' | 'remove' }

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
  collection?: CollectionReference
  difficulty?: Difficulty | null
  score?: number | null
  variant?: VariantGame
  generatedWithAuto?: true
  ratingAttempt?: RatingAttempt
  analysisUsed?: true
  givens: string
  position: Position
  past: Position[]
  future: Position[]
  actionHistory?: ActionHistoryEntry[]
  elapsed: number
  timeUntracked?: true
  started: boolean
  candidatesInitialized?: true
  paused: boolean
  created: number
  saved?: boolean
  savedForLater?: true
  archived?: boolean
  editingId?: string
  returnId?: string
}

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const EMPTY = '0'.repeat(81)
export const COLOR_FAMILIES = ['Rose', 'Peach', 'Yellow', 'Mint', 'Blue', 'Lavender']
// Keep IDs 1–6 unchanged so saved puzzles retain their original shades.
export const COLORS = [...COLOR_FAMILIES, ...COLOR_FAMILIES.map((name) => `Dark ${name.toLowerCase()}`)]

export function alternateColorShade(color: number): number | null {
  if (!Number.isInteger(color) || color < 1 || color > COLORS.length) return null
  return color <= COLOR_FAMILIES.length ? color + COLOR_FAMILIES.length : color - COLOR_FAMILIES.length
}
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
    collection: game.collection,
    score: game.score,
    variant: game.variant,
    generatedWithAuto: game.generatedWithAuto,
    analysisUsed: game.analysisUsed,
    ratingAttempt: game.ratingAttempt && {
      ...game.ratingAttempt, priorElapsed: game.ratingAttempt.priorElapsed + game.elapsed,
      timeUntracked: game.timeUntracked || game.ratingAttempt.timeUntracked,
    },
    saved: game.saved,
    savedForLater: game.savedForLater,
    archived: game.archived,
    editingId: game.editingId,
    returnId: game.returnId,
  }
}

export function isPuzzleSaved(game: Game): boolean {
  return game.savedForLater || (game.saved ?? game.source === 'custom')
}

export function puzzleIdentity(game: Pick<Game, 'givens'> & { variant?: Pick<VariantGame, 'id' | 'puzzle'> }): string {
  return game.variant ? `${game.variant.id}:${JSON.stringify(orderedPuzzleFields(game.variant.puzzle))}` : game.givens
}

// Keep the engine's established field order so existing generated-puzzle keys
// stay stable, while object insertion order in imported JSON cannot create a replay.
const puzzleFieldOrder = ['type', 'version', 'givens', 'regions', 'rules', 'diagonal', 'cages', 'coverGrid',
  'consecutive', 'ratioTwo', 'circle', 'cells', 'sum', 'pairs', 'negative', 'topLeft', 'digits']

function orderedPuzzleFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedPuzzleFields)
  if (!value || typeof value !== 'object') return value
  const fields = Object.entries(value).sort(([left], [right]) => {
    const rank = (key: string) => {
      const index = puzzleFieldOrder.indexOf(key)
      return index < 0 ? puzzleFieldOrder.length : index
    }
    return rank(left) - rank(right) || (left < right ? -1 : left > right ? 1 : 0)
  })
  return Object.fromEntries(fields.map(([key, item]) => [key, orderedPuzzleFields(item)]))
}

export function normalizePuzzleIdentity(identity: string): string {
  const separator = identity.indexOf(':')
  const variant = identity.slice(0, separator)
  if (separator < 0 || !isPuzzleVariantId(variant) || variant === 'classic') return identity
  try {
    const puzzle: unknown = JSON.parse(identity.slice(separator + 1))
    if (puzzle && typeof puzzle === 'object' && !Array.isArray(puzzle)) {
      return identity.slice(0, separator + 1) + JSON.stringify(orderedPuzzleFields(puzzle))
    }
  } catch { /* An unrecognized historical key remains unchanged. */ }
  return identity
}

export const STARTER_GAME = makeGame('warmup', 'The Warm-up', STARTER, 'starter', 0)

export function peer(a: number, b: number, puzzle?: VariantPuzzle): boolean {
  const ar = Math.floor(a / 9)
  const br = Math.floor(b / 9)
  const ac = a % 9
  const bc = b % 9
  if (ar === br || ac === bc) return true
  if (puzzle?.regions?.type === 'jigsaw') {
    return puzzle.regions.regions.some((region) => region.includes(a) && region.includes(b)) || variantPeers(puzzle, a, b)
  }
  return (Math.floor(ar / 3) === Math.floor(br / 3) && Math.floor(ac / 3) === Math.floor(bc / 3)) || variantPeers(puzzle, a, b)
}

export function valuesOf(game: Game): string {
  return [...game.givens].map((digit, i) => digit === '0' ? game.position.entries[i] : digit).join('')
}

function placedRuleState(puzzle: VariantPuzzle | undefined, values: string) {
  const states = [globalEntropyState(puzzle, values), betweenState(puzzle, values), regionSumState(puzzle, values), sandwichState(puzzle, values), littleKillerState(puzzle, values)]
    .filter(state => state !== undefined)
  const result = states[0]
  if (!result) return
  for (const state of states.slice(1)) {
    for (let cell = 0; cell < 81; cell++) result.allowed[cell] &= state.allowed[cell]
    for (const cell of state.conflicts) result.conflicts.add(cell)
  }
  return result
}

export function conflictsOf(values: string, puzzle?: VariantPuzzle): Set<number> {
  const conflicts = new Set<number>()
  for (let i = 0; i < 81; i++) {
    if (values[i] === '0') continue
    for (let j = i + 1; j < 81; j++) {
      if (values[i] === values[j] && peer(i, j, puzzle) ||
        values[j] !== '0' && (variantDigitExclusions(puzzle, i, j, Number(values[i])) & 1 << (Number(values[j]) - 1))) {
        conflicts.add(i)
        conflicts.add(j)
      }
    }
  }
  for (const cell of placedRuleState(puzzle, values)?.conflicts ?? []) conflicts.add(cell)
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
  return game.source !== 'draft' && (game.variant ? values === game.variant.solution : !values.includes('0') && !conflictsOf(values).size)
}

export function setGamePaused(game: Game, paused: boolean): Game {
  if (game.paused === paused || game.source === 'draft' || !game.started || isSolved(game)) return game
  return { ...game, paused }
}

export function markSolveUntimed(game: Game): Game {
  return game.timeUntracked ? game : { ...game, elapsed: 0, timeUntracked: true }
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

export function paintCandidate(game: Game, candidate: Candidate, color: number): Game {
  return paintCandidates(game, [{ ...candidate, color }])
}

export function paintCells(game: Game, marks: readonly { cell: number; color: number }[]): Game {
  const colors = [...game.position.colors]
  for (const { cell, color } of marks) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= 81 ||
      !Number.isInteger(color) || color < 0 || color > COLORS.length) continue
    colors[cell] = color
  }
  return colors.every((color, cell) => color === game.position.colors[cell]) ? game
    : move(game, { ...game.position, colors })
}

export function paintCandidates(game: Game, marks: readonly (Candidate & { color: number })[]): Game {
  const { candidateColors, entries, center, corner } = game.position
  const next = { ...candidateColors }
  let changed = false
  for (const { cell, digit, color } of marks) {
    if (!Number.isInteger(color) || color < 0 || color > COLORS.length || !DIGITS.includes(digit) ||
      game.givens[cell] !== '0' || entries[cell] !== '0' || !hasCandidate(center[cell] | corner[cell], digit)) continue
    const current = next[cell]
    if ((current?.[digit] ?? 0) === color) continue
    const colors = { ...current }
    if (color) colors[digit] = color
    else delete colors[digit]
    if (Object.keys(colors).length) next[cell] = colors
    else delete next[cell]
    changed = true
  }
  if (!changed) return game
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
    if (!Number.isInteger(digit) || digit < 0 || digit > COLORS.length) return game
    const add = digit !== 0 && selection.some((i) => colors[i] !== digit)
    colors = colors.map((color, i) => selection.includes(i) ? (add ? digit : 0) : color)
  } else {
    const editable = selection.filter((i) => game.givens[i] === '0')
    if (mode === 'value') {
      const value = options.toggleValue && editable.length === 1 && entries[editable[0]] === String(digit) ? 0 : digit
      if (value && editable.length !== 1 && !options.allowMultipleValues) return game
      for (const i of editable) {
        if (entries[i] !== '0' && entries[i] !== String(value)) replacedEntry = true
        entries = entries.slice(0, i) + value + entries.slice(i + 1)
      }
      if (value) {
        const bit = 1 << (value - 1)
        const clearCandidates = (mask: number, i: number) => editable.reduce((remaining, cell) =>
          remaining & ~((peer(cell, i, game.variant?.puzzle) ? bit : 0) |
            variantDigitExclusions(game.variant?.puzzle, cell, i, value)), mask)
        const values = [...game.givens].map((given, i) => given === '0' ? entries[i] : given).join('')
        const ruleMasks = placedRuleState(game.variant?.puzzle, values)?.allowed
        center = center.map((mask, i) => clearCandidates(mask, i) & (ruleMasks?.[i] ?? 511))
        corner = corner.map((mask, i) => clearCandidates(mask, i) & (ruleMasks?.[i] ?? 511))
      } else {
        center = center.map((mask, i) => editable.includes(i) && game.position.entries[i] === '0' ? 0 : mask)
        corner = corner.map((mask, i) => editable.includes(i) && game.position.entries[i] === '0' ? 0 : mask)
      }
    } else {
      const empty = editable.filter((i) => entries[i] === '0')
      const marks = mode === 'candidate' ? center.map((mask, i) => mask | corner[i]) : mode === 'center' ? center : corner
      const bit = digit ? 1 << (digit - 1) : 0
      const add = options.candidateAction ? options.candidateAction === 'add' : empty.some((i) => (marks[i] & bit) === 0)
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

/** Rebuild a live Pencil drag from its starting position so the whole stroke is one undo step. */
export function paintCandidateStroke(
  current: Game, start: Game, cells: readonly number[], mode: 'candidate' | 'center' | 'corner',
  digit: number, action: 'add' | 'remove',
): Game {
  if (current.id !== start.id || current.givens !== start.givens ||
    current.position.entries !== start.position.entries || current.paused) return current
  const origin = {
    ...current,
    position: start.position,
    past: start.past,
    future: start.future,
    candidatesInitialized: start.candidatesInitialized,
    started: start.started,
  }
  return enter(origin, [...cells], mode, digit, { candidateAction: action })
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
      const removed = (peer(index, peerIndex, game.variant?.puzzle) ? bit : 0) |
        variantDigitExclusions(game.variant?.puzzle, index, peerIndex, digit)
      center[peerIndex] &= ~removed
      corner[peerIndex] &= ~removed
    }
    changed = true
  }

  if (changed) {
    const values = [...game.givens].map((given, i) => given === '0' ? entries[i] : given).join('')
    const ruleMasks = placedRuleState(game.variant?.puzzle, values)?.allowed
    if (ruleMasks) for (let cell = 0; cell < 81; cell++) {
      center[cell] &= ruleMasks[cell]
      corner[cell] &= ruleMasks[cell]
    }
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

export function singleFromCandidates(values: string, masks: readonly number[], eliminations?: readonly number[], variant?: VariantPuzzle): [number, number] | null {
  if (values.length !== 81 || masks.length !== 81) return null
  const remaining = (cell: number) => masks[cell] & ~(eliminations?.[cell] ?? 0)
  for (let index = 0; index < 81; index++) {
    const mask = remaining(index)
    if (values[index] === '0' && mask && (mask & (mask - 1)) === 0) {
      return [index, Math.log2(mask) + 1]
    }
  }
  const houses = variant?.regions?.type === 'jigsaw' ? [...HOUSES.slice(0, 18), ...variant.regions.regions] : HOUSES
  const extra = variant?.rules?.flatMap((rule, index) => {
    if (rule.type === 'diagonal') return [variantHouseCells({ diagonal: rule.diagonal }, variant)]
    if (rule.type === 'extra-house') return [variantHouseCells({ extra: index }, variant)]
    return []
  }) ?? []
  for (const house of [...houses, ...extra]) {
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

export function onlyCandidate(mask: number): number | null {
  const candidates = marksOf(mask)
  return candidates.length === 1 ? candidates[0] : null
}

export function formatTime(elapsed: number): string {
  const seconds = Math.floor(elapsed)
  const time = [Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':')
  return seconds < 3600 ? time : `${Math.floor(seconds / 3600)}:${time}`
}
