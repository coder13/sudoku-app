import { checkKakuro } from '../kakuro/engine.ts'
import { checkLatin } from '../latin/engine.ts'
import { recordDifficultySolve, type DifficultyTotals } from '../sudoku/difficulty-statistics.ts'
import type { NumberPuzzleDifficulty, NumberPuzzleEntry } from './catalog.ts'
import { calcudokuFromRecipe, decodeGeneratedNumberPayload, generatedNumberPayload, kakuroFromRecipe, type GeneratedNumberGame } from './generated.ts'
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

export function createGeneratedNumberResultCollector(
  result: GeneratedNumberResults, { game, status }: NumberHistoryRequest,
) {
  // Replays share clues, but each play keeps its own progress and result.
  const cached = new Map<string, GeneratedProgressRules | null>()
  return ({ id, number, progress }: GeneratedRecord) => {
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
    const { difficulty } = rules
    if (recordNumberResult(result.totals, difficulty, progress, rules) === status) {
      result.entries.push(numberHistoryEntry({ id, number, difficulty, generated: true }, progress))
    }
  }
}
