import assert from 'node:assert/strict'
import { test } from 'node:test'
import { peer, enter, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

// The published Thermometer export omits any region equal to the cell's row.
const labels = ['0000111', '0200111', '2223331', '2223434', '5553434', '5666444', '5556666']
const paths = [
  ['R2C2', 'R3C3', 'R4C4'], ['R3C1', 'R4C2', 'R5C3'], ['R3C7', 'R4C6', 'R5C6'],
  ['R6C7', 'R7C7', 'R7C6'], ['R1C7', 'R2C6'], ['R7C1', 'R7C2'],
]
const exportData = {
  size: 7, title: '7 × 7 Jigsaw Thermometer', author: 'Playmaker6174',
  ruleset: 'Normal irregular 7x7 Sudoku rules apply.\n\nDigits along a thermometer must strictly increase from the bulb to the end.',
  grid: labels.map((row, index) => Array.from(row, label => Number(label) === index ? {} : { region: Number(label) })),
  thermometer: paths.map(path => ({ lines: [path] })),
}
const answer = '7135624632415747625132517346127346534562715641732'

test('a 7 × 7 Jigsaw Thermometer keeps its authored houses through import, play, replay and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => fetcher(new URL(path, 'https://sudoku.test').href, init))
    const { game } = await prepareImportedPuzzle(JSON.stringify(exportData))
    assert.ok(game.grid?.size === 7 && game.sized)
    const { grid, sized } = game
    assert.deepEqual(grid.regions.map(cells => cells.length), Array(7).fill(7))
    assert.equal(sized.solution, answer)
    assert.equal(sized.rules.length, 6)
    assert.ok(peer(8, 16, undefined, grid))
    assert.equal(peer(1, 8, undefined, grid), true)
    assert.equal(peer(0, 8, undefined, grid), false)
    const moved = enter(game, [0], 'value', 7)
    assert.equal(valuesOf(moved)[0], '7')
    assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.grid, grid)
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)

    const share = await publishSharedPuzzle(moved)
    const shared = await prepareSharedPuzzle(share, [], new AbortController().signal)
    assert.deepEqual(shared.game.grid, grid)
    assert.deepEqual(shared.game.sized, sized)
    assert.equal(valuesOf(shared.game), '0'.repeat(49))
    const disconnected = grid.regions.map(cells => [...cells])
    const last = disconnected[6].length - 1
    ;[disconnected[0][0], disconnected[6][last]] = [disconnected[6][last], disconnected[0][0]]
    const request = await fetcher('https://sudoku.test/api/v1/shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...puzzleDefinitionForSharing(game), grid: { size: 7, regions: disconnected } }),
    })
    assert.equal(request.status, 400)
  } finally {
    sqlite.close()
  }
})
