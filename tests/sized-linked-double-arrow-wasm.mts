import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyDeduction, undo } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { id, code } = JSON.parse(readFileSync(new URL('fixtures/sized-sudokupad-linked-double-arrow.json', import.meta.url), 'utf8'))
const answer = '614523235461521346346152463215152634'

test('a padded SudokuPad export preserves five Double Arrows and seven shared X-Sum circles', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) =>
      path === `/api/v1/import/sudokupad/${id}` ? Promise.resolve(Response.json({ code })) :
        fetcher(new URL(path, 'https://sudoku.test').href, options))
    const { game } = await prepareImportedPuzzle(`https://sudokupad.app/${id}`)
    assert.deepEqual(game.grid, { size: 6, boxRows: 2, boxColumns: 3 })
    assert.ok(game.sized)
    assert.equal(game.sized.solution, answer)
    assert.equal(game.sized.author, 'Florian Wortmann')
    const rules = game.sized.rules
    assert.ok(rules.every(rule => rule.type === 'linked-double-arrow'))
    assert.deepEqual(rules.map(rule => rule.cells), [[0], [29, 28, 33], [30, 31], [32, 26, 20, 14, 8, 2], [3, 10, 17]])
    assert.equal(new Set(rules.flatMap(rule => rule.ends.map(end => JSON.stringify(end)))).size, 7)
    assert.deepEqual(rules[3].ends, [{ direction: 'north', index: 2 }, { direction: 'south', index: 2 }])

    const candidates = await playCandidates(game)
    assert.ok(candidates?.every((mask, cell) => mask & (1 << (Number(answer[cell]) - 1))))
    const hint = await puzzleHints(game, 'all', 'sized-double-arrow')
    assert.ok(hint.candidates && hint.choices[0])
    const moved = applyDeduction(game, hint.choices[0].actions, hint.candidates)
    assert.notDeepEqual(moved.position, game.position)
    assert.deepEqual(undo(moved).position, game.position)
    assert.deepEqual(readGame(game.id, JSON.stringify(moved))?.sized, game.sized)

    const replay = await puzzleSolution(game)
    assert.equal(replay.status, 'solved')
    assert.equal(replay.board, answer)
    const shared = await prepareSharedPuzzle(await publishSharedPuzzle(moved), [], new AbortController().signal)
    assert.deepEqual(shared.game.sized, game.sized)
    const invalid = await fetcher('https://sudoku.test/api/v1/shares', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...puzzleDefinitionForSharing(game), sizedRules: [ {
        ...rules[0], ends: [{ direction: 'south', index: 6 }, rules[0].ends[1]],
      } ] }),
    })
    assert.equal(invalid.status, 400)
  } finally {
    sqlite.close()
  }
})
