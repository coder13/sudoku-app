import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { applyDeduction, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { applyPuzzleGrade, puzzleGradeIsStale, ratePuzzle } from '../src/sudoku/puzzle-rating.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { assertLinkedClueProof } from './helpers/group-order-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()
const technique = 'linked-clue-contradiction'
const source = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]

test('the published Between the Dots walkthrough replays independently checked contradictions', async () => {
  const { game, grade } = await prepareImportedPuzzle(source.code)
  assert.ok(game.variant)
  assert.equal(game.variant.solution, source.solution)
  assert.deepEqual([grade?.difficulty, grade?.points, grade?.scoringVersion], ['hard', 5566, 24])
  const old = { ...game, variantRatingVersion: 16, difficulty: null, score: null }
  assert.ok(puzzleGradeIsStale(old))
  const rerated = applyPuzzleGrade(old, await ratePuzzle(game.givens, game.variant))
  assert.deepEqual([rerated.difficulty, rerated.score, rerated.variantRatingVersion], ['hard', 5566, 22])

  const position = variantPosition(game.variant)
  const order = await getVariantPlayOrder(position.puzzle)
  const trace = (techniqueOrder: readonly string[]) =>
    runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  const baseline = await trace(order.filter(id => id !== technique))
  assert.equal(baseline.rating.status, 'stalled')
  assert.equal(baseline.steps.length, 66)

  const current = await trace(order)
  assert.deepEqual(current.rating.status, { solved: 'hard' })
  assert.equal(current.steps.length, 163)
  assert.equal(current.rating.counts[technique], 13)
  let replay = game
  for (const deduction of current.steps) {
    const values = valuesOf(replay)
    const masks = variantHouseMasks(position.puzzle, values, replay.position.eliminations)
    if (deduction.technique === technique) assertLinkedClueProof(position.puzzle, values, masks, deduction)
    for (const action of deduction.actions) {
      const target = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[target.cell]) === target.digit, 'place' in action)
    }
    replay = applyDeduction(replay, deduction.actions, masks)
  }
  assert.equal(valuesOf(replay), source.solution)
  assert.equal((await puzzleSolution(game)).board, source.solution)
})

test('the stalled board offers the short box-and-line proof in hints, pages, and Finder', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  const variant = game.variant!
  const { puzzle } = variant
  const order = (await getVariantPlayOrder(puzzle)).filter(id => id !== technique)
  const { end } = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: order })
  const stalled = { ...game, position: { ...game.position, ...end } }
  const values = valuesOf(stalled)
  const masks = variantHouseMasks(puzzle, values, end.eliminations)
  const position = variantPosition(variant, stalled.position)
  const all = await runEngine({ type: 'variant', operation: 'hints', position,
    techniqueOrder: [technique], limit: 0xffff_ffff })
  for (const proof of all) assertLinkedClueProof(puzzle, values, masks, proof)
  const [short] = all
  assert.deepEqual(short.actions, [{ eliminate: { cell: 78, digit: 6 } }])
  assert.equal(short.evidence.type, 'linked-clue')
  assert.deepEqual(short.evidence.checks.map(check => check.scope.type), ['house', 'line'])
  assert.deepEqual(short.evidence.houseConflict, { cells: [79, 80], digits: 64 })
  const ranked = await puzzleHints(stalled)
  assert.ok(ranked.choices.length > 1)
  assert.ok(ranked.choices.some(choice => choice.technique === technique))
  const selected = await puzzleHints(stalled, 'all', technique, 1722)
  const scan = watchTechniqueScan(values, end.eliminations, position)
  try {
    assert.equal(selected.available, all.length)
    assert.deepEqual((await puzzleHintPage(variant, 1722, 0)).choices, selected.choices)
    assert.equal(await scan.count(technique), new Set(all.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size)
    const copy = selected.choices[0].evidence
    assert.ok('variant' in copy)
    assert.match(copy.variant.description, /R9C7 is 6/i)
    assert.match(copy.variant.reason, /R9C8 and R9C9 can use only 7/i)
    assert.equal(copy.variant.reasonSteps?.length, 4)
  } finally {
    scan.close()
    await runEngine({ type: 'release-hints', collection: 1722 })
  }
  const progressed = applyDeduction(stalled, short.actions, masks)
  assert.deepEqual(undo(progressed).position, stalled.position)
  assert.deepEqual(redo(undo(progressed)).position, progressed.position)
})

test('three practice positions and a fresh drill replay the selected clue chain', async () => {
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique, seed: 891,
    exclude: examples[0].position.puzzle.givens })
  assert.ok(fresh)
  assert.notEqual(fresh.position.puzzle.givens, examples[0].position.puzzle.givens)
  for (const { position, candidates, deduction, suggestion } of [...examples, fresh]) {
    const { puzzle } = position
    const values = [...puzzle.givens].map((digit, i) => digit === '0' ? position.entries?.[i] ?? '0' : digit).join('')
    assertLinkedClueProof(puzzle, values, candidates, deduction)
    assert.equal(countLineSolutions(puzzle).count, 1)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position, technique,
      action: suggestion }), deduction)
  }
})
