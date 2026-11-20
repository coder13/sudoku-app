import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { enter, peer } from '../src/sudoku/game.ts'
import { gridRegionIndex, rectangularGridForBoxRows } from '../src/sudoku/grid.ts'
import { rectangularBoxRows } from '../src/sudoku/new-puzzle.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { coachCode } from './helpers/coach-code.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const classicControls = JSON.parse(readFileSync(new URL('fixtures/sized-eight-classic.json', import.meta.url), 'utf8'))
const mixed = JSON.parse(readFileSync(new URL('fixtures/sized-sudokupad-rule-of-eight.json', import.meta.url), 'utf8'))
const mixedAnswer = '8215476376435281682435173571284614876325235681745762143841387652'

test('published 8 × 8 controls retain their two orientations through import, play, replay and sharing', async ({ mock }) => {
  const { fetcher, sqlite } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => fetcher(new URL(path, 'https://sudoku.test').href, init))
    for (const { boxRows, boxColumns, givens, title, answer } of classicControls) {
      const grid = rectangularGridForBoxRows(8, boxRows)
      const regions = Array.from({ length: 64 }, (_, cell) => gridRegionIndex(grid, cell))
      const fPuzzle = { size: 8, title, ruleset: 'Normal 8x8 Sudoku rules apply.',
        grid: Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, column) => {
          const cell = 8 * row + column
          return { region: regions[cell], ...(givens[cell] !== '0' && { given: true, value: Number(givens[cell]) }) }
        })),
      }
      assert.deepEqual(grid, { size: 8, boxRows, boxColumns })
      const { game } = await prepareImportedPuzzle(JSON.stringify(fPuzzle))
      assert.deepEqual(game.grid, grid)
      assert.equal(game.sized?.solution, answer)
      assert.equal(peer(0, 11, undefined, grid), boxRows === 2)
      assert.equal(peer(0, 25, undefined, grid), boxRows === 4)
      const { game: coach } = await prepareImportedPuzzle(coachCode({ gridSize: 8, givenDigits: givens, regions: regions.map(n => n + 1) }))
      assert.deepEqual(coach.grid, grid)
      assert.equal(coach.sized?.solution, answer)

      const first = givens.indexOf('0')
      const played = enter(game, [first], 'value', Number(answer[first]))
      const loaded = readGame(played.id, JSON.stringify(played))
      assert.deepEqual(loaded?.grid, grid)
      assert.equal(loaded?.position.entries[first], answer[first])
      const replay = await puzzleSolution(game)
      assert.equal(replay.status, 'solved')
      assert.equal(replay.board, answer)

      const share = await publishSharedPuzzle(played)
      const { game: shared } = await prepareSharedPuzzle(share, [], new AbortController().signal)
      assert.deepEqual(shared.grid, grid)
      assert.equal(shared.givens, givens)
      const invalid = await fetcher('https://sudoku.test/api/v1/shares', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...puzzleDefinitionForSharing(game), grid: { size: 8, boxRows: 2, boxColumns: 3 } }),
      })
      assert.equal(invalid.status, 400)

      delete fPuzzle.grid[0][0].region
      await assert.rejects(detectPuzzle(JSON.stringify(fPuzzle)), /needs explicit/)
    }
  } finally { sqlite.close() }
})

test('both 8 × 8 layouts generate verified Easy and Medium puzzles and retain their selected orientation', async () => {
  for (const boxRows of [2, 4] as const) {
    assert.equal(rectangularBoxRows('eight', boxRows), boxRows)
    const grid = rectangularGridForBoxRows(8, boxRows)
    for (const difficulty of ['easy', 'medium'] as const) for (const seed of [0, 1, 182]) {
      const request = { type: 'generate-rectangular', seed, difficulty, grid } as const
      const digits = await runEngine(request)
      assert.equal(digits.length, 64)
      const position = { version: 2, grid, digits } as const
      assert.equal(await runEngine({ type: 'sized-classic', operation: 'analyze', position }), 'unique')
      const trace = await runEngine({ type: 'sized-classic', operation: 'trace', position })
      assert.ok(trace?.at(-1)?.digits.every(Boolean))
      assert.equal(trace.some(step => step.deduction && step.deduction.technique !== 'naked-single'), difficulty === 'medium')
      assert.notDeepEqual(await runEngine({ ...request, exclude: [digits] }), digits)
    }
  }
  assert.equal(rectangularBoxRows('eight', 3), undefined)
  assert.equal(rectangularBoxRows('six', 4), undefined)
})

test('the original Rule Of Eight link keeps four combined rule families and the authored completion', async ({ mock }) => {
  const { fetcher, sqlite } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => path === `/api/v1/import/sudokupad/${mixed.id}`
      ? Promise.resolve(Response.json({ code: mixed.code })) : fetcher(new URL(path, 'https://sudoku.test').href, init))
    const { game } = await prepareImportedPuzzle(`https://sudokupad.app/${mixed.id}`)
    assert.deepEqual(game.grid, { size: 8, boxRows: 2, boxColumns: 4 })
    const { sized } = game
    assert.ok(sized)
    assert.equal(sized.solution, mixedAnswer)
    assert.deepEqual(sized.rules, [
      { type: 'killer-cages', cages: [{ cells: [27, 28, 35, 36], sum: 16 }] },
      ...[[11, 10, 9, 8], [41, 33, 25, 17], [63, 62, 61, 60], [47, 39, 31, 23]].map(cells => ({ type: 'thermometer', cells })),
      ...[[0, 1, 2, 3], [55, 54, 53, 52], [46, 38, 30, 22], [16, 24, 32, 40]].map(([circle, ...cells]) => ({ type: 'arrow', circle, cells })),
      { type: 'kropki', consecutive: { pairs: [[35, 36], [51, 52]] }, ratioTwo: { pairs: [[27, 28]] } },
    ])
    const hints = await puzzleHints(game, 'all', 'sized-arrow')
    assert.ok(hints.choices[0])
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, mixedAnswer)
    const { game: shared } = await prepareSharedPuzzle(await publishSharedPuzzle(game), [], new AbortController().signal)
    assert.deepEqual(shared.sized, sized)
  } finally { sqlite.close() }
})
