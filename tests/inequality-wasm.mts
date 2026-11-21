import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type EngineRunner } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { applyPuzzleGrade, puzzleGradeIsStale } from '../src/sudoku/puzzle-rating.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertLinkedClueProof } from './helpers/group-order-truth.ts'
import { assertInequalityProof } from './helpers/inequality-truth.ts'
import { assertMatchingDigitProof } from './helpers/matching-digit-truth.ts'
import { assertMatchingLayoutProof } from './helpers/matching-layout-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const linked = 'linked-clue-contradiction'
const matching = 'matching-digit-contradiction'
const layouts = 'matching-layout-forcing'
const source = JSON.parse(readFileSync(new URL('./fixtures/palindrome-coach.json', import.meta.url), 'utf8')).examples[1]

test('the complete published mixed puzzle imports, offers multiple hints and replays its complete logical solution', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  assert.equal(game.variant?.solution, source.solution)
  assert.equal(game.variant!.puzzle.rules!.length, 11)
  assertVariantCompletion(game.variant!.puzzle, source.solution)
  const masks = await playCandidates(game)
  assert.ok(masks)
  masks.forEach((mask, cell) => assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)))
  const position = variantPosition(game.variant!)
  const techniqueOrder = await getVariantPlayOrder(position.puzzle)
  const legacy = await runEngine({ type: 'variant', operation: 'trace', position,
    techniqueOrder: techniqueOrder.filter(technique => technique !== linked && technique !== matching && technique !== layouts) })
  assert.deepEqual([legacy.rating.status, legacy.rating.points, legacy.steps.length], ['stalled', 98, 9])
  const withoutLayouts = techniqueOrder.filter(technique => technique !== layouts)
  const prior = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: withoutLayouts })
  assert.deepEqual([prior.rating.status, prior.rating.points, prior.steps.length], ['stalled', 2833, 48])
  assert.equal(prior.rating.counts[linked], 2)
  assert.equal(prior.rating.counts[matching], 31)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.deepEqual([trace.rating.status, trace.rating.points, trace.steps.length], [{ solved: 'extreme' }, 30602, 386])
  assert.equal(trace.rating.counts[layouts], 63)
  assert.deepEqual(trace.steps.slice(0, prior.steps.length), prior.steps)
  const stale = { ...game, variantRatingVersion: 19 }
  assert.ok(puzzleGradeIsStale(stale))
  assert.equal(applyPuzzleGrade(stale, null).variantRatingVersion, 21)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }), trace.rating)
  let played = game
  const snapshot = () => ({
    puzzle: trace.start.puzzle,
    entries: played.position.entries,
    eliminations: played.position.eliminations ?? trace.start.eliminations,
  })
  for (const [stepIndex, step] of trace.steps.entries()) {
    for (const action of step.actions) {
      const candidate = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
    }
    if (step.technique === 'inequality') assertInequalityProof(game.variant!.puzzle, step)
    if (step.technique === linked) {
      assertLinkedClueProof(position.puzzle, valuesOf(played),
        variantHouseMasks(position.puzzle, valuesOf(played), played.position.eliminations), step)
    }
    if (step.technique === matching) {
      assertMatchingDigitProof(position.puzzle, valuesOf(played),
        variantHouseMasks(position.puzzle, valuesOf(played), played.position.eliminations), step)
    }
    if (step.technique === layouts) {
      assertMatchingLayoutProof(position.puzzle, valuesOf(played),
        variantHouseMasks(position.puzzle, valuesOf(played), played.position.eliminations), step)
    }
    const replay = stepIndex < prior.steps.length || step.technique === layouts || stepIndex === trace.steps.length - 1
      ? await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex }) : undefined
    if (replay !== undefined) {
      assert.ok(replay)
      assert.deepEqual(replay.deduction, step)
      assert.deepEqual(replay.before, snapshot())
    }
    played = applyDeduction(played, step.actions, variantHouseMasks(game.variant!.puzzle, valuesOf(played)))
    if (replay) assert.deepEqual(replay.after, snapshot())
  }
  assert.equal(await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder,
    stepIndex: trace.steps.length }), null)
  assert.deepEqual(redo(undo(played)).position, played.position)
  const walkthrough = await puzzleSolution(game)
  assert.deepEqual(walkthrough.rating.status, { solved: 'extreme' })
  assert.equal(walkthrough.steps.length, trace.steps.length)
  assert.equal(walkthrough.positions?.length, trace.steps.length + 1)
  assert.equal(walkthrough.board, source.solution)
  assert.equal(walkthrough.exactPosition, undefined)
  const oldProfile: EngineRunner = request => runEngine(
    request.type === 'variant' && request.operation === 'trace' ? { ...request, techniqueOrder: withoutLayouts } : request)
  const partial = await puzzleSolution(game, oldProfile)
  assert.equal(partial.rating.status, 'stalled')
  assert.equal(partial.steps.length, 48)
  assert.ok(partial.board.includes('0'))
  assert.deepEqual(partial.exactPosition, {
    givens: position.puzzle.givens, entries: source.solution, eliminations: Array(81).fill(0),
  })
  const badSave = { ...game, variant: { ...game.variant!, solution: '1' + source.solution.slice(1) } }
  assert.equal((await puzzleSolution(badSave, oldProfile)).exactPosition, undefined)
  const selected = await puzzleHints(game, 'all', 'inequality')
  assert.ok(selected.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'inequality', 1947), all = [...first.choices]
  while (all.length < first.available) all.push(...(await puzzleHintPage(game.variant, 1947, all.length)).choices)
  assert.deepEqual(all, selected.choices)
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try { assert.equal(await scan.count('inequality'), new Set(selected.choices.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close() }
  await runEngine({ type: 'release-hints', collection: 1947 })
})

test('ranked hints and Finder offer short local proofs and a mirrored alternative at the old stall', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  const variant = game.variant!
  const { puzzle } = variant
  const profile = await getVariantPlayOrder(puzzle)
  const { end } = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle },
    techniqueOrder: profile.filter(technique => technique !== linked && technique !== matching && technique !== layouts) })
  const stalled = { ...game, position: { ...game.position, ...end } }
  const values = valuesOf(stalled)
  const masks = variantHouseMasks(puzzle, values, stalled.position.eliminations)
  const position = variantPosition(variant, stalled.position)
  const all = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [linked], limit: 100 })
  for (const proof of all) assertLinkedClueProof(puzzle, values, masks, proof)
  assert.deepEqual(all.slice(0, 2).map(proof => proof.actions),
    [[{ eliminate: { cell: 25, digit: 2 } }], [{ eliminate: { cell: 43, digit: 9 } }]])
  const mirrored = all.find(proof => proof.actions.some(action => 'eliminate' in action && action.eliminate.cell === 15))
  assert.ok(mirrored)
  assert.equal(mirrored.evidence.type, 'linked-clue')
  assert.ok(mirrored.evidence.checks.some(check => check.scope.type === 'pair'
    && check.scope.rules.some(index => puzzle.rules![index].type === 'palindrome')))
  const words = variantHintChoice(mirrored, puzzle).evidence
  assert.ok('variant' in words)
  assert.match(words.variant.reason, /must match under the Palindrome rule/)
  const ranked = await puzzleHints(stalled)
  assert.ok(ranked.choices.filter(choice => choice.technique === linked).length >= 2)
  const first = await puzzleHints(stalled, 'all', linked, 1948)
  const finder = watchTechniqueScan(values, end.eliminations, position)
  try {
    assert.equal(first.available, all.length)
    assert.equal(await finder.count(linked), all.length)
    assert.deepEqual((await puzzleHintPage(variant, 1948, 0)).choices, first.choices)
  } finally {
    finder.close()
    await runEngine({ type: 'release-hints', collection: 1948 })
  }
})

test('matching cells give multiple checked hints and matching Finder counts at the twelve-step stall', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  const variant = game.variant!
  const { puzzle } = variant
  const profile = await getVariantPlayOrder(puzzle)
  const { end, steps } = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle },
    techniqueOrder: profile.filter(technique => technique !== matching && technique !== layouts) })
  assert.equal(steps.length, 12)
  const stalled = { ...game, position: { ...game.position, ...end } }
  const values = valuesOf(stalled)
  const masks = variantHouseMasks(puzzle, values, stalled.position.eliminations)
  const position = variantPosition(variant, stalled.position)
  const all = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [matching], limit: 100 })
  assert.equal(all.length, 15)
  for (const proof of all) assertMatchingDigitProof(puzzle, values, masks, proof)
  const sample = all.find(proof => proof.evidence.type === 'matching-digit'
    && proof.evidence.assumed.includes(23) && proof.evidence.digit === 1)!
  assert.equal(sample.evidence.type, 'matching-digit')
  assert.deepEqual(sample.evidence.conflict.house, { column: 4 })
  assert.deepEqual(sample.actions, [{ eliminate: { cell: 23, digit: 1 } }, { eliminate: { cell: 60, digit: 1 } }])
  const copy = variantHintChoice(sample, puzzle).evidence
  assert.ok('variant' in copy)
  assert.match(copy.variant.reason, /column 5, no cell can use 1/i)
  const ranked = await puzzleHints(stalled)
  assert.ok(ranked.choices.filter(choice => choice.technique === matching).length >= 2)
  const first = await puzzleHints(stalled, 'all', matching, 1949)
  const finder = watchTechniqueScan(values, end.eliminations, position)
  try {
    assert.equal(first.available, all.length)
    const moves = new Set(all.flatMap(proof => proof.actions.map(action => JSON.stringify(action))))
    assert.equal(await finder.count(matching), moves.size)
    assert.deepEqual((await puzzleHintPage(variant, 1949, 0)).choices, first.choices)
  } finally {
    finder.close()
    await runEngine({ type: 'release-hints', collection: 1949 })
  }
})

test('the new stall has multiple independently checked layout hints and matching Finder counts', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  const variant = game.variant!
  const { puzzle } = variant
  const order = await getVariantPlayOrder(puzzle)
  const { end } = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle },
    techniqueOrder: order.filter(technique => technique !== layouts) })
  const stalled = { ...game, position: { ...game.position, ...end } }
  const position = variantPosition(variant, stalled.position)
  const values = valuesOf(stalled)
  const masks = variantHouseMasks(puzzle, values, end.eliminations)
  const allowed = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [layouts], limit: 150 })
  for (const proof of allowed) assertMatchingLayoutProof(puzzle, values, masks, proof)
  const sample = allowed.find(proof => proof.evidence.type === 'matching-layout'
    && proof.evidence.cases.some(example => example.checks.length > 0))
  assert.ok(sample)
  const view = variantHintChoice(sample, puzzle).evidence
  assert.ok('variant' in view)
  assert.ok(view.variant.trace!.some(example => example.steps.length > 0))
  assert.ok((await puzzleHints(stalled)).choices.filter(choice => choice.technique === layouts).length > 1)
  const first = await puzzleHints(stalled, 'all', layouts, 1950)
  const finder = watchTechniqueScan(values, end.eliminations, position)
  try {
    assert.equal(first.available, allowed.length)
    assert.deepEqual((await puzzleHintPage(variant, 1950, 0)).choices, first.choices)
    const moves = new Set(allowed.flatMap(proof => proof.actions.map(action => JSON.stringify(action))))
    assert.equal(await finder.count(layouts), moves.size)
  } finally {
    finder.close()
    await runEngine({ type: 'release-hints', collection: 1950 })
  }
})

test('layout practice checks three distinct positions and a fresh drill using the same proofs', async () => {
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: layouts })
  assert.equal(examples.length, 3)
  assert.equal(new Set(examples.map(example => example.position.puzzle.givens)).size, 3)
  assert.ok(examples.some(example => example.position.puzzle.rules?.some(rule => rule.type === 'clone')))
  assert.ok(examples.some(example => example.position.puzzle.rules?.some(rule => rule.type === 'palindrome')))
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: layouts, seed: 181,
    exclude: examples[0].position.puzzle.givens })
  assert.ok(fresh)
  assert.notEqual(fresh.position.puzzle.givens, examples[0].position.puzzle.givens)
  for (const { position, candidates, deduction, suggestion } of [...examples, fresh]) {
    const { puzzle } = position
    assertMatchingLayoutProof(puzzle, puzzle.givens, candidates, deduction)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position,
      technique: layouts, action: suggestion }), deduction)
  }
})

test('all three inequality exercises retain independent proofs, costs and checked practice answers', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  assert.equal(catalog.techniques.find(technique => technique.id === 'inequality')!.cost, 8)
  const examples = await runEngine({ type: 'practice-examples', technique: 'inequality', variant: true })
  assert.equal(examples.length, 3)
  for (const example of examples) {
    const counted = countLineSolutions(example.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(example.position.puzzle, counted.solution!)
    assertInequalityProof(example.position.puzzle, example.deduction)
    const hint = variantHintChoice(example.deduction, example.position.puzzle)
    assert.ok('variant' in hint.evidence)
    assert.match(hint.evidence.variant.description, /smaller than/)
    const checked = await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique: 'inequality', action: example.suggestion })
    assert.deepEqual(checked, example.deduction)
  }
})

test('the imported mixed definition and progressed history survive save, reload and shared data', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const storage = '../src/sudoku/storage.ts?inequality-save', { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game); roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(source.solution[0])))
    const reload = '../src/sudoku/storage.ts?inequality-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[0], source.solution[0])
    assert.equal(undo(restored).position.entries[0], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})
