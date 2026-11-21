import { checkKakuro } from '../kakuro/engine.ts'
import { checkLatin } from '../latin/engine.ts'
import { recordDifficultySolve, type DifficultyTotals } from '../sudoku/difficulty-statistics.ts'
import type { NumberPuzzleDifficulty, NumberPuzzleEntry } from './catalog.ts'
import { calcudokuFromRecipe, decodeGeneratedNumberPayload, generatedNumberPayload, kakuroFromRecipe, type GeneratedNumberGame } from './generated.ts'
import type { GeneratedRecord } from './generated-storage.ts'
import { numberValuesWithMoves, readNumberClock, readNumberLastPlayed, type SavedNumberProgress } from './progress.ts'

export type NumberResultStatus = 'started' | 'solved'
export type NumberHistoryEntry = NumberPuzzleEntry & { lastPlayed?: number; elapsed?: number }

export function numberHistoryEntry(entry: NumberPuzzleEntry, saved: SavedNumberProgress): NumberHistoryEntry {
  const lastPlayed = readNumberLastPlayed(saved.lastPlayed)
  const clock = readNumberClock(saved.clock)
  return {
    id: entry.id, number: entry.number, difficulty: entry.difficulty,
    ...(entry.generated && { generated: true }),
    ...(lastPlayed !== undefined && { lastPlayed }),
    ...(clock && clock !== 'untimed' && { elapsed: clock.elapsed }),
  }
}

export type GeneratedNumberResults = {
  entries: NumberHistoryEntry[]
  totals: DifficultyTotals<NumberPuzzleDifficulty>
}

type ProgressRules = {
  editable: readonly boolean[]
  maxValue: number
  complete: (values: readonly number[]) => boolean
}

export function recordNumberResult(
  totals: DifficultyTotals<NumberPuzzleDifficulty>, difficulty: NumberPuzzleDifficulty,
  saved: SavedNumberProgress, rules: ProgressRules,
): NumberResultStatus | null {
  const status = numberResultStatus(saved, rules)
  if (status === 'solved') {
    const clock = readNumberClock(saved.clock)
    recordDifficultySolve(totals, difficulty, clock === 'untimed' ? undefined : clock?.elapsed)
  }
  return status
}

function numberResultStatus(
  saved: SavedNumberProgress, { editable, maxValue, complete }: ProgressRules,
): NumberResultStatus | null {
  const values = numberValuesWithMoves(saved, editable, maxValue)
  if (!values) return null
  return complete(values) ? 'solved' : 'started'
}

type GeneratedProgressRules = ProgressRules & { difficulty: NumberPuzzleDifficulty }

// Only a full grid can contribute to solve statistics.
function fullGrid(editable: readonly boolean[], values: readonly number[]) {
  return editable.every((canEnter, cell) => !canEnter || values[cell] > 0)
}

function generatedProgressRules(game: GeneratedNumberGame, payload: string): GeneratedProgressRules | null {
  const decoded = decodeGeneratedNumberPayload(payload, game)
  if (!decoded) return null
  try {
    if (decoded.game === 'kakuro') {
      const puzzle = kakuroFromRecipe(decoded.recipe)
      const editable = puzzle.cells.map(cell => cell === null)
      return {
        difficulty: decoded.difficulty, maxValue: 9, editable,
        complete: values => fullGrid(editable, values) && checkKakuro(puzzle, values).complete,
      }
    }
    const puzzle = calcudokuFromRecipe(decoded.recipe)
    const editable = puzzle.givens.map(given => !given)
    return {
      difficulty: decoded.difficulty, maxValue: puzzle.size, editable,
      complete: values => fullGrid(editable, values) && checkLatin(puzzle, values).complete,
    }
  } catch {
    return null
  }
}

export type NumberHistoryRequest = { game: GeneratedNumberGame; status: NumberResultStatus }
export type GeneratedHistoryRow = NumberHistoryEntry & { game: GeneratedNumberGame; status: NumberResultStatus }

export type StoredSolveTotals = Map<NumberPuzzleDifficulty, { solved: number; timed: number; seconds: bigint }>

export function changeGeneratedSolveTotal(totals: StoredSolveTotals, row: GeneratedHistoryRow, change: 1 | -1) {
  const { difficulty, elapsed } = row
  const total = totals.get(difficulty) ?? { solved: 0, timed: 0, seconds: 0n }
  total.solved += change
  if (elapsed !== undefined && elapsed > 0 && Number.isSafeInteger(elapsed)) {
    total.timed += change
    total.seconds += BigInt(elapsed) * BigInt(change)
  }
  if (total.solved > 0) totals.set(difficulty, total)
  else totals.delete(difficulty)
}

export function generatedDifficultyTotals(totals: StoredSolveTotals): GeneratedNumberResults['totals'] {
  return new Map([...totals].map(([difficulty, total]) => [difficulty, { ...total, seconds: Number(total.seconds) }]))
}

export function createGeneratedHistoryReader(game: GeneratedNumberGame) {
  // Replays share clues, but each play keeps its own progress and result.
  const cached = new Map<string, GeneratedProgressRules | null>()
  return ({ id, number, progress }: GeneratedRecord): GeneratedHistoryRow | undefined => {
    if (!progress) return
    const payload = generatedNumberPayload(id)
    if (!payload) return
    const previous = cached.get(payload)
    const rules = previous ?? generatedProgressRules(game, payload)
    if (!rules) return
    if (previous === undefined) {
      if (cached.size >= 128) cached.clear()
      // Keep the key on first use. Retain the rules only if another play needs them.
      cached.set(payload, null)
    } else if (previous === null) {
      cached.set(payload, rules)
    }
    const status = numberResultStatus(progress, rules)
    if (status) return { ...numberHistoryEntry({ id, number, difficulty: rules.difficulty, generated: true }, progress), game, status }
  }
}

export function addGeneratedHistoryRow(
  result: GeneratedNumberResults, match: NumberResultStatus, { game: _game, status, ...entry }: GeneratedHistoryRow,
  countSolves = true,
) {
  if (countSolves && status === 'solved') recordDifficultySolve(result.totals, entry.difficulty, entry.elapsed)
  if (status === match) result.entries.push(entry)
}

export function createGeneratedNumberResultCollector(
  result: GeneratedNumberResults, { game, status }: NumberHistoryRequest,
) {
  const read = createGeneratedHistoryReader(game)
  return (record: GeneratedRecord) => {
    const row = read(record)
    if (row) addGeneratedHistoryRow(result, status, row)
  }
}
