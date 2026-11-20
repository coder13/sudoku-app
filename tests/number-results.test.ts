import assert from 'node:assert/strict'
import test from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import { solveKakuro } from '../src/kakuro/engine.ts'
import { kakuroRecipeFromPuzzle } from '../src/kakuro/generator.ts'
import { solveLatin } from '../src/latin/engine.ts'
import { addGeneratedNumberResult, type GeneratedNumberResults } from '../src/number-puzzles/generated-results.ts'
import { encodeGeneratedNumberPuzzle, type GeneratedNumberPuzzle } from '../src/number-puzzles/generated.ts'
import type { SavedNumberProgress } from '../src/number-puzzles/progress.ts'
import { summarizeDifficultySolves } from '../src/sudoku/difficulty-statistics.ts'

const kakuro = kakuroCatalog[0].puzzle
const calcudoku = calcudokuCatalog[0].puzzle

for (const { board, values } of [
  {
    board: { game: 'kakuro', difficulty: 'easy', recipe: kakuroRecipeFromPuzzle(kakuro) } satisfies GeneratedNumberPuzzle,
    values: solveKakuro(kakuro).solution!,
  },
  {
    board: { game: 'calcudoku', difficulty: 'easy', recipe: { size: calcudoku.size, cages: [...calcudoku.cages] } } satisfies GeneratedNumberPuzzle,
    values: solveLatin(calcudoku).solution!.map((digit, cell) => calcudoku.givens[cell] ? 0 : digit),
  },
]) {
  test(`${board.game} history summarizes old and timed solves and retains resume links`, () => {
    const blank = values.map(() => 0)
    const first = values.findIndex(Boolean)
    const wrong = [...values]
    wrong[first] = wrong[first] === 1 ? 2 : 1
    const results: GeneratedNumberResults = { totals: new Map(), entries: [] }
    const completed: GeneratedNumberResults = { totals: new Map(), entries: [] }
    const activeRequest = { game: board.game, status: 'started' } as const
    const solvedRequest = { game: board.game, status: 'solved' } as const
    const progress: SavedNumberProgress[] = [
      { values, notes: blank },
      { values, notes: blank, clock: { elapsed: 42, finished: true }, lastPlayed: 1_790_100_000_000 },
      { values: wrong, notes: blank, clock: { elapsed: 11, finished: true }, lastPlayed: 1_790_000_000_000 },
      { values: blank, notes: blank, future: [[first, values[first], 0]], lastPlayed: 'yesterday' },
      { values: blank, notes: blank.map((_, cell) => cell === first ? 1 : 0) },
      { values: blank, notes: blank },
      { values: [], notes: [] },
    ]
    const ids = progress.map((_, index) => encodeGeneratedNumberPuzzle(board,
      index ? `00000000-0000-0000-0000-${String(index).padStart(12, '0')}` : undefined))
    progress.forEach((save, index) => {
      const record = { game: board.game, id: ids[index], number: index + 1, progress: save }
      addGeneratedNumberResult(results, activeRequest, record)
      addGeneratedNumberResult(completed, solvedRequest, record)
    })
    for (const [result, request] of [[results, activeRequest], [completed, solvedRequest]] as const) {
      addGeneratedNumberResult(result, request, { game: board.game, id: 'v1.invalid', number: 8, progress: progress[0] })
    }
    assert.deepEqual([...summarizeDifficultySolves(results.totals)], [['easy', { solved: 2, averageSeconds: 42 }]])
    assert.deepEqual(results.entries, [2, 3, 4].map(index => ({
      id: ids[index], number: index + 1, difficulty: 'easy', generated: true,
      ...(index === 2 && { lastPlayed: 1_790_000_000_000, elapsed: 11 }),
    })))
    assert.deepEqual(completed.entries, [
      { id: ids[0], number: 1, difficulty: 'easy', generated: true },
      { id: ids[1], number: 2, difficulty: 'easy', generated: true, lastPlayed: 1_790_100_000_000, elapsed: 42 },
    ])
    assert.deepEqual(completed.totals, results.totals)
  })
}
