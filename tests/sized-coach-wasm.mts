import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyDeduction, fillEntries, isSolved, makeGame, puzzleIdentity, restartGame, undo } from '../src/sudoku/game.ts'
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
  const { sized, grid } = game
  assert.ok(sized && grid?.size === 6)
  assert.equal(sized.solution, expected)
  assert.equal(isSolved(fillEntries(game, expected)), true)
  assert.deepEqual(restartGame(game).sized, sized)
  assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, grid: { size: 6, boxRows: 3, boxColumns: 2 } }))
  assert.notEqual(puzzleIdentity(game), puzzleIdentity({ ...game, sized: { ...sized, rules: [] } }))
  const candidates = await playCandidates(game)
  assert.ok(candidates?.every((mask, cell) => game.givens[cell] !== '0' || mask & (1 << (Number(expected[cell]) - 1))))
  const hint = await puzzleHints(game, 'all', 'sized-parity')
  assert.ok(hint.candidates)
  const moved = applyDeduction(game, hint.choices[0].actions, hint.candidates)
  assert.notDeepEqual(moved.position, game.position)
  assert.deepEqual(undo(moved).position, game.position)
  assert.deepEqual(readGame(moved.id, JSON.stringify(moved))?.sized, sized)
  assert.deepEqual(readGame(moved.id, JSON.stringify({ ...moved, sized: undefined, six: sized }))?.sized, sized)
  assert.equal(readGame(game.id, JSON.stringify({ ...game, sized: undefined })), undefined)
  assert.equal(await publishSharedPuzzle(moved), shareId)
  assert.deepEqual(shared, { version: 1, title: game.title, givens: game.givens, grid, sixRules: sized.rules })
  const copy = await prepareSharedPuzzle(shareId, [], new AbortController().signal)
  assert.deepEqual(copy.game.sized, sized)
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

test('older 6 × 6 drafts migrate rule lists in current, undo and redo positions', () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  const game = makeGame('legacy-draft', 'Old draft', '0'.repeat(36), 'draft', undefined, grid)
  const rules = [{ type: 'renban', cells: [0, 1, 2] }]
  const restored = readGame(game.id, JSON.stringify({
    ...game, position: { ...game.position, draftSixRules: rules },
    past: [{ ...game.position, draftSixRules: [] }], future: [{ ...game.position, draftSixRules: rules }],
  }))
  assert.deepEqual(restored?.position.draftSizedRules, rules)
  assert.deepEqual(restored?.past[0].draftSizedRules, [])
  assert.deepEqual(restored?.future[0].draftSizedRules, rules)
  assert.ok(!Object.hasOwn(restored!.position, 'draftSixRules'))
})

test('6 × 6 generation meets both difficulty recipes in both box orientations', async () => {
  for (const grid of [{ size: 6, boxRows: 2, boxColumns: 3 }, { size: 6, boxRows: 3, boxColumns: 2 }] as const) {
    for (const difficulty of ['easy', 'medium'] as const) {
      const request = { type: 'generate-six', grid, difficulty, seed: 17 } as const
      const digits = await runEngine(request)
      assert.deepEqual(await runEngine(request), digits)
      assert.notDeepEqual(await runEngine({ ...request, exclude: [digits] }), digits)
      const position = { version: 2, grid, digits } as const
      assert.equal(await runEngine({ type: 'sized-classic', position, operation: 'analyze' }), 'unique')
      const trace = await runEngine({ type: 'sized-classic', position, operation: 'trace' })
      assert.ok(trace?.length)
      assert.ok(trace.at(-1)?.digits.every(Boolean))
      assert.equal(trace.some(step => step.deduction && step.deduction.technique !== 'naked-single'), difficulty === 'medium')
    }
  }
})

test('mixed 6 × 6 Renban and thermometer need both overlapping rules in both box orientations', async () => {
  const givens = '403000000010030000006200000000060005'
  const position = { version: 2, grid: { size: 6, boxRows: 2, boxColumns: 3 }, digits: Array.from(givens, Number),
    rules: [{ type: 'renban', cells: [23, 22, 15, 21], segments: [[23, 22, 15], [15, 21]] },
      { type: 'thermometer', cells: [27, 22, 29] }] } as const
  const transpose = (cell: number) => (cell % 6) * 6 + Math.floor(cell / 6)
  const transposed = { ...position, grid: { size: 6, boxRows: 3, boxColumns: 2 },
    digits: position.digits.map((_, index) => position.digits[transpose(index)]),
    rules: [{ type: 'renban', cells: position.rules[0].cells.map(transpose),
      segments: position.rules[0].segments.map(path => path.map(transpose)) },
    { type: 'thermometer', cells: position.rules[1].cells.map(transpose) }] } as const

  for (const [puzzle, solution] of [[position, expected], [transposed, [...expected].map((_, index) => expected[transpose(index)]).join('')]] as const) {
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: puzzle }), 'unique')
    assert.equal((await runEngine({ type: 'sized-variant', operation: 'solve', position: puzzle }))?.digits.join(''), solution)
    for (const rule of puzzle.rules) {
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...puzzle, rules: [rule] } }), 'multiple')
    }
    const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position: puzzle })
    assert.equal(trace?.at(-1)?.digits.join(''), solution)
    assert.ok(trace?.some(step => step.deduction?.type === 'rule' && step.deduction.rule === 0))
  }
})
