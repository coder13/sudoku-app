import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runEngine, type VariantPosition } from '../src/sudoku/engine.ts'
import { applyDeduction, isSolved, makeGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { saveDisabledHintTechniques } from '../src/sudoku/hint-preferences.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { assertExclusionProof, NC_EXCLUSION_TECHNIQUES } from './helpers/exclusion-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-locked.json', import.meta.url), 'utf8')) as {
  position: Required<VariantPosition>; solution: string; expected: { cell: number; digit: number }[]
}
const coach = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-coach.json', import.meta.url), 'utf8')).examples[0] as { code: string }

test('all twelve named practice positions prove their actions and have independently unique givens', async () => {
  for (const technique of NC_EXCLUSION_TECHNIQUES) {
    const examples = await runEngine({ type: 'practice-examples', technique, variant: true })
    assert.equal(examples.length, 3)
    for (const example of examples) {
      const independent = countCellRuleSolutions(example.position.puzzle)
      assert.equal(independent.count, 1)
      assertExclusionProof(example.position, example.deduction)
      for (const action of example.answers) {
        assert.ok('eliminate' in action)
        assert.notEqual(String(action.eliminate.digit), independent.solution![action.eliminate.cell])
        const proof = await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position, technique, action })
        assert.ok(proof)
        assertExclusionProof(example.position, proof)
      }
      assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move',
        position: example.position, technique, action: example.suggestion }), example.deduction)
      assert.ok('eliminate' in example.suggestion)
      const cell = example.suggestion.eliminate.cell
      assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position, technique,
        action: { eliminate: { cell, digit: Number(independent.solution![cell]) } } }), null)
    }
  }
})

test('the archived stall exposes all six researched removals, complete pages and matching Finder counts', async () => {
  const proofs = []
  for (const technique of NC_EXCLUSION_TECHNIQUES) {
    const hints = await runEngine({ type: 'variant', operation: 'hints', position: fixture.position, techniqueOrder: [technique], limit: 0xffff_ffff })
    hints.forEach(proof => assertExclusionProof(fixture.position, proof))
    proofs.push(...hints)
  }
  for (const expected of fixture.expected) assert.ok(proofs.some(proof => proof.actions.some(action =>
    'eliminate' in action && action.eliminate.cell === expected.cell && action.eliminate.digit === expected.digit)))

  for (const [index, technique] of NC_EXCLUSION_TECHNIQUES.entries()) {
    const [example] = await runEngine({ type: 'practice-examples', technique, variant: true })
    const all = await runEngine({ type: 'variant', operation: 'hints', position: example.position, techniqueOrder: [technique], limit: 0xffff_ffff })
    const collection = 1110 + index
    const first = await runEngine({ type: 'variant', operation: 'hints', position: example.position,
      techniqueOrder: [technique], limit: 0xffff_ffff, collection })
    const collected = [...first.choices]
    while (collected.length < first.available) {
      const page = await runEngine({ type: 'hint-page', variant: true, collection, index: collected.length })
      assert.equal(page.offset, collected.length)
      assert.ok(page.choices.length > 0)
      collected.push(...page.choices)
    }
    assert.deepEqual(collected, all)
    if (index === 0) assert.ok(first.available > first.choices.length, 'The two-cell fixture exercises another proof page')
    const values = [...example.position.puzzle.givens].map((digit, cell) => digit === '0' ? example.position.entries[cell] : digit).join('')
    const finder = watchTechniqueScan(values, example.position.eliminations, example.position)
    const actionCount = new Set(all.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size
    try { assert.equal(await finder.count(technique), actionCount) }
    finally { finder.close(); await runEngine({ type: 'release-hints', collection }) }
  }
})

test('Consecudoku now completes without seeding removals and every new step replays through actual Play history', async () => {
  const imported = await prepareImportedPuzzle(coach.code)
  const game = imported.game
  const techniqueOrder = await getVariantPlayOrder()
  const position = variantPosition(game.variant!)
  const normalized = await runEngine({ type: 'variant', operation: 'normalize', position })
  assert.deepEqual(normalized.puzzle, fixture.position.puzzle)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.equal(trace.rating.scoringVersion, 15)
  assert.notEqual(trace.rating.status, 'stalled')
  assert.ok(trace.steps.some(step => NC_EXCLUSION_TECHNIQUES.includes(step.technique as typeof NC_EXCLUSION_TECHNIQUES[number])))
  let played = game
  for (const [index, step] of trace.steps.entries()) {
    const before = played
    if (step.evidence.type === 'exclusion') {
      const replay = await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex: index })
      assert.ok(replay)
      assert.deepEqual(replay.deduction, step)
      assertExclusionProof(replay.before, step)
    }
    for (const action of step.actions) {
      if ('place' in action) assert.equal(String(action.place.digit), fixture.solution[action.place.cell])
      else assert.notEqual(String(action.eliminate.digit), fixture.solution[action.eliminate.cell])
    }
    played = applyDeduction(played, step.actions, variantHouseMasks(game.variant!.puzzle, valuesOf(played)))
    if (step.evidence.type === 'exclusion') assert.deepEqual(undo(played).position, before.position)
  }
  assert.equal(isSolved(played), true)
  assert.equal(valuesOf(played), fixture.solution)
  assertVariantCompletion(game.variant!.puzzle, valuesOf(played))
  const logical = await puzzleSolution(game)
  assert.equal(logical.board, fixture.solution)
  assert.deepEqual(logical.rating.status, trace.rating.status)
  assert.equal(logical.positions?.length, logical.steps.length + 1)
})

test('old explicit profiles retain the archived stall and disabled hints preserve exact rules', async () => {
  const { game } = await prepareImportedPuzzle(coach.code)
  const order = (await getVariantPlayOrder()).filter(id => !NC_EXCLUSION_TECHNIQUES.includes(id as typeof NC_EXCLUSION_TECHNIQUES[number]))
  const retained = await runEngine({ type: 'variant', operation: 'trace', position: variantPosition(game.variant!), techniqueOrder: order })
  assert.equal(retained.rating.status, 'stalled')
  assert.equal(retained.steps.length, 62)
  assert.deepEqual(retained.end, fixture.position)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() })
  try {
    assert.equal(saveDisabledHintTechniques([...NC_EXCLUSION_TECHNIQUES]), true)
    const base = makeGame('nc-archived-stall', 'Consecudoku', fixture.position.puzzle.givens, 'imported')
    const current = { ...base, variant: game.variant, position: { ...base.position,
      entries: fixture.position.entries, eliminations: [...fixture.position.eliminations] } }
    assert.equal((await puzzleHints(current)).choices.length, 0)
    const selected = await puzzleHints(current, 'all', NC_EXCLUSION_TECHNIQUES[0])
    assert.ok(selected.choices.length > 0)
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: fixture.position }), fixture.solution)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('fresh seeded exercises keep their selected technique and independently checked completion', async () => {
  for (const [index, technique] of NC_EXCLUSION_TECHNIQUES.entries()) {
    const [fixed] = await runEngine({ type: 'practice-examples', technique, variant: true })
    const request = { type: 'generate-practice-example', variant: true, technique, seed: 111 + index, exclude: fixed.position.puzzle.givens } as const
    const example = await runEngine(request)
    assert.deepEqual(await runEngine(request), example)
    assert.notEqual(example.position.puzzle.givens, request.exclude)
    assertExclusionProof(example.position, example.deduction)
    assert.equal(countCellRuleSolutions(example.position.puzzle).count, 1)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique, action: example.suggestion }), example.deduction)
  }
})

test('puzzle generation accepts each named first move with an explicit order and exact given count', async () => {
  const { defaultOrder } = await runEngine({ type: 'techniques', variant: true })
  for (const [index, technique] of NC_EXCLUSION_TECHNIQUES.entries()) {
    const [example] = await runEngine({ type: 'practice-examples', technique, variant: true })
    const techniqueOrder = [technique, ...defaultOrder.filter(id => id !== technique)]
    const generated = await runEngine({ type: 'generate-variant', seed: 31 + index, maxAttempts: 30, maxNodes: 50_000,
      template: example.position.puzzle, givens: 30, score: [0, 100_000], technique: { id: technique, mode: 'first' }, techniqueOrder })
    assert.equal(generated.givens, 30)
    assert.equal([...generated.puzzle.givens].filter(digit => digit !== '0').length, 30)
    const independent = countCellRuleSolutions(generated.puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, generated.solution)
    assert.equal(countCellRuleSolutions({ ...generated.puzzle, rules: [] }).count, 2)
    assertVariantCompletion(generated.puzzle, generated.solution)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: generated.puzzle }, techniqueOrder })
    assert.equal(trace.steps[0].technique, technique)
    assertExclusionProof({ puzzle: generated.puzzle }, trace.steps[0])
    assert.deepEqual(trace.rating, generated.rating)
  }
})
