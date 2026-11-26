import { sizedQuadrupleState } from './sized-quadruple.ts'
import { nonogramState } from './sized-nonogram.ts'
import { skyscrapersState as sizedSkyscrapersState } from './sized-skyscrapers.ts'
import { fogView, playVariantPuzzle } from './fog.ts'
import { linkedDoubleArrowCells, linkedDoubleArrowConflicts } from './sized-linked-double-arrow.ts'
import { STARTER } from './formats.ts'
import { sizedKillerState } from './sized-killer.ts'
import { variantPlacedRuleState } from './variant-placed-rules.ts'
import { CLASSIC_GRID, gridHouseCells, gridRegionIndex, isGridText, sizedGridIdentity, gridDiagonalCells, gridValueOffset, sizedArrowState, sizedDigitExclusions, type SizedGrid, type PlayGrid, type JigsawGrid } from './grid.ts'
import { positionDigit, positionSymbol } from './digit-symbols.ts'
import type { Candidate, DeductionAction, Difficulty, VariantPuzzle, VariantRule } from './engine.ts'
import { globalEntropyState } from './global-entropy.ts'
import { endpointLineState } from './between.ts'
import { pillArrowState } from './pill-arrow.ts'
import { whispersState } from './whispers.ts'
import { littleKillerState } from './little-killer.ts'
import { sandwichState } from './sandwich.ts'
import { xSumState } from './x-sum.ts'
import { skyscrapersState } from './skyscrapers.ts'
import { regionSumState, sizedRegionSumState } from './region-sum.ts'
import { isPuzzleVariantId, puzzleForVariantTools, variantDigitExclusions, variantHouseCells, variantPeers, type VariantGame, type VariantToolId } from './variants.ts'
import type { RatingAttempt } from './player-rating.ts'
import type { ActionHistoryEntry } from './action-history.ts'
import { createUuid } from '../uuid.ts'
import type { CollectionReference } from './collection-reference.ts'
import type { ChainSketchState } from './chain-sketch.ts'
import type { SizedRuleGame } from './sized-rule-game.ts'
import type { AlgebraicGame } from './algebraic-game.ts'
import type { CustomModeDefinition } from './custom-modes.ts'
import type { AlgebraicCage } from './algebraic-cages.ts'
import type { CandidateColors, ImportedCellColors } from './imported-colors.ts'
import type { ImportedDrawing } from './imported-drawings.ts'
import type { AuthoredMark } from './authored-artwork.ts'

export type Mode = 'value' | 'candidate' | 'center' | 'corner' | 'color'
export type CandidateLayout = 'grid' | 'center-corner'
export type ColorTarget = 'cell' | 'candidate'
export type ErrorMode = 'all' | 'incorrect' | 'conflicts' | 'none'
export type Source = 'starter' | 'generated' | 'imported' | 'collection' | 'custom' | 'draft'
export type EnterOptions = { allowMultipleValues?: boolean; toggleValue?: boolean; candidateAction?: 'add' | 'remove'; removeCandidates?: boolean; variantRules?: readonly VariantToolId[] }

export type Position = {
  entries: string
  shades?: string
  center: number[]
  corner: number[]
  colors: number[]
  /** Additional player shades for cells with more than one shade. `colors` remains the primary shade for compatibility. */
  cellColors?: Record<number, readonly number[]>
  importedCellColors?: ImportedCellColors
  candidateColors?: CandidateColors<number>
  importedCandidateColors?: CandidateColors<string>
  importedDrawings?: readonly ImportedDrawing[]
  eliminations?: number[]
  draftCages?: readonly AlgebraicCage[]
  draftSizedRules?: SizedRuleGame['rules']
  draftRegions?: JigsawGrid['regions']
}

export type HistoryPosition = Position & { chainSketch?: ChainSketchState | null }

export type PuzzleBookmark = {
  id: string
  name: string
  position: Position
  chainSketch?: ChainSketchState
}

export const BOOKMARK_NAME_LIMIT = 72

export type Game = {
  id: string
  title: string
  source: Source
  collection?: CollectionReference
  sharedPuzzleId?: string
  whispersGuide?: true
  givenCellColors?: ImportedCellColors
  authoredArtwork?: readonly AuthoredMark[]
  uniquenessProof?: string
  nonUnique?: true
  difficulty?: Difficulty | null
  score?: number | null
  fogRatingVersion?: number
  variantRatingVersion?: number
  variant?: VariantGame
  grid?: SizedGrid
  algebraic?: AlgebraicGame
  sized?: SizedRuleGame
  customMode?: CustomModeDefinition
  practiceTechnique?: string
  generatedWithAuto?: true
  ratingAttempt?: RatingAttempt
  analysisUsed?: true
  givens: string
  position: Position
  past: HistoryPosition[]
  future: HistoryPosition[]
  bookmarks?: readonly PuzzleBookmark[]
  actionHistory?: ActionHistoryEntry[]
  chainSketch?: ChainSketchState
  elapsed: number
  timeUntracked?: true
  started: boolean
  candidatesInitialized?: true
  paused: boolean
  created: number
  saved?: boolean
  savedForLater?: true
  pendingSave?: true
  archived?: boolean
  editingId?: string
  returnId?: string
}

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const EMPTY = '0'.repeat(81)
export const COLOR_FAMILIES = ['Rose', 'Peach', 'Yellow', 'Mint', 'Blue', 'Lavender']
// Keep IDs 1–6 unchanged so saved puzzles retain their original shades.
export const COLORS = [...COLOR_FAMILIES, ...COLOR_FAMILIES.map((name) => `Dark ${name.toLowerCase()}`)]
export const COLOR_TONES = ['#f5c7d4', '#f7d4b8', '#f8e8a8', '#c4ebd4', '#cce1fc', '#e3d2fa',
  '#e285a2', '#eaa065', '#e0bf4b', '#73bd95', '#83afe9', '#ae91da']

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
  return createUuid()
}

export function makeGame(id: string, title: string, givens: string, source: Source, created = Date.now(), grid?: SizedGrid): Game {
  const cellCount = (grid ?? CLASSIC_GRID).size ** 2
  return {
    id, title, givens, source, created, ...(grid && { grid }),
    position: {
      entries: '0'.repeat(cellCount), center: Array(cellCount).fill(0), corner: Array(cellCount).fill(0), colors: Array(cellCount).fill(0),
      ...(source === 'draft' && grid && ('regions' in grid || 'noRegions' in grid) && { draftSizedRules: [], ...('regions' in grid && { draftRegions: grid.regions }) }),
    },
    past: [], future: [], elapsed: 0, started: false, paused: false,
  }
}

export function setAqreShade(game: Game, cell: number, shade: 'unknown' | 'unshaded' | 'shaded'): Game {
  if (!Number.isInteger(cell) || cell < 0 || cell >= game.position.entries.length || game.givens[cell] !== '0') return game
  if (game.variant?.puzzle.rules?.some(rule => rule.type === 'aqre' && rule.givenShades.some(given => given.cell === cell))) return game
  const current = game.position.shades ?? '0'.repeat(game.position.entries.length)
  const next = current.slice(0, cell) + (shade === 'unknown' ? '0' : shade === 'unshaded' ? '1' : '2') + current.slice(cell + 1)
  return next === current ? game : move(game, { ...game.position, shades: next })
}

export function restartGame(game: Game): Game {
  return {
    ...makeGame(game.id, game.title, game.givens, game.source, game.created, game.grid),
    difficulty: game.difficulty,
    collection: game.collection,
    sharedPuzzleId: game.sharedPuzzleId,
    ...(game.whispersGuide && { whispersGuide: true }),
    ...(game.givenCellColors && { givenCellColors: game.givenCellColors }),
    ...(game.authoredArtwork && { authoredArtwork: game.authoredArtwork }),
    ...(game.uniquenessProof && { uniquenessProof: game.uniquenessProof }),
    ...(game.nonUnique && { nonUnique: true as const }),
    score: game.score,
    ...(game.fogRatingVersion !== undefined && { fogRatingVersion: game.fogRatingVersion }),
    ...(game.variantRatingVersion !== undefined && { variantRatingVersion: game.variantRatingVersion }),
    variant: game.variant,
    algebraic: game.algebraic,
    sized: game.sized,
    customMode: game.customMode,
    ...(game.practiceTechnique && { practiceTechnique: game.practiceTechnique }),
    generatedWithAuto: game.generatedWithAuto,
    analysisUsed: game.analysisUsed,
    ...(game.bookmarks && { bookmarks: game.bookmarks }),
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

export function shouldOfferPuzzleSave(game: Game | undefined): game is Game & { pendingSave: true } {
  return Boolean(game?.source === 'generated' && game.pendingSave && !game.started && !game.saved &&
    !game.savedForLater && !game.archived && !game.bookmarks?.length && !isSolved(game))
}

export function isPuzzleSaved(game: Game): boolean {
  return game.savedForLater || (game.saved ?? game.source === 'custom')
}

export function puzzleIdentity(game: Pick<Game, 'givens'> & {
  variant?: Pick<VariantGame, 'id' | 'puzzle' | 'fog'>
  algebraic?: Pick<AlgebraicGame, 'rules'>
  grid?: SizedGrid
  sized?: Pick<SizedRuleGame, 'rules'>
  sizedRules?: SizedRuleGame['rules']
}): string {
  if (game.grid && ('regions' in game.grid || game.grid.size !== 4 || game.sized || game.sizedRules?.length)) {
    const rules = game.sized?.rules ?? game.sizedRules ?? []
    const keys = [...new Set(rules.map(rule => JSON.stringify(orderedPuzzleFields(
      rule.type === 'renban' ? { type: rule.type, cells: [...rule.cells].sort((a, b) => a - b) }
        : rule.type === 'nonogram' ? { ...rule, digits: [...rule.digits].sort((a, b) => a - b) }
          : rule.type === 'parity' ? { ...rule, cells: [...rule.cells].sort((a, b) => a - b) }
          : rule.type === 'row-column-sum' ? {
            type: rule.type,
            pairs: rule.pairs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort(([a, b], [c, d]) => a - c || b - d),
            ...(rule.requireUnmarked && { requireUnmarked: true }),
          } : rule,
    ))))].sort()
    const geometry = sizedGridIdentity(game.grid)
    return `${geometry}:${game.givens}:${keys.join(',')}`
  }
  if (game.algebraic) {
    const cages = game.algebraic.rules.map(({ cells, total }) =>
      JSON.stringify(orderedPuzzleFields({ cells: [...cells].sort((a, b) => a - b), total }))).sort()
    return `algebraic:${game.givens}:${cages.join(',')}`
  }
  const { variant } = game
  if (!variant) return game.givens
  const definition = variant.fog
    ? { ...variant.puzzle, fog: { ...variant.fog, initialCells: [...variant.fog.initialCells].sort((a, b) => a - b) } }
    : variant.puzzle
  const rules = definition.rules?.map(rule => rule.type === 'digit-restriction'
    ? { ...rule, cells: [...rule.cells].sort((a, b) => a - b) }
    : rule.type === 'neighbor-match' ? { ...rule, clues: [...rule.clues].sort((a, b) => a.cell - b.cell) } : rule)
  return `${variant.id}:${JSON.stringify(orderedPuzzleFields(rules ? { ...definition, rules } : definition))}`
}

/** Bind a recorded uniqueness check to the starting givens and complete rules. */
export function uniquenessKey(game: Parameters<typeof puzzleIdentity>[0]): string {
  return `v1:${puzzleIdentity(game)}`
}

export function hasUniquenessProof(game: Pick<Game, 'givens' | 'variant' | 'grid' | 'source' | 'uniquenessProof'>): boolean {
  return !game.grid && game.source !== 'draft' && typeof game.uniquenessProof === 'string' &&
    game.uniquenessProof === uniquenessKey(game)
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

export function peer(a: number, b: number, puzzle?: VariantPuzzle, grid: PlayGrid = CLASSIC_GRID, sizedRules?: SizedRuleGame['rules']): boolean {
  const ar = Math.floor(a / grid.size)
  const br = Math.floor(b / grid.size)
  const ac = a % grid.size
  const bc = b % grid.size
  if (ar === br || ac === bc) return true
  if (sizedRules?.some(rule => rule.type === 'diagonal' && (rule.diagonal === 'main'
    ? ar === ac && br === bc : ar + ac === grid.size - 1 && br + bc === grid.size - 1))) return true
  if (puzzle?.regions && puzzle.regions.type !== 'boxes') {
    return puzzle.regions.regions.some((region) => region.includes(a) && region.includes(b)) || variantPeers(puzzle, a, b)
  }
  if (sizedRules?.some(rule => rule.type === 'extra-house' && rule.cells.includes(a) && rule.cells.includes(b))) return true
  return !('noRegions' in grid) && gridRegionIndex(grid, a) === gridRegionIndex(grid, b) || variantPeers(puzzle, a, b)
}

function gridValues(givens: string, entries: string): string {
  return [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
}

export function visibleGivensOf(game: Game): string {
  return fogView(game.variant, game.position.entries)?.puzzle.givens ?? game.givens
}

export function valuesOf(game: Game): string {
  return gridValues(visibleGivensOf(game), game.position.entries)
}

function cloneState(rules: readonly VariantRule[] | SizedRuleGame['rules'] | undefined, values: string, size: number) {
  if (!rules?.some(rule => rule.type === 'clone')) return
  const allowed = Array(values.length).fill((1 << size) - 1) as number[]
  const conflicts = new Set<number>()
  for (const rule of rules) if (rule.type === 'clone') for (const group of rule.groups) {
    const placed = group.filter(cell => values[cell] !== '0')
    if (!placed.length) continue
    const first = placed[0]
    const digit = positionDigit(values[first])
    const bit = 1 << (digit - 1)
    for (const cell of group) allowed[cell] &= bit
    for (const cell of placed.slice(1)) if (values[cell] !== values[first]) {
      conflicts.add(first)
      conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}

function placedRuleState(puzzle: VariantPuzzle | undefined, values: string, grid: PlayGrid, sizedRules?: SizedRuleGame['rules']) {
  const rules = puzzle?.rules ?? sizedRules
  const states = [
    globalEntropyState(puzzle, values), endpointLineState(puzzle, values), whispersState(puzzle, values), regionSumState(puzzle, values),
    sandwichState(puzzle, values), littleKillerState(puzzle, values), xSumState(puzzle, values), skyscrapersState(puzzle, values),
    variantPlacedRuleState(puzzle, values), pillArrowState(puzzle, values), sizedArrowState(rules, values, grid.size),
    sizedRegionSumState(sizedRules, values, grid), sizedKillerState(rules, values, grid.size),
    sizedQuadrupleState(sizedRules, values, grid.size),
    nonogramState(sizedRules, values, grid.size),
    sizedSkyscrapersState(sizedRules, values, grid.size),
    cloneState(rules, values, grid.size),
  ]
    .filter(state => state !== undefined)
  const result = states[0]
  if (!result) return
  for (const state of states.slice(1)) {
    for (let cell = 0; cell < values.length; cell++) result.allowed[cell] &= state.allowed[cell]
    for (const cell of state.conflicts) result.conflicts.add(cell)
  }
  return result
}

export function conflictsOf(values: string, puzzle?: VariantPuzzle, grid: PlayGrid = CLASSIC_GRID, sizedRules?: SizedRuleGame['rules']): Set<number> {
  const conflicts = new Set<number>()
  const cellCount = grid.size ** 2
  const valueOffset = gridValueOffset(grid)
  for (let i = 0; i < cellCount; i++) {
    const placed = values[i]
    if (placed === '0') continue
    const digit = positionDigit(placed)
    if (sizedRules?.some(rule => rule.type === 'parity' && rule.cells.includes(i) &&
      (digit - valueOffset) % 2 !== (rule.parity === 'odd' ? 1 : 0))) conflicts.add(i)
    if (sizedRules?.some(rule => rule.type === 'digit-restriction' && rule.cells.includes(i) && !rule.digits.includes(digit - valueOffset))) conflicts.add(i)
    if (puzzle?.rules?.some(rule => rule.type === 'digit-restriction' && rule.cells.includes(i) && !rule.digits.includes(digit))) conflicts.add(i)
    for (let j = i + 1; j < cellCount; j++) {
      const other = values[j]
      if (other === '0') continue
      if (placed === other && peer(i, j, puzzle, grid, sizedRules) ||
        ((variantDigitExclusions(puzzle, i, j, digit) | sizedDigitExclusions(sizedRules, i, j, digit, grid.size, valueOffset)) & 1 << (positionDigit(other) - 1))) {
        conflicts.add(i)
        conflicts.add(j)
      }
    }
  }
  for (const rule of sizedRules ?? []) {
    if (rule.type === 'parity-line') {
      for (let index = 1; index < rule.cells.length; index++) {
        const first = rule.cells[index - 1], second = rule.cells[index]
        if (values[first] !== '0' && values[second] !== '0' &&
          (positionDigit(values[first]) - valueOffset) % 2 === (positionDigit(values[second]) - valueOffset) % 2) {
          conflicts.add(first)
          conflicts.add(second)
        }
      }
    } else if (rule.type === 'palindrome') {
      for (let index = 0; index < Math.floor(rule.cells.length / 2); index++) {
        const first = rule.cells[index], second = rule.cells[rule.cells.length - index - 1]
        if (values[first] !== '0' && values[second] !== '0' && values[first] !== values[second]) {
          conflicts.add(first)
          conflicts.add(second)
        }
      }
    } else if (rule.type === 'clone') {
      for (const group of rule.groups) {
        const first = group[0]
        for (const other of group.slice(1)) if (values[first] !== '0' && values[other] !== '0' && values[first] !== values[other]) {
          conflicts.add(first)
          conflicts.add(other)
        }
      }
    }
  }
  for (const rule of sizedRules ?? []) if (rule.type === 'linked-double-arrow' && linkedDoubleArrowConflicts(rule, values, grid.size)) {
    for (const cell of linkedDoubleArrowCells(rule, grid.size)) if (values[cell] !== '0') conflicts.add(cell)
  }
  for (const cell of placedRuleState(puzzle, values, grid, sizedRules)?.conflicts ?? []) conflicts.add(cell)
  return conflicts
}

export function hasCandidate(mask: number, digit: number): boolean {
  return digit >= 1 && digit <= 9 && (mask & (1 << (digit - 1))) !== 0
}

export function placedDigitCounts(values: string) {
  const counts = Array<number>(10).fill(0)
  for (const value of values) counts[Number(value)]++
  return counts
}

export function candidateCount(mask: number): number {
  let count = 0
  for (let remaining = mask & 0x1ff; remaining; remaining &= remaining - 1) count++
  return count
}

function validCompletedAqre(values: string, shades: string,
  rule: Extract<VariantRule, { type: 'aqre' }>): boolean {
  if (shades.length !== values.length || [...shades].some(shade => shade !== '1' && shade !== '2')) return false
  for (const given of rule.givenShades) {
    if (shades[given.cell] !== (given.shade === 'shaded' ? '2' : '1')) return false
  }

  for (let line = 0; line < 9; line++) for (let start = 0; start <= 5; start++) {
    const horizontal = Array.from({ length: 4 }, (_, offset) => shades[line * 9 + start + offset])
    const vertical = Array.from({ length: 4 }, (_, offset) => shades[(start + offset) * 9 + line])
    if (horizontal.every(shade => shade === horizontal[0]) || vertical.every(shade => shade === vertical[0])) return false
  }

  for (const region of rule.regions) {
    const shaded = region.cells.filter(cell => shades[cell] === '2')
    const target = region.count?.type === 'fixed' ? region.count.value
      : region.count?.type === 'digit-cell' ? Number(values[region.count.cell]) : undefined
    if (target !== undefined && shaded.length !== target) return false
    if (rule.kind === 'plus' && region.count?.type === 'digit-cell' && shades[region.count.cell] === '2') {
      const digits = shaded.map(cell => Number(values[cell]))
      const distinct = new Set(digits)
      if (distinct.size !== digits.length || Math.max(...digits) - Math.min(...digits) + 1 !== digits.length) return false
    }
  }

  const first = shades.indexOf('2')
  if (first < 0) return false
  const reached = new Set([first])
  const pending = [first]
  while (pending.length) {
    const cell = pending.pop()!
    const row = Math.floor(cell / 9), column = cell % 9
    const neighbors = [row > 0 ? cell - 9 : -1, row < 8 ? cell + 9 : -1,
      column > 0 ? cell - 1 : -1, column < 8 ? cell + 1 : -1]
    for (const neighbor of neighbors) if (neighbor >= 0 && shades[neighbor] === '2' && !reached.has(neighbor)) {
      reached.add(neighbor)
      pending.push(neighbor)
    }
  }
  return reached.size === [...shades].filter(shade => shade === '2').length
}

export function isSolved(game: Game): boolean {
  const values = gridValues(game.givens, game.position.entries)
  const solution = game.sized?.solution ?? game.algebraic?.solution ?? game.variant?.solution
  const aqreRules = game.variant?.puzzle.rules?.filter(rule => rule.type === 'aqre') ?? []
  if (aqreRules.length) {
    const shades = [...(game.position.shades ?? '0'.repeat(game.givens.length))]
    for (const rule of aqreRules) for (const given of rule.givenShades) {
      if (shades[given.cell] === '0') shades[given.cell] = given.shade === 'shaded' ? '2' : '1'
    }
    return game.source !== 'draft' && !values.includes('0') &&
      !conflictsOf(values, game.variant?.puzzle, game.grid).size && aqreRules.every(rule =>
        rule.type === 'aqre' && validCompletedAqre(values, shades.join(''), rule))
  }
  return game.source !== 'draft' && (solution ? values === solution : !values.includes('0') && !conflictsOf(values, undefined, game.grid).size)
}

export function setGamePaused(game: Game, paused: boolean, { onOpen = false } = {}): Game {
  if (game.paused === paused || game.source === 'draft' || (paused && !game.started && !onOpen) || isSolved(game)) return game
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

export function hasCandidates({ center, corner }: Position): boolean {
  return center.some(Boolean) || corner.some(Boolean)
}

export function needsInitialCandidates(game: Game): boolean {
  // Older saves have candidate masks in their undo history without the marker.
  return !game.candidatesInitialized && !hasCandidates(game.position) &&
    !game.past.some(hasCandidates) && !game.future.some(hasCandidates)
}

function draftGridAt(game: Game, position: Position) {
  const { grid } = game
  const { draftRegions } = position
  return game.source === 'draft' && grid && 'regions' in grid && draftRegions && draftRegions !== grid.regions
    ? { ...grid, regions: draftRegions } : grid
}

export function move(game: Game, position: Position): Game {
  const { entries, center, corner } = game.position
  const candidatesInitialized = !needsInitialCandidates(game) || hasCandidates(position)
  const grid = draftGridAt(game, position)
  return {
    ...game, ...(grid !== game.grid && { grid }),
    candidatesInitialized: candidatesInitialized || undefined,
    position: entries === position.entries && center === position.center && corner === position.corner
      ? position : retainCandidateColors(game.givens, game.position, position),
    past: [...game.past.slice(1 - HISTORY_SIZE), game.position],
    future: [],
    started: true,
  }
}

function filterCandidateColors<Shade>(colors: CandidateColors<Shade> | undefined, maskFor: (cell: number) => number) {
  if (!colors) return
  const kept: CandidateColors<Shade> = {}
  let removed = false
  for (const [key, marks] of Object.entries(colors)) {
    const cell = Number(key)
    const mask = maskFor(cell)
    const entries = Object.entries(marks)
    const allowed = entries.filter(([digit]) => hasCandidate(mask, Number(digit)))
    if (allowed.length) kept[cell] = Object.fromEntries(allowed)
    if (allowed.length !== entries.length) removed = true
  }
  if (!removed) return colors
  return Object.keys(kept).length ? kept : undefined
}

function retainCandidateColors(givens: string, previous: Position, position: Position): Position {
  const { candidateColors, importedCandidateColors, entries, center, corner, eliminations } = position
  if (!candidateColors && !importedCandidateColors) return position
  const empty = (cell: number) => givens[cell] === '0' && entries[cell] === '0'
  const native = filterCandidateColors(candidateColors, cell => empty(cell) ? center[cell] | corner[cell] : 0)
  // A Coach export can carry a shade for a digit that its candidate lists do not show.
  // Keep that shade until the player removes the candidate, places a digit, or clears the colors.
  const imported = filterCandidateColors(importedCandidateColors, cell => empty(cell)
    ? ((center[cell] | corner[cell]) | ~(previous.center[cell] | previous.corner[cell])) & ~(eliminations?.[cell] ?? 0)
    : 0)
  if (native === candidateColors && imported === importedCandidateColors) return position
  const next = { ...position, candidateColors: native, importedCandidateColors: imported }
  if (!native) delete next.candidateColors
  if (!imported) delete next.importedCandidateColors
  return next
}

export function paintCandidate(game: Game, candidate: Candidate, color: number): Game {
  return paintCandidates(game, [{ ...candidate, color }])
}

/** Toggle one candidate's selected shade, preserving explicit paintCandidate set and erase semantics. */
export function toggleCandidateColor(game: Game, candidate: Candidate, color: number): Game {
  if (!Number.isInteger(color) || color < 0 || color > COLORS.length) return game
  const current = game.position.candidateColors?.[candidate.cell]?.[candidate.digit] ?? 0
  return paintCandidate(game, candidate, color > 0 && current === color ? 0 : color)
}

const NO_CELL_COLORS: readonly number[] = []
const SINGLE_CELL_COLOR_SHADES = COLORS.map((_, index) => [index + 1] as const)

export function cellColorShades(position: Pick<Position, 'colors' | 'cellColors'>, cell: number): readonly number[] {
  const shades = position.cellColors?.[cell]
  return shades ?? (position.colors[cell] ? SINGLE_CELL_COLOR_SHADES[position.colors[cell] - 1] : NO_CELL_COLORS)
}

export function sameCellColors(a: Pick<Position, 'colors' | 'cellColors'>, b: Pick<Position, 'colors' | 'cellColors'>): boolean {
  return a.colors.length === b.colors.length && a.colors.every((_, cell) => {
    const left = cellColorShades(a, cell), right = cellColorShades(b, cell)
    return left.length === right.length && left.every((shade, index) => shade === right[index])
  })
}

export function withCellColors(position: Position, marks: readonly { cell: number; color: number }[]): Position {
  const colors = [...position.colors]
  let cellColors: Record<number, readonly number[]> = position.cellColors ?? {}
  let copiedCellColors = false
  let imported = position.importedCellColors
  for (const { cell, color } of marks) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= colors.length ||
      !Number.isInteger(color) || color < 0 || color > COLORS.length) continue
    const current = cellColorShades({ colors, cellColors }, cell)
    const next = color === 0 ? NO_CELL_COLORS : current.includes(color)
      ? current.filter(shade => shade !== color) : [...current, color]
    const changed = current.length !== next.length || current.some((shade, index) => shade !== next[index])
    if (changed) {
      colors[cell] = next[0] ?? 0
      if (!copiedCellColors) {
        cellColors = { ...cellColors }
        copiedCellColors = true
      }
      if (next.length > 1) cellColors[cell] = next
      else delete cellColors[cell]
    }
    if (imported?.[cell]) {
      if (imported === position.importedCellColors) imported = { ...imported }
      delete imported[cell]
    }
  }
  if (imported === position.importedCellColors && !copiedCellColors && colors.every((color, cell) => color === position.colors[cell])) return position
  const next = { ...position, colors }
  if (copiedCellColors && Object.keys(cellColors).length) next.cellColors = cellColors
  else if (copiedCellColors) delete next.cellColors
  if (imported && Object.keys(imported).length) next.importedCellColors = imported
  else delete next.importedCellColors
  return next
}

export function paintCells(game: Game, marks: readonly { cell: number; color: number }[]): Game {
  const position = withCellColors(game.position, marks)
  return position === game.position ? game : move(game, position)
}

export function paintCandidates(game: Game, marks: readonly (Candidate & { color: number })[]): Game {
  const { candidateColors, importedCandidateColors, entries, center, corner } = game.position
  const next = { ...candidateColors }
  let imported = importedCandidateColors
  let changed = false
  for (const { cell, digit, color } of marks) {
    if (!Number.isInteger(color) || color < 0 || color > COLORS.length || !DIGITS.includes(digit) ||
      game.givens[cell] !== '0' || entries[cell] !== '0' || !hasCandidate(center[cell] | corner[cell], digit)) continue
    const current = next[cell]
    const source = imported?.[cell]
    if ((current?.[digit] ?? 0) === color && !source?.[digit]) continue
    if (imported && source?.[digit]) {
      if (imported === importedCandidateColors) imported = { ...imported }
      const remaining = { ...source }
      delete remaining[digit]
      if (Object.keys(remaining).length) imported[cell] = remaining
      else delete imported[cell]
    }
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
  if (imported && Object.keys(imported).length) position.importedCandidateColors = imported
  else delete position.importedCandidateColors
  return move(game, position)
}

export function digitsFromMask(mask: number, gridSize: number = CLASSIC_GRID.size): number[] {
  return Array.from({ length: gridSize }, (_, index) => index + 1).filter(digit => hasCandidate(mask, digit))
}

/** Paint every available candidate for a digit set, toggling the shade off when all already match. */
export function paintCandidateGroup(game: Game, digits: readonly number[], color: number): Game {
  const gridSize = (game.grid ?? CLASSIC_GRID).size
  const selected = new Set(digits.filter(digit => Number.isInteger(digit) && digit >= 1 && digit <= gridSize))
  if (!selected.size) return game
  const marks: (Candidate & { color: number })[] = []
  for (let cell = 0; cell < game.position.entries.length; cell++) {
    if (game.givens[cell] !== '0' || game.position.entries[cell] !== '0') continue
    const candidates = game.position.center[cell] | game.position.corner[cell]
    for (const digit of selected) {
      if (hasCandidate(candidates, digit)) marks.push({ cell, digit, color })
    }
  }
  if (!marks.length) return game
  const removeColor = color > 0 && marks.every(({ cell, digit }) => game.position.candidateColors?.[cell]?.[digit] === color)
  return paintCandidates(game, marks.map(mark => ({ ...mark, color: removeColor ? 0 : color })))
}

export function clearCandidateColors(game: Game): Game {
  if (!game.position.candidateColors && !game.position.importedCandidateColors) return game
  const position = { ...game.position }
  delete position.candidateColors
  delete position.importedCandidateColors
  return move(game, position)
}

export function clearImportedDrawings(game: Game): Game {
  if (!game.position.importedDrawings) return game
  const position = { ...game.position }
  delete position.importedDrawings
  return move(game, position)
}

function swapHistoryPosition(game: Game, target: HistoryPosition) {
  const grid = draftGridAt(game, target)
  const restored = { ...game, ...(grid !== game.grid && { grid }) }
  if (target.chainSketch === undefined) return { game: { ...restored, position: target }, snapshot: game.position }
  const { chainSketch, ...position } = target
  return {
    game: { ...restored, position, chainSketch: chainSketch ?? undefined },
    snapshot: { ...game.position, chainSketch: game.chainSketch ?? null },
  }
}

export function undo(game: Game): Game {
  const previous = game.past.at(-1)
  if (!previous) return game
  const step = swapHistoryPosition(game, previous)
  return {
    ...step.game,
    past: game.past.slice(0, -1),
    future: [...game.future, step.snapshot],
  }
}

export function redo(game: Game): Game {
  const next = game.future.at(-1)
  if (!next) return game
  const step = swapHistoryPosition(game, next)
  return {
    ...step.game,
    future: game.future.slice(0, -1),
    past: [...game.past, step.snapshot],
  }
}

export function createPuzzleBookmark(game: Game, name: string): PuzzleBookmark {
  const names = new Set(game.bookmarks?.map(bookmark => bookmark.name))
  let number = 1
  while (names.has(`Bookmark ${number}`)) number++
  return {
    id: createGameId(), name: name.trim().slice(0, BOOKMARK_NAME_LIMIT) || `Bookmark ${number}`,
    position: game.position, ...(game.chainSketch && { chainSketch: game.chainSketch }),
  }
}

export function restorePuzzleBookmark(game: Game, bookmark: PuzzleBookmark): Game {
  if (game.source === 'draft' || (game.position === bookmark.position && game.chainSketch === bookmark.chainSketch)) return game
  return {
    ...game,
    position: bookmark.position,
    chainSketch: bookmark.chainSketch,
    past: [...game.past.slice(1 - HISTORY_SIZE), { ...game.position, chainSketch: game.chainSketch ?? null }],
    future: [],
    candidatesInitialized: true,
    started: true,
  }
}

export function enter(game: Game, selection: number[], mode: Mode, digit: number, options: EnterOptions = {}): Game {
  if (mode === 'color') {
    if (!Number.isInteger(digit) || digit < 0 || digit > COLORS.length) return game
    return paintCells(game, selection.map(cell => ({ cell, color: digit })))
  }
  let { entries, center, corner } = game.position
  let replacedEntry = false
  if (!Number.isInteger(digit) || digit < 0 || digit > (game.grid ?? CLASSIC_GRID).size) return game
  const givens = visibleGivensOf(game)
  const editable = selection.filter((i) => givens[i] === '0')
  if (mode === 'value') {
    const digitText = positionSymbol(digit)
    const value = options.toggleValue && editable.length === 1 && entries[editable[0]] === digitText ? 0 : digit
    if (value && editable.length !== 1 && !options.allowMultipleValues) return game
    for (const i of editable) {
      const valueText = value ? positionSymbol(value) : '0'
      if (entries[i] !== '0' && entries[i] !== valueText) replacedEntry = true
      entries = entries.slice(0, i) + valueText + entries.slice(i + 1)
    }
    if (value && options.removeCandidates !== false) {
      const bit = 1 << (value - 1)
      const currentPuzzle = playVariantPuzzle(game.variant, entries)
      const puzzle = currentPuzzle && options.variantRules ? puzzleForVariantTools(currentPuzzle, options.variantRules) : currentPuzzle
      const grid = game.grid ?? CLASSIC_GRID
      const sizedRules = game.sized?.rules
      const values = gridValues(puzzle?.givens ?? givens, entries)
      const ruleMasks = placedRuleState(puzzle, values, grid, sizedRules)?.allowed
      center = center.slice()
      corner = corner.slice()
      for (let i = 0; i < center.length; i++) {
        if (!(center[i] | corner[i])) continue
        let allowed = ruleMasks?.[i] ?? 511
        for (const cell of editable) {
          const removed = (peer(cell, i, puzzle, grid, sizedRules) ? bit : 0) |
            variantDigitExclusions(puzzle, cell, i, value) | sizedDigitExclusions(sizedRules, cell, i, value, grid.size, gridValueOffset(grid))
          allowed &= ~removed
        }
        center[i] &= allowed
        corner[i] &= allowed
      }
    } else {
      const clearCell = (mask: number, i: number) => editable.includes(i) && (value || game.position.entries[i] === '0') ? 0 : mask
      center = center.map(clearCell)
      corner = corner.map(clearCell)
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
      center = Array(game.givens.length).fill(0)
      corner = next
    } else if (mode === 'center') center = next
    else corner = next
  }
  if (
    entries === game.position.entries &&
    center.every((mask, i) => mask === game.position.center[i]) &&
    corner.every((mask, i) => mask === game.position.corner[i])
  ) return game
  const position = { ...game.position, entries, center, corner }
  if (replacedEntry) delete position.eliminations
  return move(game, position)
}

/** Remove any selected marks in the cell, or add the whole group when none are present. */
export function toggleCandidateGroup(game: Game, cell: number, mode: 'candidate' | 'center' | 'corner', selected: number): Game {
  const mask = selected & ((1 << (game.grid ?? CLASSIC_GRID).size) - 1)
  const position = game.position
  if (!mask || visibleGivensOf(game)[cell] !== '0' || position.entries[cell] !== '0') return game
  const existing = mode === 'candidate' ? position.center[cell] | position.corner[cell] : position[mode][cell]
  const remove = Boolean(existing & mask)
  let { center, corner } = position
  if (mode === 'center' || (mode === 'candidate' && remove && (center[cell] & mask))) {
    center = center.slice()
    center[cell] = remove ? center[cell] & ~mask : center[cell] | mask
  }
  if (mode !== 'center') {
    corner = corner.slice()
    corner[cell] = remove ? corner[cell] & ~mask : corner[cell] | mask
  }
  return move(game, { ...position, center, corner })
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
  const next = enter(origin, [...cells], mode, digit, { candidateAction: action })
  const undoPosition = current.past.at(-1)
  // A prior segment of this stroke may already have removed a chain.
  if (next === origin || current.past === start.past || undoPosition?.chainSketch === undefined ||
    undoPosition.entries !== start.position.entries || undoPosition.center !== start.position.center ||
    undoPosition.corner !== start.position.corner) return next
  return { ...next, past: [...next.past.slice(0, -1), undoPosition] }
}

export function replaceCandidates(game: Game, masks: readonly number[], options: { recordHistory?: boolean } = {}): Game {
  if (masks.length !== game.givens.length) return game
  const fullMask = (1 << (game.grid ?? CLASSIC_GRID).size) - 1
  const center = Array(game.givens.length).fill(0)
  const givens = visibleGivensOf(game)
  const corner = masks.map((mask, index) =>
    givens[index] === '0' && game.position.entries[index] === '0'
      ? mask & fullMask & ~(game.position.eliminations?.[index] ?? 0)
      : 0)
  if (
    center.every((mask, index) => mask === game.position.center[index]) &&
    corner.every((mask, index) => mask === game.position.corner[index])
  ) return game
  const position = { ...game.position, center, corner }
  return options.recordHistory === false
    ? { ...game, candidatesInitialized: true, position: retainCandidateColors(game.givens, game.position, position), future: [] }
    : move(game, position)
}

export function completeCandidateMasks(game: Game): number[] | null {
  const values = valuesOf(game)
  const fog = fogView(game.variant, game.position.entries)
  const masks = game.position.center.map((mask, cell) => fog && !fog.cells.has(cell)
    ? 0x1ff : mask | game.position.corner[cell])
  return [...values].every((digit, cell) => digit !== '0' || masks[cell] !== 0) ? masks : null
}

export function hintEliminations(values: string, displayedCandidates: readonly number[] | null, applied?: readonly number[], size: number = CLASSIC_GRID.size) {
  if (!displayedCandidates) return applied
  return displayedCandidates.map((mask, cell) => {
    const removed = applied?.[cell] ?? 0
    return values[cell] === '0' ? removed | (((1 << size) - 1) & ~mask) : removed
  })
}

export function fillEntries(game: Game, nextValues: string, removeCandidates = true, variantRules?: readonly VariantToolId[]): Game {
  if (!isGridText(nextValues, game.grid ?? CLASSIC_GRID)) return game
  const entries = [...game.position.entries]
  const center = [...game.position.center]
  const corner = [...game.position.corner]
  const currentPuzzle = playVariantPuzzle(game.variant, game.position.entries)
  const puzzle = currentPuzzle && variantRules ? puzzleForVariantTools(currentPuzzle, variantRules) : currentPuzzle
  const givens = visibleGivensOf(game)
  let changed = false

  for (let index = 0; index < nextValues.length; index++) {
    const digit = positionDigit(nextValues[index])
    if (givens[index] !== '0' || entries[index] !== '0' || digit === 0) continue
    entries[index] = positionSymbol(digit)
    center[index] = 0
    corner[index] = 0
    if (removeCandidates) {
      const bit = 1 << (digit - 1)
      for (let peerIndex = 0; peerIndex < nextValues.length; peerIndex++) {
        const removed = (peer(index, peerIndex, puzzle, game.grid, game.sized?.rules) ? bit : 0) |
          variantDigitExclusions(puzzle, index, peerIndex, digit) | sizedDigitExclusions(game.sized?.rules, index, peerIndex, digit, game.grid?.size ?? 9, gridValueOffset(game.grid))
        center[peerIndex] &= ~removed
        corner[peerIndex] &= ~removed
      }
    }
    changed = true
  }

  if (changed && removeCandidates) {
    const placed = entries.join('')
    const revealedPuzzle = playVariantPuzzle(game.variant, placed)
    const revealed = revealedPuzzle && variantRules ? puzzleForVariantTools(revealedPuzzle, variantRules) : revealedPuzzle
    const values = gridValues(revealed?.givens ?? givens, placed)
    const ruleMasks = placedRuleState(revealed, values, game.grid ?? CLASSIC_GRID, game.sized?.rules)?.allowed
    if (ruleMasks) for (let cell = 0; cell < values.length; cell++) {
      center[cell] &= ruleMasks[cell]
      corner[cell] &= ruleMasks[cell]
    }
  }
  return changed ? move(game, { ...game.position, entries: entries.join(''), center, corner }) : game
}

export function applyDeduction(game: Game, actions: readonly DeductionAction[], candidates: readonly number[], removeCandidates = true,
  variantRules?: readonly VariantToolId[]): Game {
  const first = actions[0]
  if (!first) return game
  const values = valuesOf(game)
  if ('place' in first) {
    const { cell, digit } = first.place
    if (values[cell] !== '0' || !hasCandidate(candidates[cell], digit)) return game
    return fillEntries(game, values.slice(0, cell) + digit + values.slice(cell + 1), removeCandidates, variantRules)
  }

  const { center, corner } = game.position
  const eliminations = [...(game.position.eliminations ?? Array(game.givens.length).fill(0))]
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

export function singleFromCandidates(values: string, masks: readonly number[], eliminations?: readonly number[], variant?: VariantPuzzle, grid?: SizedGrid, sizedRules?: SizedRuleGame['rules']): [number, number] | null {
  const size = (grid ?? CLASSIC_GRID).size
  if (values.length !== size ** 2 || masks.length !== values.length) return null
  const remaining = (cell: number) => masks[cell] & ~(eliminations?.[cell] ?? 0)
  for (let index = 0; index < values.length; index++) {
    const mask = remaining(index)
    if (values[index] === '0' && mask && (mask & (mask - 1)) === 0) {
      return [index, Math.log2(mask) + 1]
    }
  }
  const houses = grid ? DIGITS.slice(0, size).flatMap(digit => [
    gridHouseCells({ row: digit - 1 }, grid), gridHouseCells({ column: digit - 1 }, grid), gridHouseCells({ box: digit - 1 }, grid),
  ]) : variant?.regions && variant.regions.type !== 'boxes' ? [...HOUSES.slice(0, 18), ...variant.regions.regions] : HOUSES
  const extra = variant?.rules?.flatMap((rule, index) => {
    if (rule.type === 'diagonal') return [variantHouseCells({ diagonal: rule.diagonal }, variant)]
    if (rule.type === 'extra-house') return [variantHouseCells({ extra: index }, variant)]
    return []
  }) ?? []
  const diagonals = sizedRules?.flatMap(rule => rule.type === 'diagonal' ? [gridDiagonalCells(grid?.size ?? 9, rule.diagonal)] : []) ?? []
  for (const house of [...houses, ...extra, ...diagonals]) {
    for (let digit = 1; digit <= size; digit++) {
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
