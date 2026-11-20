import { checkKakuro } from '../kakuro/engine.ts'
import { checkLatin } from '../latin/engine.ts'
import { recordDifficultySolve, type DifficultyTotals } from '../sudoku/difficulty-statistics.ts'
import type { NumberPuzzleDifficulty, NumberPuzzleEntry } from './catalog.ts'
import { calcudokuFromRecipe, decodeGeneratedNumberPuzzle, kakuroFromRecipe, type GeneratedNumberGame } from './generated.ts'
import type { GeneratedRecord } from './generated-storage.ts'
import { hasNumberMoves, parseNumberProgress, readNumberClock, readNumberLastPlayed, type SavedNumberProgress } from './progress.ts'

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
  saved: SavedNumberProgress, { editable, maxValue, complete }: ProgressRules,
): NumberResultStatus | null {
  if (!Array.isArray(saved.values) || !Array.isArray(saved.notes)) return null
  const progress = parseNumberProgress(saved, editable, maxValue)
  if (!progress || !hasNumberMoves(progress)) return null
  if (!complete(progress.position.values)) return 'started'
  recordDifficultySolve(totals, difficulty, progress.clock === 'untimed' ? undefined : progress.clock?.elapsed)
  return 'solved'
}

function generatedProgressRules(game: GeneratedNumberGame, id: string): (ProgressRules & { difficulty: NumberPuzzleDifficulty }) | null {
  try {
    if (game === 'kakuro') {
      const decoded = decodeGeneratedNumberPuzzle(id, game)
      if (!decoded) return null
      const puzzle = kakuroFromRecipe(decoded.recipe)
      return {
        difficulty: decoded.difficulty, maxValue: 9, editable: puzzle.cells.map(cell => cell === null),
        complete: values => checkKakuro(puzzle, values).complete,
      }
    }
    const decoded = decodeGeneratedNumberPuzzle(id, game)
    if (!decoded) return null
    const puzzle = calcudokuFromRecipe(decoded.recipe)
    return {
      difficulty: decoded.difficulty, maxValue: puzzle.size, editable: puzzle.givens.map(given => !given),
      complete: values => checkLatin(puzzle, values).complete,
    }
  } catch {
    return null
  }
}

export type NumberHistoryRequest = { game: GeneratedNumberGame; status: NumberResultStatus }

export function addGeneratedNumberResult(
  result: GeneratedNumberResults, request: NumberHistoryRequest, { id, number, progress }: GeneratedRecord,
) {
  if (!progress) return
  const rules = generatedProgressRules(request.game, id)
  if (!rules) return
  const { difficulty, complete, editable } = rules
  const status = recordNumberResult(result.totals, difficulty, progress, {
    ...rules,
    // Only a full grid can contribute to solve statistics.
    complete: values => editable.every((canEnter, cell) => !canEnter || values[cell] > 0) && complete(values),
  })
  if (status === request.status) result.entries.push(numberHistoryEntry({ id, number, difficulty, generated: true }, progress))
}
