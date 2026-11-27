import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { hintEliminations, makeGame, replaceCandidates } from '../src/sudoku/game.ts'
import { puzzleHints } from '../src/sudoku/puzzle-help.ts'
import { applyPuzzleGrade, needsPuzzleGrade, ratePuzzle } from '../src/sudoku/puzzle-rating.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantHintOrder } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('the chess puzzle exposes its locked candidates in Techniques and Hint and solves without overlays', async () => {
  const cells = [
    '1 2467 2347 234 9 23457 2345 8 234567',
    '2347 5 8 1 6 2347 234 9 2347',
    '2467 246 9 234 35 8 1 3456 34567',
    '2468 1 246 7 235 9 3456 3456 3458',
    '89 3 56 456 1 46 7 2 89',
    '25679 2467 2456 8 23 356 3456 1 34569',
    '2456 246 1 9 7 2356 8 3456 3456',
    '2356 8 2356 2356 4 1 9 7 2356',
    '234567 9 23567 2356 8 2356 2356 3456 1',
  ].join(' ').split(' ')
  const givens = cells.map(cell => cell.length === 1 ? cell : '0').join('')
  const masks = cells.map(cell => cell.length === 1 ? 0
    : [...cell].reduce((mask, digit) => mask | 1 << (Number(digit) - 1), 0))
  const puzzle: VariantPuzzle = { version: 1, givens, rules: [{ type: 'anti-king' }, { type: 'anti-knight' }] }
  const eliminations = hintEliminations(givens, masks)
  const position = { puzzle, eliminations }
  const solution = await runEngine({ type: 'variant', operation: 'solve-unique', position })
  assert.equal(solution.status, 'unique')
  const game = replaceCandidates({
    ...makeGame('chess-peer-lock', 'Chess peer lock', givens, 'imported'),
    variant: { id: 'mixed', puzzle, solution: solution.solution },
  }, masks)

  const selected = await puzzleHints(game, 'all', 'locked-candidates')
  const choice = selected.choices.find(hint => hint.actions.some(action =>
    'eliminate' in action && action.eliminate.cell === 31 && action.eliminate.digit === 5))
  assert.ok(choice && 'variant' in choice.evidence)
  assert.match(choice.evidence.variant.description, /5 can go only in r5c3 or r5c4/i)
  assert.match(choice.evidence.variant.reason, /Anti-Knight.*box 5/i)
  assert.match(choice.evidence.variant.reasonSteps?.at(-1) ?? '', /remove 5 from r4c5/i)
  assert.ok((await puzzleHints(game)).choices.some(hint => hint.technique === 'locked-candidates'))

  const scan = watchTechniqueScan(givens, eliminations, position, undefined, await variantHintOrder(puzzle))
  try {
    assert.ok(await scan.count('locked-candidates') > 0)
  } finally { scan.close() }

  const trace = await runEngine({ type: 'variant', operation: 'trace', position,
    techniqueOrder: ['naked-single', 'hidden-single', 'anti-king', 'anti-knight', 'locked-candidates'] })
  assert.notEqual(trace.rating.status, 'stalled')
  assert.equal(trace.end.entries, [...solution.solution].map((digit, cell) => givens[cell] === '0' ? digit : '0').join(''))
  for (const step of trace.steps) for (const action of step.actions) {
    if ('eliminate' in action) assert.notEqual(Number(solution.solution[action.eliminate.cell]), action.eliminate.digit)
  }

  // The later screenshot has already removed 5 from R4C7 and R6C3.
  const later = replaceCandidates(game, masks.map((mask, cell) => cell === 33 || cell === 47 ? mask & ~(1 << 4) : mask))
  const chains = await puzzleHints(later, 'all', 'x-chain')
  assert.ok(chains.choices.some(({ evidence }) => 'inference' in evidence &&
    evidence.inference.links.some(({ source }) => 'variant-rule' in source && source['variant-rule'] === 'anti-knight')))
})

test('an older chess and Quadruple grade refreshes to Medium', async () => {
  const givens = '0'.repeat(81)
  const circles: [number, number[]][] = [
    [39, [3, 8, 2, 6]], [60, [6, 8, 7, 1]], [69, [5, 2, 7]], [70, [1, 9, 2, 3]],
    [61, [4, 1, 9]], [10, [4, 6, 9, 7]], [14, [2, 3]], [25, [2, 6]], [55, [2, 6, 8, 3]], [27, [2, 3]],
  ]
  const puzzle: VariantPuzzle = {
    version: 1, givens,
    rules: [{ type: 'anti-knight' }, { type: 'anti-king' },
      ...circles.map(([topLeft, digits]) => ({ type: 'quadruple' as const, topLeft, digits }))],
  }
  const result = await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } })
  assert.equal(result.status, 'unique')
  const game = {
    ...makeGame('chess-quadruples', 'Chess and Quadruples', givens, 'imported'),
    variant: { id: 'mixed' as const, puzzle, solution: result.solution },
    difficulty: 'extreme' as const, score: 26_187, variantRatingVersion: 22,
  }
  assert.equal(needsPuzzleGrade(game), true)
  const grade = await ratePuzzle(givens, game.variant)
  assert.equal(grade?.difficulty, 'medium')
  assert.equal(grade?.points, 4_403)
  const refreshed = applyPuzzleGrade(game, grade)
  assert.equal(refreshed.difficulty, 'medium')
  assert.equal(needsPuzzleGrade(refreshed), false)
})
