import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertRenbanProof } from './helpers/renban-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/renban-${name}.json`, import.meta.url), 'utf8'))
const clover = load('clover') as { puzzle: VariantPuzzle; solution: string }
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

for (const [name, appPoints, nativePoints, steps] of [['clover',1260,940,77],['killer-clover',1184,954,75]] as const) {
  test(`the complete published ${name} path replays every intended action and Renban proof`, async () => {
    const source = load(name), { game } = await prepareImportedPuzzle(share(source.puzzle))
    const puzzle = game.variant!.puzzle
    assert.deepEqual(puzzle, source.puzzle); assert.equal(game.variant!.solution, source.solution)
    const masks = await playCandidates(game)
    masks!.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)) })
    const orders = [['app', await getVariantPlayOrder(), appPoints], ['native', (await runEngine({ type: 'techniques', variant: true })).defaultOrder, nativePoints]] as const
    for (const [, techniqueOrder, points] of orders) {
      const position = variantPosition(game.variant!), trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
      assert.equal(trace.steps.length, steps); assert.equal(trace.rating.points, points)
      assert.deepEqual(trace.rating.status, { solved: 'medium' })
      let played = game
      for (const step of trace.steps) {
        for (const action of step.actions) {
          const c = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
        }
        if (step.technique === 'renban') assertRenbanProof(puzzle, step)
        played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
      }
      assert.equal(isSolved(played), true); assert.equal(valuesOf(played), source.solution)
      assert.deepEqual(redo(undo(played)).position, played.position)
      for (const stepIndex of [0, trace.steps.length - 1]) assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex }))!.deduction, trace.steps[stepIndex])
    }
    const hints = await puzzleHints(game, 10); assert.ok(hints.choices.length > 1)
    assert.equal((await puzzleSolution(game)).board, source.solution)
  })
}

test('original modern Coach sources retain checked complete and partial profiles', async () => {
  const expected = [[15870,122,484,16],[2744,69,308,8],[54,2,54,2]]
  let index = 0
  for (const source of load('coach').examples.filter((source: { deferred?: string }) => !source.deferred)) {
    const { game } = await prepareImportedPuzzle(source.code), puzzle = game.variant!.puzzle
    assert.deepEqual(puzzle, source.puzzle); assert.equal(game.variant!.solution, source.solution)
    assertVariantCompletion(puzzle, source.solution)
    const [appPoints, appSteps, nativePoints, nativeSteps] = expected[index]
    const orders = [[await getVariantPlayOrder(),appPoints,appSteps,index < 2],[(await runEngine({ type: 'techniques', variant: true })).defaultOrder,nativePoints,nativeSteps,false]] as const
    for (const [techniqueOrder, points, steps, complete] of orders) {
      const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder })
      assert.equal(trace.steps.length, steps); assert.equal(trace.rating.points, points)
      if (!complete) assert.equal(trace.rating.status, 'stalled')
      let played = game
      for (const step of trace.steps) {
        for (const action of step.actions) {
          const c = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
        }
        if (step.technique === 'renban') assertRenbanProof(puzzle, step)
        played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
      }
      assert.equal(isSolved(played), complete)
      if (complete) assert.equal(valuesOf(played), source.solution)
    }
    const path = await puzzleSolution(game)
    assert.equal(path.steps.length, appSteps)
    if (index === 2) { assert.equal(path.rating.status, 'stalled'); assert.notEqual(path.board, source.solution) }
    else assert.equal(path.board, source.solution)
    assert.ok((await puzzleHints(game, 10)).choices.length >= 1)
    index++
  }
})

test('pages and Finder preserve every Renban proof and disabled profiles still enforce exact rules', async () => {
  const rules = [...clover.puzzle.rules!]
  for (let a = 0; a < 81 && rules.length < 108; a++) for (let b = 0; b < 81 && rules.length < 108; b++) {
    if (clover.puzzle.givens[a] !== '0' && clover.puzzle.givens[b] === '0' && Math.abs(Number(clover.solution[a]) - Number(clover.solution[b])) === 1) rules.push({ type: 'renban', cells: [a,b] })
  }
  const puzzle = { ...clover.puzzle, rules }, { game } = await prepareImportedPuzzle(share(puzzle))
  assert.equal(game.variant!.solution, clover.solution)
  const position = variantPosition(game.variant!), techniqueOrder = ['renban']
  const selected = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder, limit: 0xffff_ffff })
  assert.ok(selected.length > 32)
  selected.forEach(proof => assertRenbanProof(puzzle, proof))
  const full = await puzzleHints(game, 'all', 'renban')
  const first = await puzzleHints(game, 'all', 'renban', 555), all = [...first.choices]
  while (all.length < first.available) { const page = await puzzleHintPage(game.variant, 555, all.length); assert.ok(page.choices.length); all.push(...page.choices) }
  assert.deepEqual(all, full.choices)
  assert.equal(all.length, selected.length)
  const scan = watchTechniqueScan(valuesOf(game), undefined, position)
  try { assert.equal(await scan.count('renban'), new Set(selected.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close(); await runEngine({ type: 'release-hints', collection: 555 }) }
  const disabled = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
  assert.equal(disabled.steps.length, 0); assert.equal(disabled.rating.status, 'stalled')
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
  assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), clover.solution)
})

test('three practice positions remain unique with forty-point proofs and checked correct/wrong answers', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }), technique = catalog.techniques.find(t => t.id === 'renban')!
  assert.equal(technique.cost, 40); assert.equal(technique.difficulty, 'medium')
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'renban' })
  assert.equal(examples.length, 3)
  for (const exercise of examples) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1); assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assertRenbanProof(exercise.position.puzzle, exercise.deduction)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'renban', action: exercise.suggestion }), exercise.deduction)
    const c = 'place' in exercise.suggestion ? exercise.suggestion.place : exercise.suggestion.eliminate
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'renban', action: { eliminate: { cell: c.cell, digit: Number(counted.solution![c.cell]) } } }), null)
  }
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'renban', seed: 227, exclude: examples[0].position.puzzle.givens })
  assert.equal(countLineSolutions(fresh.position.puzzle).count, 1)
  assertRenbanProof(fresh.position.puzzle, fresh.deduction)
})

test('drawings, full rule lists and actual player history survive normalization and storage reload', async () => {
  const puzzle: VariantPuzzle = { ...clover.puzzle, rules: clover.puzzle.rules!.map((r,i) => i ? r : { ...r, segments: [[18,27],[27,36]] }) }
  const { game } = await prepareImportedPuzzle(share(puzzle))
  const order = await getVariantPlayOrder(), position = variantPosition(game.variant!)
  const drawn = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: order })
  const plain = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: clover.puzzle }, techniqueOrder: order })
  assert.deepEqual(drawn.steps, plain.steps)
  assert.deepEqual({ ...drawn.rating, rules: plain.rating.rules }, plain.rating)
  assert.deepEqual(drawn.start.puzzle.rules, puzzle.rules)
  const keys = ['window','localStorage','sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis,key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?renban-save', { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game); roomStore.update(game.id, saved => enter(saved, [1], 'value', 9))
    const reload = '../src/sudoku/storage.ts?renban-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(g => g.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[1], '9')
    assert.equal(undo(restored).position.entries[1], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
  } finally { keys.forEach((key,i) => { if(prior[i])Object.defineProperty(globalThis,key,prior[i]!);else Reflect.deleteProperty(globalThis,key) }) }
})

test('generation preserves fixed drawings, counts, preferred first technique, exact scores and rule dependence', async () => {
  const template: VariantPuzzle = { ...clover.puzzle, givens: '0'.repeat(81), rules: clover.puzzle.rules!.map((r,i) => i ? r : { ...r, segments: [[18,27],[27,36]] }) }
  for (const seed of [17,43,227]) {
    const request = { type: 'generate-variant', seed, maxAttempts: 20, maxNodes: 50_000, template, givens: 30, variantClues: 12, requiredRule: 'renban',
      technique: { id: 'renban', mode: 'first' }, techniqueOrder: ['renban','full-house','naked-single','hidden-single'] } as const
    const result = await runEngine(request)
    assert.equal(result.givens, 30); assert.equal(result.variantClues, 12); assert.deepEqual(result.puzzle.rules, template.rules)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1); assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: result.puzzle }, techniqueOrder: request.techniqueOrder })
    assert.equal(trace.steps[0].technique, 'renban'); assertRenbanProof(result.puzzle, trace.steps[0])
    assert.deepEqual(trace.rating, result.rating)
    assert.deepEqual((await runEngine({ ...request, score: [result.rating.points, result.rating.points] })).puzzle, result.puzzle)
    await assert.rejects(runEngine({ ...request, maxAttempts: 1, score: [0,0] }), error => error instanceof Error && 'code' in error && error.code === 'invalid-rating-target')
    assert.equal((await prepareImportedPuzzle(share(result.puzzle))).game.variant!.solution, result.solution)
  }
  // A one-cell Renban cannot be essential to uniqueness.
  await assert.rejects(runEngine({ type: 'generate-variant', seed: 17, maxAttempts: 1, maxNodes: 20_000,
    template: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'renban', cells: [40] }] }, givens: 30, requiredRule: 'renban' }), error => error instanceof Error && 'code' in error && error.code === 'search-limit')
})
