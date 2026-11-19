import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyDeduction, fillEntries, isSolved, puzzleIdentity, restartGame, undo } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { decodeCoachSix } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker(process.env.SIZED_COACH_WASM)

const constraints = [
  { type: 'diagonalPositive', segments: [] },
  { type: 'thermometer', segments: [{ cells: [1, 7, 13, 14] }, { cells: [32, 26, 20] }] },
  { type: 'odd', segments: [{ cells: [24] }, { cells: [17] }] },
]
const code = coachCode({ gridSize: 6, givenDigits: '000000000000000000000000000030000400', givenConstraints: constraints,
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)) })
const expected = '413652625314234561156243542136361425'

test('six-by-six Coach constraints reach Wasm together and change the exact solution count', async () => {
  const decoded = await decodeCoachSix(code)
  const { givens, rules, grid, version } = decoded
  const position = { digits: Array.from(givens, Number), rules, grid, version }
  assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
  const solved = await runEngine({ type: 'sized-variant', position, operation: 'solve' })
  assert.equal(solved?.digits.join(''), expected)
  const candidates = await runEngine({ type: 'sized-variant', position, operation: 'candidates' })
  assert.ok(candidates)
  assert.equal(candidates.length, 36)
  assert.equal(candidates[24] & 0b101010, 0)
  for (const ruleType of ['diagonal', 'parity', 'thermometer']) {
    const partial = { ...position, rules: rules.filter(rule => rule.type !== ruleType) }
    assert.equal(await runEngine({ type: 'sized-variant', position: partial, operation: 'analyze' }), 'multiple')
  }
})

test('a Coach short link preserves 6 × 6 rules through Play, undo, reload and sharing', async ({ mock }) => {
  const shareId = '66666666-6666-4666-8666-666666666666'
  let shared: object | undefined
  mock.method(globalThis, 'fetch', async (path: string, request?: RequestInit) => {
    if (path === '/api/v1/import/sudoku-coach/Test6') return Response.json({ code })
    if (path === '/api/v1/shares' && request?.method === 'POST') {
      shared = JSON.parse(String(request.body))
      return Response.json({ id: shareId })
    }
    assert.equal(path, `/api/v1/shares/${shareId}`)
    return Response.json(shared)
  })
  const { game } = await prepareImportedPuzzle('https://sudoku.coach/en/s/Test6')
  const { six, grid } = game
  assert.ok(six && grid?.size === 6)
  assert.equal(six.solution, expected)
  assert.equal(isSolved(fillEntries(game, expected)), true)
  assert.deepEqual(restartGame(game).six, six)
  assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, grid: { size: 6, boxRows: 3, boxColumns: 2 } }))
  assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, six: { ...six, rules: [] } }))
  const candidates = await playCandidates(game)
  assert.ok(candidates?.every((mask, cell) => game.givens[cell] !== '0' || mask & (1 << (Number(expected[cell]) - 1))))
  const hint = await puzzleHints(game, 'all', 'sized-parity')
  assert.ok(hint.candidates)
  const moved = applyDeduction(game, hint.choices[0].actions, hint.candidates)
  assert.notDeepEqual(moved.position, game.position)
  assert.deepEqual(undo(moved).position, game.position)
  assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.six, six)
  assert.equal(readGame(game.id, JSON.stringify({ ...game, six: undefined })), undefined)
  assert.equal(await publishSharedPuzzle(moved), shareId)
  assert.deepEqual(shared, { version: 1, title: game.title, givens: game.givens, grid, sixRules: six.rules })
  const copy = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
  assert.deepEqual(copy.game.six, six)
  const replay = await puzzleSolution(game)
  assert.equal(replay.status, 'solved')
  assert.equal(replay.board, expected)
  assert.ok(replay.steps.some(step => step.technique === 'sized-contradiction'))
  assert.ok(replay.steps.some(step => step.technique === 'sized-parity'))
  assert.ok(replay.steps.some(step => step.technique === 'sized-thermometer'))
  for (const step of replay.steps) for (const action of step.actions) {
    if ('place' in action) assert.equal(action.place.digit, Number(expected[action.place.cell]))
    else assert.notEqual(action.eliminate.digit, Number(expected[action.eliminate.cell]))
  }
})
