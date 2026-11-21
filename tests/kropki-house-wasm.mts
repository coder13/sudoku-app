import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { applyPuzzleGrade, puzzleGradeIsStale, ratePuzzle } from '../src/sudoku/puzzle-rating.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { assertKropkiHouseProof } from './helpers/kropki-house-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const technique = 'kropki-house-support'
const cauldron = JSON.parse(readFileSync(new URL('./fixtures/coach-clue-styles.json', import.meta.url), 'utf8'))
  .find(source => source.id === '5uuR')
test('Cauldron imports, rates and replays to its published grid using checked dot deductions', async () => {
  const { game, grade } = await prepareImportedPuzzle(cauldron.code)
  assert.ok(game.variant)
  assert.deepEqual([grade?.difficulty, grade?.points, grade?.scoringVersion], ['medium', 2653, 21])
  const oldGrade = { ...game, variantRatingVersion: 15, difficulty: null, score: null }
  assert.ok(puzzleGradeIsStale(oldGrade))
  const refreshed = applyPuzzleGrade(oldGrade, await ratePuzzle(game.givens, game.variant))
  assert.deepEqual([refreshed.difficulty, refreshed.score, refreshed.variantRatingVersion], ['medium', 2653, 17])

  const position = variantPosition(game.variant)
  const order = await getVariantPlayOrder(position.puzzle)
  const trace = (techniqueOrder: readonly string[]) => runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  const before = await trace(order.filter(id => id !== technique && id !== 'linked-clue-contradiction'))
  assert.equal(before.rating.status, 'stalled')
  assert.equal(before.steps.length, 82)
  const after = await trace(order)
  assert.deepEqual(after.rating.status, { solved: 'medium' })
  assert.equal(after.steps.length, 123)
  assert.equal(after.rating.counts[technique], 5)
  let replay = game
  for (const step of after.steps) {
    const values = valuesOf(replay)
    const candidates = variantHouseMasks(position.puzzle, values, replay.position.eliminations)
    if (step.technique === technique) assertKropkiHouseProof(position.puzzle, values, candidates, step)
    for (const action of step.actions) {
      const target = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(cauldron.solution[target.cell]) === target.digit, 'place' in action)
    }
    replay = applyDeduction(replay, step.actions, candidates)
  }
  assert.equal(valuesOf(replay), cauldron.solution)
  assert.equal((await puzzleSolution(game)).board, cauldron.solution)

  const stalled = { ...game, position: { ...game.position, ...before.end } }
  const values = valuesOf(stalled)
  const masks = variantHouseMasks(position.puzzle, values, stalled.position.eliminations)
  const stalledPosition = variantPosition(game.variant, stalled.position)
  const proofs = await runEngine({ type: 'variant', operation: 'hints', position: stalledPosition,
    techniqueOrder: [technique], limit: 0xffff_ffff })
  for (const proof of proofs) assertKropkiHouseProof(position.puzzle, values, masks, proof)
  const column = proofs.find(proof => proof.evidence.type === 'kropki-house' && 'column' in proof.evidence.house &&
    proof.evidence.house.column === 3 && proof.evidence.pair.join() === '30,39')
  assert.ok(column)
  assert.deepEqual(column.actions, [{ eliminate: { cell: 30, digit: 1 } }, { eliminate: { cell: 39, digit: 1 } }])
  const hints = await puzzleHints(stalled, 'all', technique)
  assert.equal(hints.available, proofs.length)
  assert.ok(hints.choices.some(choice => JSON.stringify(choice.actions) === JSON.stringify(column.actions) &&
    'variant' in choice.evidence && /R1C4 has no digit left/i.test(choice.evidence.variant.reason)))
  const scan = watchTechniqueScan(values, stalled.position.eliminations, stalledPosition)
  try {
    assert.equal(await scan.count(technique), new Set(proofs.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size)
  } finally { scan.close() }
  const progressed = applyDeduction(stalled, column.actions, masks)
  assert.deepEqual(undo(progressed).position, stalled.position)
  assert.deepEqual(redo(undo(progressed)).position, progressed.position)
})

test('row, column and box practice positions and fresh drills retain valid dot proofs', async () => {
  const samples = await runEngine({ type: 'practice-examples', variant: true, technique })
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique, seed: 12337,
    exclude: samples[0].position.puzzle.givens })
  assert.ok(fresh)
  assert.equal(samples.length, 3)
  assert.notEqual(fresh.position.puzzle.givens, samples[0].position.puzzle.givens)
  for (const { position, candidates, deduction, suggestion } of [...samples, fresh]) {
    assertKropkiHouseProof(position.puzzle, position.puzzle.givens, candidates, deduction)
    assert.equal(countLineSolutions(position.puzzle).count, 1)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position, technique,
      action: suggestion }), deduction)
  }
})

test('black dots join their shared house, while a negative rule with no printed dots gives no dot proofs', async () => {
  const puzzle: VariantPuzzle = {
    version: 1, givens: '900000000100405700207930000070341025010000007003007800092000058841053009300820174',
    rules: [{ type: 'kropki', ratioTwo: { pairs: [[10, 11]] } }],
  }
  const query = (puzzle: VariantPuzzle) => runEngine({ type: 'variant', operation: 'hints', position: { puzzle },
    techniqueOrder: [technique], limit: 0xffff_ffff })
  const hints = await query(puzzle)
  assert.ok(hints.some(hint => hint.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 13 && action.eliminate.digit === 6)))
  for (const hint of hints) assertKropkiHouseProof(puzzle, puzzle.givens, variantHouseMasks(puzzle, puzzle.givens), hint)
  const negative: VariantPuzzle = {
    version: 1, givens: '0'.repeat(81), rules: [{ type: 'kropki', ratioTwo: { pairs: [], negative: true } }],
  }
  assert.deepEqual(await query(negative), [])
  assert.ok(!(await getVariantPlayOrder(negative)).includes(technique))
})

test('two marks on one edge preserve both rules in an irregular Jigsaw house proof', async () => {
  const regions = Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, i) =>
    Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))
  // Exchange adjacent-region cells with the same solution digit.
  regions[0][regions[0].indexOf(19)] = 29
  regions[3][regions[3].indexOf(29)] = 19
  const puzzle: VariantPuzzle = {
    version: 1, givens: '900102683030080702080000540078301920509000007000590000700600358041000209060800100',
    regions: { type: 'jigsaw', regions: [...regions.slice(1), regions[0]] },
    rules: [
      { type: 'kropki', ratioTwo: { pairs: [[9, 18]] } },
      { type: 'kropki', consecutive: { pairs: [[18, 9]] } },
    ],
  }
  const hints = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle },
    techniqueOrder: [technique], limit: 0xffff_ffff })
  const proof = hints.find(hint => hint.evidence.type === 'kropki-house' &&
    'region' in hint.evidence.house && hint.evidence.house.region === 8)
  assert.ok(proof?.evidence.type === 'kropki-house')
  assert.deepEqual(proof.evidence.rules, [0, 1])
  assert.deepEqual(proof.actions, [{ eliminate: { cell: 20, digit: 2 } }])
  assertKropkiHouseProof(puzzle, puzzle.givens, variantHouseMasks(puzzle, puzzle.givens), proof)
  assert.equal(countLineSolutions(puzzle).count, 1)
})
