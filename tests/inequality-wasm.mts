import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertInequalityProof } from './helpers/inequality-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const source = JSON.parse(readFileSync(new URL('./fixtures/palindrome-coach.json', import.meta.url), 'utf8')).examples[1]

test('the complete published mixed puzzle imports, offers multiple hints and replays its honest partial solution', async () => {
  const { game } = await prepareImportedPuzzle(source.code)
  assert.equal(game.variant?.solution, source.solution)
  assert.equal(game.variant!.puzzle.rules!.length, 11)
  assertVariantCompletion(game.variant!.puzzle, source.solution)
  const masks = await playCandidates(game)
  assert.ok(masks)
  masks.forEach((mask, cell) => assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)))
  const techniqueOrder = await getVariantPlayOrder(), position = variantPosition(game.variant!)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.equal(trace.rating.status, 'stalled'); assert.equal(trace.rating.points, 98); assert.equal(trace.steps.length, 9)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }), trace.rating)
  let played = game
  for (const [stepIndex, step] of trace.steps.entries()) {
    for (const action of step.actions) {
      const candidate = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
    }
    if (step.technique === 'inequality') assertInequalityProof(game.variant!.puzzle, step)
    assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex }))!.deduction, step)
    played = applyDeduction(played, step.actions, variantHouseMasks(game.variant!.puzzle, valuesOf(played)))
  }
  assert.deepEqual(redo(undo(played)).position, played.position)
  const walkthrough = await puzzleSolution(game)
  assert.equal(walkthrough.rating.status, 'stalled')
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
