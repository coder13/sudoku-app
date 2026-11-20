import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { applyDeduction, puzzleIdentity, undo } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('a compact 4 × 4 Renban link goes through import, Play, persistence, and Worker sharing', async ({ mock }) => {
  const compact = String.raw`{
    id:'mini-renban',
    ca:[{v:'title: Crossing lines'},{v:'author: Test setter'},
        {v:'rules: SUDOKU\n- Fill the grid with the digits 1-4 so that no digit repeats in a row, column, or box.\n\nRENBAN\n- Digits on a purple Renban line must be a set of consecutive, non-repeating digits (in any order).'}],
    cs:50,
    ce:[[,,,],[,{v:3},{v:2},],[,,,],[,,{v:1},]],
    re:[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]],
    l:[{wp:[[3.5,1.5],[2.5,2.5],[3.5,3.5]],c:f067f0,th:10},{wp:[[2.5,3.5],[3.5,2.5],[3.5,3.5]],c:f067f0,th:10}]
  }`
  const encoded = 'scl' + lzString.compressToBase64(compact)
  const { sqlite, fetcher } = syncDatabase()
  try {
    const liveLink = 'https://sudokupad.app/compact-test'
    mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) =>
      path === '/api/v1/import/sudokupad/compact-test' ? Promise.resolve(Response.json({ code: encoded })) :
        fetcher(new URL(path, 'https://sudoku.test').href, options))
    const { game } = await prepareImportedPuzzle(liveLink)
    const { grid, sized } = game
    assert.equal(grid?.size, 4)
    assert.ok(sized)
    assert.equal(sized.author, 'Test setter')
    assert.equal(sized.solution, '2431132431424213')
    assert.deepEqual(sized.rules, [
      { type: 'renban', cells: [13, 10, 15] },
      { type: 'renban', cells: [11, 14, 15] },
    ])
    assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, sized: undefined }))
    const candidates = await playCandidates(game)
    assert.equal(candidates?.length, 16)
    const hint = await puzzleHints(game, 'all', 'sized-renban')
    assert.ok(hint.candidates && hint.choices[0])
    const moved = applyDeduction(game, hint.choices[0].actions, hint.candidates)
    assert.notDeepEqual(moved.position, game.position)
    assert.deepEqual(undo(moved).position, game.position)
    assert.deepEqual(readGame(game.id, JSON.stringify(moved))?.sized, sized)
    assert.equal(readGame(game.id, JSON.stringify({ ...moved, sized: { ...sized, rules: [
      { type: 'renban', cells: [0, 16] },
    ] } })), undefined)
    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, sized.solution)
    assert.ok(replay.steps.some(step => step.technique === 'sized-renban'))
    const shareId = await publishSharedPuzzle(moved)
    const response = await fetcher(`https://sudoku.test/api/v1/shares/${shareId}`)
    assert.deepEqual(await response.json(), {
      version: 1, title: 'Crossing lines', givens: game.givens, grid, sizedRules: sized.rules, sizedAuthor: sized.author,
    })
    const copy = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
    assert.deepEqual(copy.game.sized, sized)
    assert.notDeepEqual(moved.position, copy.game.position)
  } finally {
    sqlite.close()
  }
})
