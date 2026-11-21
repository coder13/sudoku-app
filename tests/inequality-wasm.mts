import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
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
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const linked = 'linked-clue-contradiction'
const source = JSON.parse(readFileSync(new URL('./fixtures/palindrome-coach.json', import.meta.url), 'utf8')).examples[1]

test('the complete published mixed puzzle imports, offers multiple hints and replays its honest partial solution', async () => {
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
    techniqueOrder: techniqueOrder.filter(technique => technique !== linked) })
  assert.deepEqual([legacy.rating.status, legacy.rating.points, legacy.steps.length], ['stalled', 98, 9])
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.deepEqual([trace.rating.status, trace.rating.points, trace.steps.length], ['stalled', 275, 12])
  assert.equal(trace.rating.counts[linked], 2)
  const stale = { ...game, variantRatingVersion: 17 }
  assert.ok(puzzleGradeIsStale(stale))
  assert.equal(applyPuzzleGrade(stale, null).variantRatingVersion, 18)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }), trace.rating)
  let played = game
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
    assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex }))!.deduction, step)
    played = applyDeduction(played, step.actions, variantHouseMasks(game.variant!.puzzle, valuesOf(played)))
  }
  assert.deepEqual(redo(undo(played)).position, played.position)
  const walkthrough = await puzzleSolution(game)
  assert.equal(walkthrough.rating.status, 'stalled')
  assert.equal(walkthrough.steps.length, 12)
  assert.equal(walkthrough.positions?.length, 13)
  assert.ok(walkthrough.board.includes('0'))
  assert.deepEqual(walkthrough.exactPosition, {
    givens: position.puzzle.givens, entries: source.solution, eliminations: Array(81).fill(0),
  })
  const badSave = { ...game, variant: { ...game.variant!, solution: '1' + source.solution.slice(1) } }
  assert.equal((await puzzleSolution(badSave)).exactPosition, undefined)
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
    techniqueOrder: profile.filter(technique => technique !== linked) })
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
