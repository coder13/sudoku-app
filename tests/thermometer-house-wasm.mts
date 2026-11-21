import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { generatePlayableVariant, getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertThermometerHouseProof } from './helpers/thermometer-house-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const technique = 'thermometer-house-support'
const spider = JSON.parse(readFileSync(new URL('./fixtures/coach-artwork-traffic.json', import.meta.url), 'utf8'))
  .find(source => source.sudoku_id === '5uJS')

test('Sudoku Spider finishes with independently checked Thermometer and house deductions', async () => {
  const { game, grade } = await prepareImportedPuzzle(spider.sudoku)
  assert.ok(game.variant)
  assert.deepEqual([grade?.difficulty, grade?.points, grade?.scoringVersion], ['medium', 1952, 18])
  const position = variantPosition(game.variant)
  const order = await getVariantPlayOrder(position.puzzle)
  const runTrace = (techniqueOrder: readonly string[]) => runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  const earlier = await runTrace(order.filter(id => id !== technique))
  assert.equal(earlier.rating.status, 'stalled')
  assert.equal(earlier.steps.length, 68)
  const trace = await runTrace(order)
  assert.deepEqual(trace.rating.status, { solved: 'medium' })
  assert.equal(trace.steps.length, 100)
  assert.equal(trace.rating.counts[technique], 2)
  let replay = game
  for (const deduction of trace.steps) {
    const values = valuesOf(replay)
    const masks = variantHouseMasks(position.puzzle, values, replay.position.eliminations)
    if (deduction.technique === technique) assertThermometerHouseProof(position.puzzle, values, masks, deduction)
    for (const action of deduction.actions) {
      const target = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(spider.solution[target.cell]) === target.digit, 'place' in action)
    }
    replay = applyDeduction(replay, deduction.actions, masks)
  }
  assert.equal(valuesOf(replay), spider.solution)

  const stalled = { ...game, position: { ...game.position, ...earlier.end } }
  const stalledPosition = variantPosition(game.variant, stalled.position)
  const values = valuesOf(stalled)
  const masks = variantHouseMasks(position.puzzle, values, earlier.end.eliminations)
  const proofs = await runEngine({
    type: 'variant', operation: 'hints', position: stalledPosition,
    techniqueOrder: [technique], limit: 0xffff_ffff,
  })
  for (const proof of proofs) assertThermometerHouseProof(position.puzzle, values, masks, proof)
  const row = proofs.find(proof => proof.evidence.type === 'thermometer-house' &&
    'row' in proof.evidence.house && proof.evidence.house.row === 3)
  assert.ok(row)
  assert.deepEqual(row.actions, [[28, 9], [29, 8], [33, 3], [34, 4]].map(([cell, digit]) => ({ eliminate: { cell, digit } })))
  const hints = await puzzleHints(stalled, 'all', technique)
  assert.equal(hints.available, proofs.length)
  assert.ok(hints.choices.find(choice => choice.actions.some(action => 'eliminate' in action &&
    action.eliminate.cell === 33 && action.eliminate.digit === 3)))
  const scan = watchTechniqueScan(values, earlier.end.eliminations, stalledPosition)
  try {
    const targets = new Set(proofs.flatMap(proof => proof.actions.map(action => JSON.stringify(action))))
    assert.equal(await scan.count(technique), targets.size)
  } finally {
    scan.close()
  }
  const progressed = applyDeduction(stalled, row.actions, masks)
  assert.deepEqual(undo(progressed).position, stalled.position)
  assert.deepEqual(redo(undo(progressed)).position, progressed.position)
  assert.ok(!(await puzzleHints(progressed, 'all', technique)).choices.some(choice => choice.actions.some(action =>
    'eliminate' in action && action.eliminate.cell === 33 && action.eliminate.digit === 3)))
})

test('the practice library checks a row, a column, a box, and a fresh position', async () => {
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({
    type: 'generate-practice-example', variant: true, technique, seed: 13921, exclude: examples[0].position.puzzle.givens,
  })
  assert.ok(fresh)
  assert.notEqual(fresh.position.puzzle.givens, examples[0].position.puzzle.givens)
  for (const sample of [...examples, fresh]) {
    const { position, candidates, deduction, suggestion } = sample
    assertThermometerHouseProof(position.puzzle, position.puzzle.givens, candidates, deduction)
    assert.deepEqual(await runEngine({
      type: 'variant', operation: 'check-practice-move', position, technique, action: suggestion,
    }), deduction)
    assert.equal(countLineSolutions(position.puzzle).count, 1)
  }
})

test('Thermometer proofs follow the authored Jigsaw region order', async () => {
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique })
  const regions = Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, i) =>
    Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))
  // The exchanged cells lie along a region edge and hold the same published digit.
  regions[2][regions[2].indexOf(6)] = 23
  regions[1][regions[1].indexOf(23)] = 6
  const puzzle: VariantPuzzle = {
    ...examples[2].position.puzzle,
    regions: { type: 'jigsaw', regions: [regions[8], ...regions.slice(0, 8)] },
  }
  const position = { puzzle }
  const hints = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [technique], limit: 0xffff_ffff })
  const proof = hints.find(hint => hint.evidence.type === 'thermometer-house' &&
    'region' in hint.evidence.house && hint.evidence.house.region === 0)
  assert.ok(proof)
  assertThermometerHouseProof(puzzle, puzzle.givens, variantHouseMasks(puzzle, puzzle.givens), proof)
  const { count, solution } = countLineSolutions(puzzle)
  assert.equal(count, 1)
  assert.ok(solution)
  assert.ok(proof.actions.every(action => 'eliminate' in action &&
    Number(solution[action.eliminate.cell]) !== action.eliminate.digit))
})

test('Extreme Thermometer generation keeps a 17-given path and excludes played puzzles', async () => {
  const seed = 195296274
  const first = await generatePlayableVariant('thermometer', 'extreme', seed, [])
  assert.equal(first.givens, 17)
  const played = { ...makeGame('extreme-thermometer', 'Thermometer', first.puzzle.givens, 'generated'),
    variant: { id: 'thermometer' as const, puzzle: first.puzzle, solution: first.solution } }
  const second = await generatePlayableVariant('thermometer', 'extreme', seed, [played])
  assert.notEqual(first.puzzle.givens, second.puzzle.givens)
  for (const generated of [first, second]) {
    assert.deepEqual(countLineSolutions(generated.puzzle).solutions, [generated.solution])
    assert.equal(countLineSolutions({ ...generated.puzzle, rules: [] }).count, 2)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: generated.puzzle },
      techniqueOrder: await getVariantPlayOrder(generated.puzzle) })
    assert.deepEqual(trace.rating.status, { solved: 'extreme' })
    assert.equal(trace.rating.points, generated.rating.points)
  }
})
