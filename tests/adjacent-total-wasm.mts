import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertAdjacentTotalProof } from './helpers/adjacent-total-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/adjacent-sum-coach.json', import.meta.url), 'utf8'))
const complete = (example: typeof source): VariantPuzzle => ({ ...example.basePuzzle,
  rules: [...example.basePuzzle.rules ?? [], ...example.additionalSums.map(({ cells, total }: { cells: [number, number]; total: number }) => ({ type: 'adjacent-total', cells, sum: total }))] })
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: 'adjacent-total', puzzle }))

test('the unmodified published sum-15 source preserves its complete definition and checked logical actions', async () => {
  const { game } = await prepareImportedPuzzle(source.source.code)
  assert.equal(game.variant!.solution, source.solution)
  assert.deepEqual(game.variant!.puzzle, complete(source))
  const puzzle = game.variant!.puzzle
  assertVariantCompletion(puzzle, source.solution)
  const candidates = await playCandidates(game)
  candidates!.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)) })
  const techniqueOrder = await getVariantPlayOrder()
  const trace = await runEngine({ type: 'variant', operation: 'trace', position: variantPosition(game.variant!), techniqueOrder })
  assert.equal(trace.steps.length, 212); assert.equal(trace.rating.points, 4250)
  assert.deepEqual(trace.rating.status, { solved: 'impossible' })
  assert.equal(trace.rating.counts['adjacent-total'], 1)
  let played = game
  for (const step of trace.steps) {
    for (const action of step.actions) {
      const c = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
    }
    if (step.technique === 'adjacent-total') assertAdjacentTotalProof(puzzle, step)
    played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
  }
  assert.equal(isSolved(played), true); assert.equal(valuesOf(played), source.solution)
  const nativeOrder = (await runEngine({ type: 'techniques', variant: true })).defaultOrder
  const native = await runEngine({ type: 'variant', operation: 'trace', position: variantPosition(game.variant!), techniqueOrder: nativeOrder })
  assert.equal(native.steps.length, 78); assert.equal(native.rating.points, 932); assert.equal(native.rating.status, 'stalled')
  for (const step of native.steps) {
    for (const action of step.actions) {
      const c = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
    }
    if (step.technique === 'adjacent-total') assertAdjacentTotalProof(puzzle, step)
  }
  const path = await puzzleSolution(game)
  assert.equal(path.steps.length, trace.steps.length); assert.equal(path.rating.score!.points, trace.rating.points)
  const hints = await puzzleHints(game, 10)
  assert.ok(hints.choices.length > 1)
  const selected = await runEngine({ type: 'variant', operation: 'hints', position: variantPosition(game.variant!), techniqueOrder: ['adjacent-total'], limit: 0xffff_ffff })
  assert.ok(selected.length > 0); selected.forEach(proof => assertAdjacentTotalProof(puzzle, proof))
  assert.deepEqual(redo(undo(played)).position, played.position)
})

test('the essential authored total controls uniqueness, complete replay and disabled-profile behavior', async () => {
  const puzzle = complete(source.authoredControl), { game } = await prepareImportedPuzzle(share(puzzle))
  assert.equal(game.variant!.solution, source.authoredControl.solution)
  assert.equal(countLineSolutions(puzzle).count, 1)
  assert.equal(countLineSolutions(source.authoredControl.basePuzzle).count, 2)
  const position = variantPosition(game.variant!), techniqueOrder = ['adjacent-total', 'naked-single', 'full-house']
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.equal(trace.steps[0].technique, 'adjacent-total')
  assertAdjacentTotalProof(puzzle, trace.steps[0])
  assert.notEqual(trace.rating.status, 'stalled')
  for (const stepIndex of [0, trace.steps.length - 1]) assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex }))!.deduction, trace.steps[stepIndex])
  const disabled = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
  assert.equal(disabled.rating.status, 'stalled'); assert.equal(disabled.steps.length, 0)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
  assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), source.authoredControl.solution)
  const page = await puzzleHints(game, 'all', 'adjacent-total', 773)
  assert.ok(page.choices.length > 0)
  assert.deepEqual((await puzzleHintPage(game.variant, 773, 0)).choices, page.choices)
  const finder = watchTechniqueScan(valuesOf(game), undefined, position)
  try { assert.equal(await finder.count('adjacent-total'), new Set(page.choices.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size) }
  finally { finder.close() }
  await runEngine({ type: 'release-hints', collection: 773 })
})

test('all pages and Finder retain every action across a dense set of independently checked sums', async () => {
  const solution = source.authoredControl.solution
  const rules: NonNullable<VariantPuzzle['rules']>[number][] = []
  for (let a = 0; a < 81; a++) for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) {
    if (b >= 0) rules.push({ type: 'adjacent-total', cells: [a, b], sum: Number(solution[a]) + Number(solution[b]) })
  }
  const puzzle: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules }
  assert.equal(countLineSolutions(puzzle).count, 1)
  const { game } = await prepareImportedPuzzle(share(puzzle))
  assert.equal(game.variant!.solution, solution)
  const selected = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle }, techniqueOrder: ['adjacent-total'], limit: 0xffff_ffff })
  assert.ok(selected.length > 32)
  selected.forEach(proof => assertAdjacentTotalProof(puzzle, proof))
  const first = await puzzleHints(game, 'all', 'adjacent-total', 774), all = [...first.choices]
  while (all.length < first.available) all.push(...(await puzzleHintPage(game.variant, 774, all.length)).choices)
  assert.equal(all.length, selected.length)
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!))
  try { assert.equal(await scan.count('adjacent-total'), new Set(selected.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close(); await runEngine({ type: 'release-hints', collection: 774 }) }
})

test('three practice examples have independent sums, calibrated costs and checked answers', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(t => t.id === 'adjacent-total')!
  assert.equal(technique.cost, 20); assert.equal(technique.difficulty, 'easy')
  const exercises = await runEngine({ type: 'practice-examples', variant: true, technique: 'adjacent-total' })
  assert.equal(exercises.length, 3)
  for (const exercise of exercises) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assertAdjacentTotalProof(exercise.position.puzzle, exercise.deduction)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'adjacent-total', action: exercise.suggestion }), exercise.deduction)
    const c = 'place' in exercise.suggestion ? exercise.suggestion.place : exercise.suggestion.eliminate
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'adjacent-total', action: { eliminate: { cell: c.cell, digit: Number(counted.solution![c.cell]) } } }), null)
  }
  const generated = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'adjacent-total', seed: 227, exclude: exercises[0].position.puzzle.givens })
  assert.equal(countLineSolutions(generated.position.puzzle).count, 1)
  assertAdjacentTotalProof(generated.position.puzzle, generated.deduction)
})

test('full definitions and player history survive actual storage reload', async () => {
  const { game } = await prepareImportedPuzzle(source.source.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?total-save', { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game); const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(source.solution[cell])))
    const reload = '../src/sudoku/storage.ts?total-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(g => g.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('generic V/X markers stay exempt from negative flags in validation and fog projection', async () => {
  const solution = source.authoredControl.solution
  const pairs: [number, number][] = []
  for (let a = 0; a < 81; a++) for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) if (b >= 0) pairs.push([a, b])
  const marks = pairs.filter(([a, b]) => [5, 10].includes(Number(solution[a]) + Number(solution[b])))
  const puzzle: VariantPuzzle = { version: 1, givens: solution, rules: [
    ...marks.map(cells => ({ type: 'adjacent-total' as const, cells, sum: Number(solution[cells[0]]) + Number(solution[cells[1]]) })),
    { type: 'xv', five: { negative: true }, ten: { negative: true } },
  ] }
  assertVariantCompletion(puzzle, solution)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unique')
  const hidden: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules: [{ type: 'adjacent-total', cells: [0, 1], sum: 5 }, { type: 'xv', five: { negative: true } }] }
  await assert.rejects(runEngine({ type: 'variant', operation: 'hints', position: { puzzle: hidden }, techniqueOrder: ['xv'], visibility: { cells: [], rules: [1], completeXv: true } }), /marker|visible|visibility/i)
})

test('derived total generation keeps clue targets, uniqueness and independent rule dependence', async () => {
  const derivedClues = Array.from({ length: 81 }, (_, a) => a).filter(a => a % 9 < 8).slice(0, 20).map(a => ({ type: 'adjacent-total' as const, cells: [a, a + 1] as const }))
  for (const seed of [17, 43, 227]) {
    const result = await runEngine({ type: 'generate-variant', seed, maxAttempts: 20, maxNodes: 50_000,
      template: { version: 1, givens: '0'.repeat(81) }, derivedClues, givens: 30, variantClues: 20, requiredRule: 'adjacent-total' })
    assert.equal(result.givens, 30); assert.equal(result.variantClues, 20)
    assertVariantCompletion(result.puzzle, result.solution)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1); assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    const { game } = await prepareImportedPuzzle(share(result.puzzle))
    assert.equal(game.variant!.solution, result.solution)
  }
})

test('a zero-given sum puzzle has the requested exclusive opening and rejects a competing rule', async () => {
  const solution = source.authoredControl.solution
  const rules: NonNullable<VariantPuzzle['rules']>[number][] = []
  for (let a = 0; a < 81; a++) for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) {
    if (b >= 0) rules.push({ type: 'adjacent-total', cells: [a, b], sum: Number(solution[a]) + Number(solution[b]) })
  }
  const template: VariantPuzzle = { version: 1, givens: '0'.repeat(81), rules }
  const request = { type: 'generate-variant', seed: 17, maxAttempts: 1, maxNodes: 50_000, template,
    givens: 0, variantClues: 144, requiredRule: 'adjacent-total', technique: { id: 'adjacent-total', mode: 'exclusive-opening' },
    techniqueOrder: ['adjacent-total', 'naked-single', 'full-house'] } as const
  const result = await runEngine(request)
  assert.equal(result.givens, 0); assert.equal(result.variantClues, 144); assert.equal(result.solution, solution)
  assert.equal(countLineSolutions(result.puzzle).count, 1)
  const { techniques } = await runEngine({ type: 'techniques', variant: true })
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position: { puzzle: result.puzzle },
    techniqueOrder: techniques.map(t => t.id).filter(id => id !== 'adjacent-total'), limit: 0xffff_ffff }), [])
  assert.equal(Number(solution[0]) % 2, 1)
  await assert.rejects(runEngine({ ...request, template: { ...template, rules: [...rules, { type: 'parity', cells: [0], parity: 'odd' }] } }), error =>
    error instanceof Error && 'code' in error && error.code === 'search-limit')
})
