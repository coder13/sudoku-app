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
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertXvProof } from './helpers/xv-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const share = (puzzle: VariantPuzzle, id = 'xv') => '#variant=' + encodeURIComponent(JSON.stringify({ id, puzzle }))
const sources = JSON.parse(readFileSync(new URL('./fixtures/xv-coach.json', import.meta.url), 'utf8')).examples as { code: string; solution: string; deferred: string[] }[]

test('published XV puzzles import and replay complete app-order paths to their independently counted solutions', async () => {
  const nativeOrder = (await runEngine({ type: 'techniques', variant: true })).defaultOrder
  const appOrder = await getVariantPlayOrder()
  for (const [name, nativePoints, nativeSteps, appPoints, appSteps] of [
    ['xv-clover', 1076, 55, 4538, 151], ['xv-quadruple-clover', 1540, 123, 1870, 123],
  ] as const) {
    const { puzzle, solution } = load(name)
    const { game } = await prepareImportedPuzzle(share(puzzle, name === 'xv-clover' ? 'xv' : 'mixed'))
    assert.equal(game.variant?.solution, solution)
    const candidates = await playCandidates(game)
    assert.ok(candidates)
    candidates.forEach((mask, cell) => { if (puzzle.givens[cell] === '0') assert.ok(mask & 1 << (Number(solution[cell]) - 1)) })
    for (const [techniqueOrder, points, count] of [[nativeOrder, nativePoints, nativeSteps], [appOrder, appPoints, appSteps]] as const) {
      const position = variantPosition(game.variant!)
      const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
      assert.equal(trace.rating.scoringVersion, 8); assert.equal(trace.rating.points, points); assert.equal(trace.steps.length, count)
      let played = game
      for (const step of trace.steps) {
        for (const action of step.actions) {
          const candidate = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(solution[candidate.cell]) === candidate.digit, 'place' in action)
        }
        if (step.technique === 'xv') assertXvProof(puzzle, step)
        played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
      }
      if (name === 'xv-clover' && techniqueOrder === nativeOrder) {
        assert.equal(trace.rating.status, 'stalled'); assert.equal(isSolved(played), false)
      } else {
        assert.notEqual(trace.rating.status, 'stalled'); assert.equal(isSolved(played), true); assert.equal(valuesOf(played), solution)
      }
      assert.deepEqual(redo(undo(played)).position, played.position)
    }
    const path = await puzzleSolution(game)
    assert.equal(path.board, solution)
    assert.equal(path.steps.length, appSteps)
    const position = variantPosition(game.variant!)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: appOrder })
    for (const stepIndex of [0, trace.steps.findIndex(step => step.technique === 'xv'), trace.steps.length - 1]) {
      assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder: appOrder, stepIndex }))!.deduction, trace.steps[stepIndex])
    }
  }
})

test('all preserved Coach combinations keep every constraint and their complete or partial logical result', async () => {
  const techniqueOrder = await getVariantPlayOrder()
  for (const [index, source] of sources.filter(source => !source.deferred.length).entries()) {
    const { game } = await prepareImportedPuzzle(source.code)
    const puzzle = game.variant!.puzzle
    assert.equal(game.variant!.solution, source.solution)
    assert.equal(puzzle.rules!.length, [2, 6, 3, 12][index])
    assertVariantCompletion(puzzle, source.solution)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: variantPosition(game.variant!), techniqueOrder })
    assert.equal(trace.steps.length, [27, 170, 199, 6][index]); assert.equal(trace.rating.points, [940, 3186, 27358, 160][index])
    let played = game
    for (const step of trace.steps) {
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
      if (step.technique === 'xv') assertXvProof(puzzle, step)
      played = applyDeduction(played, step.actions, variantHouseMasks(puzzle, valuesOf(played)))
    }
    const complete = index === 1 || index === 2
    assert.equal(isSolved(played), complete)
    if (!complete) assert.equal(trace.rating.status, 'stalled')
    else assert.equal(valuesOf(played), source.solution)
    const hints = await puzzleHints(game, 10)
    assert.ok(hints.choices.length > 1)
    for (const hint of hints.choices) for (const action of hint.actions) {
      const candidate = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
    }
  }
})

test('XV hints, pages, Finder counts and disabled profiles retain the same rule-specific proofs', async () => {
  const { puzzle, solution } = load('xv-clover'), { game } = await prepareImportedPuzzle(share(puzzle))
  const selected = await puzzleHints(game, 'all', 'xv')
  assert.ok(selected.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'xv', 1948), all = [...first.choices]
  while (all.length < first.available) all.push(...(await puzzleHintPage(game.variant, 1948, all.length)).choices)
  assert.deepEqual(all, selected.choices)
  const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant!, game.position))
  try { assert.equal(await scan.count('xv'), new Set(selected.choices.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size) }
  finally { scan.close() }
  await runEngine({ type: 'release-hints', collection: 1948 })
  const position = variantPosition(game.variant!)
  const disabled = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
  assert.equal(disabled.steps.length, 0); assert.equal(disabled.rating.status, 'stalled')
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
  assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), solution)
})

test('all three XV exercises retain independent proofs, twenty-point costs and checked practice answers', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(technique => technique.id === 'xv')!
  assert.equal(technique.cost, 20); assert.equal(technique.difficulty, 'easy')
  const examples = await runEngine({ type: 'practice-examples', technique: 'xv', variant: true })
  assert.equal(examples.length, 3)
  for (const example of examples) {
    const counted = countLineSolutions(example.position.puzzle)
    assert.equal(counted.count, 1); assertVariantCompletion(example.position.puzzle, counted.solution!)
    assertXvProof(example.position.puzzle, example.deduction)
    const hint = variantHintChoice(example.deduction, example.position.puzzle)
    assert.ok('variant' in hint.evidence); assert.match(hint.evidence.variant.description, /total of (5|10)/)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique: 'xv', action: example.suggestion }), example.deduction)
    const candidate = 'place' in example.suggestion ? example.suggestion.place : example.suggestion.eliminate
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: example.position,
      technique: 'xv', action: { eliminate: { cell: candidate.cell, digit: Number(counted.solution![candidate.cell]) } } }), null)
  }
  const generated = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'xv', seed: 227, exclude: examples[0].position.puzzle.givens })
  assert.notEqual(generated.position.puzzle.givens, examples[0].position.puzzle.givens)
  assert.equal(countLineSolutions(generated.position.puzzle).count, 1)
  assertXvProof(generated.position.puzzle, generated.deduction)
})

test('full XV definitions and player history survive actual save, reload, undo and redo', async () => {
  const { puzzle, solution } = load('xv-quadruple-clover'), { game } = await prepareImportedPuzzle(share(puzzle, 'mixed'))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const storage = '../src/sudoku/storage.ts?xv-save', { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game); roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(solution[0])))
    const reload = '../src/sudoku/storage.ts?xv-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[0], solution[0])
    assert.equal(undo(restored).position.entries[0], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('shared negative XV flags span layers and remain independent in candidates, play and native validation', async () => {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const edges: [number, number][] = []
  for (let a = 0; a < 81; a++) { if (a % 9 < 8) edges.push([a, a + 1]); if (a < 72) edges.push([a, a + 9]) }
  const five = edges.filter(([a, b]) => Number(solution[a]) + Number(solution[b]) === 5)
  const ten = edges.filter(([a, b]) => Number(solution[a]) + Number(solution[b]) === 10)
  const puzzle: VariantPuzzle = { version: 1, givens: '0' + solution.slice(1), rules: [
    { type: 'xv', five: { pairs: five.slice(1), negative: true }, ten: { pairs: ten, negative: false } },
    { type: 'xv', five: { pairs: [five[0]], negative: false } },
  ] }
  const { game } = await prepareImportedPuzzle(share(puzzle))
  assert.deepEqual(game.variant!.puzzle, puzzle); assert.equal(game.variant!.solution, solution)
  assertVariantCompletion(puzzle, solution)
  const candidates = await playCandidates(game)
  assert.equal(candidates![0], 1 << (Number(solution[0]) - 1))
  assert.equal(isSolved(enter(game, [0], 'value', Number(solution[0]))), true)
  const without = { ...puzzle, rules: puzzle.rules!.slice(0, 1) }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: without } }), 'conflict')
})

test('native XV generation retains exact clue targets and independent rule dependence', async () => {
  for (const seed of [17, 43, 227]) {
    const generated = await runEngine({ type: 'generate-variant', seed, maxAttempts: 20, maxNodes: 50_000,
      template: { version: 1, givens: '0'.repeat(81) }, derivedClues: [{ type: 'markers', family: 'xv', count: 20 }],
      givens: 30, variantClues: 20, requiredRule: 'xv' })
    assert.equal(generated.givens, 30); assert.equal(generated.variantClues, 20)
    assertVariantCompletion(generated.puzzle, generated.solution)
    const counted = countLineSolutions(generated.puzzle)
    assert.equal(counted.count, 1); assert.equal(counted.solution, generated.solution)
    assert.equal(countLineSolutions({ ...generated.puzzle, rules: [] }).count, 2)
    const { game } = await prepareImportedPuzzle(share(generated.puzzle))
    assert.equal(game.variant!.solution, generated.solution)
    assert.equal((await puzzleSolution(game)).board, generated.solution)
  }
})
