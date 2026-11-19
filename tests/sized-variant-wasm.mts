import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { analyzeAlgebraic } from '../src/sudoku/algebraic-play.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { puzzleLinkHash } from '../src/sudoku/formats.ts'
import { foundationVisuals } from '../src/sudoku/foundation-visuals.ts'
import { applyDeduction, fillEntries, isSolved, redo, restartGame, undo } from '../src/sudoku/game.ts'
import { MINI_GRID } from '../src/sudoku/grid.ts'
import { analyzeMini } from '../src/sudoku/mini-play.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { findImportedPuzzle, prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const givens = '0000000201400000'
const expected = '3214143221434321'
const code = 'scl' + lzString.compressToBase64(JSON.stringify({
  id: 'contract-puzzle',
  metadata: { title: 'Two related totals', author: 'Contract fixture',
    rules: '* Normal 4x4 Sudoku rules apply: Place the digits 1-4 in each row, column, and region.\n' +
      '* Algebraic Killer Cages: Digits in a cage must not repeat and must sum to the total in the top-left corner of the cage. ' +
      '"n" is a positive integer to be determined by the solver.',
  },
  cells: Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => {
    const digit = Number(givens[row * 4 + column])
    return digit ? { value: digit } : {}
  })),
  regions: [
    [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 2], [0, 3], [1, 2], [1, 3]],
    [[2, 0], [2, 1], [3, 0], [3, 1]], [[2, 2], [2, 3], [3, 2], [3, 3]],
  ],
  cages: [{ cells: [[0, 0]], value: 'n+2' }, { cells: [[1, 0]], value: 'n' }],
}))

test('a SudokuPad short link retains the rules through solve, hints, replay, share, and storage', async ({ mock }) => {
  mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/v1/import/sudokupad/contract-puzzle')
    return Response.json({ code })
  })
  const { game } = await prepareImportedPuzzle('https://sudokupad.app/contract-puzzle')
  const algebraic = game.algebraic
  assert.ok(algebraic)
  assert.equal(algebraic.source?.code, code)
  assert.equal(game.title, 'Two related totals')
  assert.equal(algebraic.solution, expected)
  assert.equal(await analyzeMini(givens), 'multiple')
  assert.equal(await analyzeAlgebraic(algebraic, givens), 'unique')
  assert.equal(isSolved(fillEntries(game, '1234341221434321')), false)
  assert.equal(isSolved(fillEntries(game, expected)), true)
  assert.deepEqual(restartGame(game).algebraic, algebraic)

  const notes = await playCandidates(game)
  assert.ok(notes?.every((mask, cell) => givens[cell] !== '0' || (mask & (1 << (Number(expected[cell]) - 1)))))
  const hints = await puzzleHints(game, 'all', 'algebraic-cage-bounds')
  assert.ok(hints.available > 0)
  assert.match(JSON.stringify(hints.choices[0].evidence), /n\+2 can total/)
  assert.ok(hints.candidates)
  const moved = applyDeduction(game, hints.choices[0].actions, hints.candidates)
  assert.notDeepEqual(moved.position, game.position)
  assert.deepEqual(undo(moved).position, game.position)
  assert.deepEqual(redo(undo(moved)).position, moved.position)
  const saved = readGame(moved.id, JSON.stringify(moved))
  assert.deepEqual(saved?.algebraic, algebraic)
  assert.deepEqual(saved?.position, moved.position)
  assert.equal(readGame(game.id, JSON.stringify({ ...game, algebraic: { ...algebraic, solution: '1234341221434321' } })), undefined)

  const share = '#' + puzzleLinkHash(game)
  assert.equal(findImportedPuzzle([game], await detectPuzzle(share))?.id, game.id)
  assert.deepEqual((await prepareImportedPuzzle(share)).game.algebraic, algebraic)
  const nativeGame = { ...game, algebraic: { rules: algebraic.rules, solution: algebraic.solution } }
  const nativeLink = '#' + puzzleLinkHash(nativeGame)
  assert.deepEqual((await prepareImportedPuzzle(nativeLink)).game.algebraic, nativeGame.algebraic)
  assert.deepEqual(readGame(nativeGame.id, JSON.stringify(nativeGame))?.algebraic, nativeGame.algebraic)
  const trace = await puzzleSolution(game)
  assert.equal(trace.status, 'solved')
  assert.equal(trace.board, expected)
  assert.ok(trace.steps.some(step => step.technique === 'algebraic-cage-bounds'))
})

test('generated algebraic definitions are deterministic, replayable, and excluded in either cage order', async () => {
  const request = { type: 'generate-algebraic', seed: 42 } as const
  const generated = await runEngine(request)
  assert.deepEqual(await runEngine(request), generated)
  assert.deepEqual(generated.grid, MINI_GRID)
  const exclude = { ...generated, rules: [...generated.rules].reverse().map(rule => ({ ...rule, cells: [...rule.cells].reverse() })) }
  assert.notDeepEqual(await runEngine({ ...request, exclude: [exclude] }), generated)
  const link = '#sized=' + encodeURIComponent(JSON.stringify({
    version: generated.version, grid: generated.grid, givens: generated.digits.join(''), rules: generated.rules,
  }))
  const { game } = await prepareImportedPuzzle(link)
  assert.ok(game.algebraic)
  assert.deepEqual(game.algebraic.rules, generated.rules)
  assert.equal((await puzzleSolution(game)).board, game.algebraic.solution)
  assert.equal(await analyzeMini(game.givens), 'multiple')
})

test('the lesson figures and practice have the candidate removals proved by their visible cages', async () => {
  for (const [id, removed] of [['algebraic-cage-bounds', [2, 3, 4]], ['algebraic-cage-practice', [4]]] as const) {
    const { grid, algebraicCages } = foundationVisuals[id]
    assert.ok(grid && algebraicCages)
    const proof = await runEngine({
      type: 'sized-variant', operation: 'cage-proof', rule: 0,
      position: { version: 2, grid, digits: Array(16).fill(0), rules: algebraicCages },
    })
    assert.deepEqual(proof?.actions, removed.map(digit => ({ eliminate: { cell: algebraicCages[0].cells[0], digit } })))
  }
})
