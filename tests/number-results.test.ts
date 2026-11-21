import assert from 'node:assert/strict'
import test from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import { solveKakuro } from '../src/kakuro/engine.ts'
import { kakuroRecipeFromPuzzle } from '../src/kakuro/generator.ts'
import { solveLatin } from '../src/latin/engine.ts'
import {
  addGeneratedHistoryRow, changeGeneratedSolveTotal, createGeneratedHistoryReader, createGeneratedNumberResultCollector,
  generatedDifficultyTotals, generatedNumberWindow, orderNumberHistory,
  type GeneratedHistoryRow, type GeneratedNumberResults, type NumberHistoryEntry, type StoredSolveTotals,
} from '../src/number-puzzles/generated-results.ts'
import { encodeGeneratedNumberPuzzle, type GeneratedNumberPuzzle } from '../src/number-puzzles/generated.ts'
import { NUMBER_HISTORY_SIZE, type SavedNumberProgress } from '../src/number-puzzles/progress.ts'
import { summarizeDifficultySolves } from '../src/sudoku/difficulty-statistics.ts'

const kakuro = kakuroCatalog[0].puzzle
const calcudoku = calcudokuCatalog[0].puzzle

test('stored solve totals keep exact time when a saved result is replaced', () => {
  const totals: StoredSolveTotals = new Map()
  const row = { game: 'kakuro', id: 'v1.example', number: 1, difficulty: 'easy', status: 'solved' } satisfies GeneratedHistoryRow
  const long = { ...row, elapsed: Number.MAX_SAFE_INTEGER }
  changeGeneratedSolveTotal(totals, long, 1)
  changeGeneratedSolveTotal(totals, { ...row, elapsed: 42 }, 1)
  changeGeneratedSolveTotal(totals, { ...row, elapsed: 3 }, 1)
  changeGeneratedSolveTotal(totals, row, 1)
  changeGeneratedSolveTotal(totals, long, -1)
  changeGeneratedSolveTotal(totals, { ...row, elapsed: 42 }, -1)
  changeGeneratedSolveTotal(totals, { ...row, elapsed: 12 }, 1)
  assert.deepEqual([...generatedDifficultyTotals(totals)], [['easy', { solved: 3, timed: 2, seconds: 15 }]])
  changeGeneratedSolveTotal(totals, { ...row, elapsed: 12 }, -1)
  changeGeneratedSolveTotal(totals, { ...row, elapsed: 3 }, -1)
  changeGeneratedSolveTotal(totals, row, -1)
  assert.equal(totals.size, 0)
})

test('in-progress pages preserve order and let the first page count every solve', () => {
  const base = { game: 'kakuro', difficulty: 'easy' } as const
  const rows: GeneratedHistoryRow[] = (['solved', 'started', 'started', 'solved', 'started'] as const).map((status, index) => ({
    ...base, status, number: index + 1, id: String(index + 1), elapsed: 42,
  }))
  const first: GeneratedNumberResults = { entries: [], totals: new Map() }
  const second: GeneratedNumberResults = { entries: [], totals: new Map() }
  const request = { status: 'started', page: { after: 0, limit: 2 } } as const
  for (const row of rows) {
    addGeneratedHistoryRow(first, request, row)
    addGeneratedHistoryRow(second, { ...request, page: { after: 3, limit: 2 } }, row)
  }
  assert.deepEqual(first.entries.map(entry => entry.number), [2, 3])
  assert.equal(first.hasMore, true)
  assert.deepEqual(first.totals.get('easy'), { solved: 2, timed: 2, seconds: 84 })
  assert.deepEqual(second.entries.map(entry => entry.number), [5])
  assert.equal(second.hasMore, undefined)
  assert.equal(second.totals.size, 0)
})

test('library windows filter before limiting rows and keep the order of equal timestamps', () => {
  const recent = new Date(2026, 10, 20, 15).getTime()
  const earlier = new Date(2026, 10, 17, 15).getTime()
  const easy = { id: 'earlier', number: 5, difficulty: 'easy', lastPlayed: earlier } as const
  const entries: NumberHistoryEntry[] = [
    { id: 'legacy', number: 1, difficulty: 'easy' },
    { id: 'tie-after', number: 9, difficulty: 'medium', lastPlayed: recent },
    easy,
    { id: 'tie-before', number: 2, difficulty: 'medium', lastPlayed: recent },
  ]
  orderNumberHistory(entries)
  const first = generatedNumberWindow(entries, 'kakuro', { revision: 1, limit: 2 })
  assert.deepEqual(first.entries.map(entry => entry.id), ['tie-before', 'tie-after'])
  assert.equal(first.hasMore, true)
  assert.equal(first.revision, 1)
  const more = generatedNumberWindow(entries, 'kakuro', { revision: 2, limit: 4 })
  assert.deepEqual(more.entries.map(entry => entry.id), ['tie-before', 'tie-after', 'earlier', 'legacy'])
  assert.equal(more.hasMore, undefined)

  const date = { from: '2026-11-17', to: '2026-11-17', difficulty: 'easy' } as const
  const filtered = generatedNumberWindow(entries, 'kakuro', { revision: 3, limit: 1, filters: date })
  assert.deepEqual(filtered.entries, [easy])
  assert.equal(filtered.hasMore, undefined)
  const otherGame = generatedNumberWindow(entries, 'kakuro', { revision: 4, limit: 1, filters: { game: 'calcudoku' } })
  assert.deepEqual(otherGame.entries, [])
  assert.equal(otherGame.hasAny, true)
})

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
    const indexedActive: GeneratedNumberResults = { totals: new Map(), entries: [] }
    const indexedSolved: GeneratedNumberResults = { totals: new Map(), entries: [] }
    const collectActive = createGeneratedNumberResultCollector(results, { game: board.game, status: 'started' })
    const collectSolved = createGeneratedNumberResultCollector(completed, { game: board.game, status: 'solved' })
    const summarize = createGeneratedHistoryReader(board.game)
    const progress: SavedNumberProgress[] = [
      { values, notes: blank },
      { values, notes: blank, clock: { elapsed: 42, finished: true }, lastPlayed: 1_790_100_000_000 },
      { values: wrong, notes: blank, past: [['invalid']], clock: { elapsed: 11, finished: true }, lastPlayed: 1_790_000_000_000 },
      { values: blank, notes: blank, future: [[first, values[first], 0]], lastPlayed: 'yesterday' },
      { values: blank, notes: blank.map((_, cell) => cell === first ? 1 : 0) },
      { values: blank, notes: blank },
      { values: [], notes: [] },
      { values: blank, notes: blank, past: [[first, 0, 0], [first, -1, 0]] },
      { values: blank, notes: blank, past: [null, ...Array.from({ length: NUMBER_HISTORY_SIZE }, () => [first, 0, 0])] },
    ]
    const ids = progress.map((_, index) => encodeGeneratedNumberPuzzle(board,
      index ? `00000000-0000-0000-0000-${String(index).padStart(12, '0')}` : undefined))
    progress.forEach((save, index) => {
      const record = { game: board.game, id: ids[index], number: index + 1, progress: save }
      collectActive(record)
      collectSolved(record)
      const row = summarize(record)
      if (!row) return
      assert.equal(row.game, board.game)
      addGeneratedHistoryRow(indexedActive, { status: 'started' }, structuredClone(row))
      addGeneratedHistoryRow(indexedSolved, { status: 'solved' }, structuredClone(row))
    })
    for (const collect of [collectActive, collectSolved]) {
      collect({ game: board.game, id: 'v1.invalid', number: 8, progress: progress[0] })
      collect({ game: board.game, id: ids[0].replace(/^v1\./, 'v2.') + '.invalid', number: 9, progress: progress[0] })
    }
    assert.deepEqual([...summarizeDifficultySolves(results.totals)], [['easy', { solved: 2, averageSeconds: 42 }]])
    assert.deepEqual(results.entries, [2, 3, 4, 8].map(index => ({
      id: ids[index], number: index + 1, difficulty: 'easy', generated: true,
      ...(index === 2 && { lastPlayed: 1_790_000_000_000, elapsed: 11 }),
    })))
    assert.deepEqual(completed.entries, [
      { id: ids[0], number: 1, difficulty: 'easy', generated: true },
      { id: ids[1], number: 2, difficulty: 'easy', generated: true, lastPlayed: 1_790_100_000_000, elapsed: 42 },
    ])
    assert.deepEqual(completed.totals, results.totals)
    assert.deepEqual(indexedActive, results)
    assert.deepEqual(indexedSolved, completed)
  })
}
