import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import source from './fixtures/coach-golden-stars-regions.json' with { type: 'json' }
import { isJigsawGrid } from '../src/sudoku/grid.ts'
import { puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const hallowteeth = JSON.parse(readFileSync(
  new URL('./fixtures/coach-hallowteeth.json', import.meta.url), 'utf8')) as {
    code: string; title: string; solution: string
  }

test('Golden Stars preserves disconnected authored regions and their color legend', async ({ mock }) => {
  const game = await detectPuzzle(source.code)
  const expectedGrid = {
    size: 5,
    regions: [[0, 5, 15, 20, 21], [1, 2, 3, 6, 7], [4, 8, 9, 19, 24], [10, 11, 12, 13, 14], [16, 17, 18, 22, 23]],
  }
  const regionColors = ['blue', 'yellow', 'red', 'magenta', 'green']
  const givenCellColors = Object.fromEntries(expectedGrid.regions.flatMap((cells, index) =>
    cells.map(cell => [cell, [regionColors[index]]])))
  assert.deepEqual(game.grid, expectedGrid)
  assert.ok(isJigsawGrid(game.grid, true))
  assert.equal(isJigsawGrid(game.grid), false, 'the region editor keeps its connected-region rule')
  assert.deepEqual(game.givenCellColors, givenCellColors)

  const { sqlite, fetcher } = syncDatabase()
  mock.method(globalThis, 'fetch', (path: string | URL | Request, init?: RequestInit) =>
    fetcher(path, init))
  try {
    const { game: imported } = await prepareImportedPuzzle(source.code)
    assert.deepEqual(imported.grid, expectedGrid)
    assert.deepEqual(imported.givenCellColors, givenCellColors)
    const solution = await puzzleSolution(imported)
    assert.equal(solution.board, source.solution)
    assert.equal(solution.status, 'solved')
    assert.deepEqual(readGame(imported.id, JSON.stringify(imported))?.givenCellColors, givenCellColors)
    const alteredLegend = { ...imported, givenCellColors: { ...givenCellColors, 0: ['white'] } }
    assert.equal(readGame(imported.id, JSON.stringify(alteredLegend)), undefined)
    await assert.rejects(publishSharedPuzzle(alteredLegend), /Invalid puzzle definition/)
    const id = await publishSharedPuzzle(imported)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, expectedGrid)
    assert.deepEqual(shared.game.givenCellColors, givenCellColors)
  } finally { sqlite.close() }
})

test('Hallowteeth keeps reviewed cell colors with its typed 6×6 rules', async ({ mock }) => {
  const imported = await detectPuzzle(hallowteeth.code)
  assert.equal(imported.title, hallowteeth.title)
  assert.equal(imported.grid?.size, 6)
  assert.ok(imported.givenCellColors)
  assert.equal(Object.keys(imported.givenCellColors).length, 12)
  assert.ok(imported.sizedRules?.some(rule => rule.type === 'renban'))
  assert.ok(imported.sizedRules?.some(rule => rule.type === 'thermometer'))

  const { sqlite, fetcher } = syncDatabase()
  mock.method(globalThis, 'fetch', (path: string | URL | Request, init?: RequestInit) => fetcher(path, init))
  try {
    const { game } = await prepareImportedPuzzle(hallowteeth.code)
    assert.equal(game.title, hallowteeth.title)
    assert.deepEqual(game.givenCellColors, imported.givenCellColors)
    assert.equal((await puzzleSolution(game)).board, hallowteeth.solution)
    assert.deepEqual(readGame(game.id, JSON.stringify(game))?.givenCellColors, imported.givenCellColors)
    const id = await publishSharedPuzzle(game)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, game.grid)
    assert.deepEqual(shared.game.givenCellColors, imported.givenCellColors)
    assert.deepEqual(shared.game.sized?.rules, game.sized?.rules)
  } finally { sqlite.close() }
})

test('Hallowteeth keeps its reviewed color fills when a valid Ratio rule is appended', async () => {
  const data = await decodeSudokuCoachPayload(hallowteeth.code)
  const original = await detectPuzzle(hallowteeth.code)
  const code = coachCode({ ...data, givenConstraints: [
    ...(data.givenConstraints as unknown[]),
    { type: 'ratio', segments: [{ cells: [1, 7], parameters: {} }], settings: {} },
  ] })
  const combined = await detectPuzzle(code)

  assert.equal(combined.title, hallowteeth.title)
  assert.deepEqual(combined.grid, original.grid)
  assert.deepEqual(combined.givenCellColors, original.givenCellColors)
  assert.deepEqual(combined.sizedRules?.slice(0, -1), original.sizedRules)
  assert.equal(combined.sizedRules?.at(-1)?.type, 'kropki')
  assert.equal((await puzzleSolution((await prepareImportedPuzzle(code)).game)).board, hallowteeth.solution)
})
