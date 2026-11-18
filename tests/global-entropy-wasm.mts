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
import { assertGlobalEntropyProof } from './helpers/global-entropy-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/global-entropy-${name}.json`, import.meta.url), 'utf8'))
const published = load('newman') as { puzzle: VariantPuzzle; solution: string }
const sources = load('coach').examples.filter((source: { puzzle?: VariantPuzzle }) => source.puzzle)
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

for (const [id, nativePoints, nativeSteps, appPoints, appSteps, nativeDifficulty, appDifficulty] of [
  ['newman', 856, 79, 1176, 79, 'easy', 'easy'],
  ['A2s7', 1347, 31, 1747, 47, null, null],
  ['CJhv', 1961, 47, 2336, 63, null, null],
  ['AdoP', 688, 31, 1612, 93, null, 'medium'],
] as const) {
  test(`complete Global Entropy source ${id} preserves its unique completion and honest logical path`, async () => {
    const source = id === 'newman' ? published : sources.find((source: { url: string }) => source.url.endsWith(id))
    const { game } = await prepareImportedPuzzle(id === 'newman' ? share(source.puzzle) : source.code)
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    const candidates = await playCandidates(game)
    candidates!.forEach((mask, cell) => {
      if (game.givens[cell] === '0') assert.ok(mask & (1 << (Number(source.solution[cell]) - 1)))
    })
    const position = variantPosition(game.variant!)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, techniqueOrder: [] }), 'unique')
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position, techniqueOrder: [] }), source.solution)
    const disabled = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: [] })
    assert.equal(disabled.rating.points, 0)
    assert.equal(disabled.rating.status, 'stalled')
    assert.deepEqual(disabled.steps, [])
    const orders = [
      [(await runEngine({ type: 'techniques', variant: true })).defaultOrder, nativePoints, nativeSteps, nativeDifficulty],
      [await getVariantPlayOrder(), appPoints, appSteps, appDifficulty],
    ] as const
    for (const [techniqueOrder, points, steps, difficulty] of orders) {
      const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
      assert.equal(trace.rating.points, points)
      assert.equal(trace.steps.length, steps)
      assert.deepEqual(trace.rating.status, difficulty ? { solved: difficulty } : 'stalled')
      assert.deepEqual(trace.rating, await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder }))
      let played = game
      for (const proof of trace.steps) {
        for (const action of proof.actions) {
          const candidate = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
        }
        if (proof.technique === 'global-entropy') assertGlobalEntropyProof(source.puzzle, proof)
        played = applyDeduction(played, proof.actions, variantHouseMasks(source.puzzle, valuesOf(played)))
      }
      assert.equal(isSolved(played), Boolean(difficulty))
      if (difficulty) assert.equal(valuesOf(played), source.solution)
      assert.deepEqual(redo(undo(played)).position, played.position)
      assert.deepEqual((await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex: 0 }))!.deduction, trace.steps[0])
    }
    const hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
    const path = await puzzleSolution(game)
    assert.equal(path.steps.length, appSteps)
    assert.equal(path.board === source.solution, Boolean(appDifficulty))
    if (!appDifficulty) assert.equal(path.rating.status, 'stalled')
  })
}

test('Global Entropy selection, pages and Finder retain independent proof actions', async () => {
  const { game } = await prepareImportedPuzzle(share(published.puzzle))
  const position = variantPosition(game.variant!)
  const proofs = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['global-entropy'], limit: 0xffff_ffff })
  assert.ok(proofs.length > 1)
  proofs.forEach(proof => assertGlobalEntropyProof(published.puzzle, proof))
  const full = await puzzleHints(game, 'all', 'global-entropy')
  const first = await puzzleHints(game, 'all', 'global-entropy', 608)
  const choices = [...first.choices]
  while (choices.length < first.available) choices.push(...(await puzzleHintPage(game.variant, 608, choices.length)).choices)
  assert.deepEqual(choices, full.choices)
  assert.equal(choices.length, proofs.length)
  await assert.rejects(puzzleHintPage(game.variant, 608, choices.length),
    error => error instanceof Error && 'code' in error && error.code === 'invalid-hint-index')
  const scan = watchTechniqueScan(valuesOf(game), undefined, position)
  try {
    assert.equal(await scan.count('global-entropy'), new Set(proofs.flatMap(proof => proof.actions.map(action => JSON.stringify(action)))).size)
  } finally {
    scan.close()
    await runEngine({ type: 'release-hints', collection: 608 })
  }
})

test('three exercises and a fresh drill have sound group proofs, checked answers and a calibrated cost', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(technique => technique.id === 'global-entropy')!
  assert.equal(technique.cost, 24)
  assert.equal(technique.difficulty, 'easy')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'global-entropy' })
  assert.equal(examples.length, 3)
  for (const exercise of examples) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assertGlobalEntropyProof(exercise.position.puzzle, exercise.deduction)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position,
      technique: 'global-entropy', action: exercise.suggestion }), exercise.deduction)
    const candidate = 'place' in exercise.suggestion ? exercise.suggestion.place : exercise.suggestion.eliminate
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position,
      technique: 'global-entropy', action: { eliminate: { cell: candidate.cell, digit: Number(counted.solution![candidate.cell]) } } }), null)
  }
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'global-entropy',
    seed: 608, exclude: examples[0].position.puzzle.givens })
  assert.equal(countLineSolutions(fresh.position.puzzle).count, 1)
  assertGlobalEntropyProof(fresh.position.puzzle, fresh.deduction)
})

test('Global Entropy rule caches distinguish enabled rules, repeat-safe diagonals and disabled logical profiles', async () => {
  const values = Array<string>(81).fill('0')
  for (const [cell, digit] of [[20, 2], [21, 3], [29, 7], [30, 8]]) values[cell] = String(digit)
  const base: VariantPuzzle = { version: 1, givens: values.join('') }
  for (const enabled of [false, true, false, true]) {
    const puzzle: VariantPuzzle = { ...base, ...(enabled && { rules: [{ type: 'global-entropy' }] }) }
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle }, techniqueOrder: [] }), enabled ? 'conflict' : 'multiple')
  }
  for (const [cell, digit] of [[20, 7], [21, 1], [29, 6], [30, 7]]) values[cell] = String(digit)
  const puzzle: VariantPuzzle = { version: 1, givens: values.join(''), rules: [{ type: 'global-entropy' }] }
  assert.notEqual(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle }, maxNodes: 20_000 }), 'conflict')
  const withRule = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: published.puzzle } })
  await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: { ...published.puzzle, rules: [] } } })
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: published.puzzle } }), withRule)
})

test('mixed source storage preserves every clue, player input and undo/redo', async () => {
  const source = sources.find((source: { url: string }) => source.url.endsWith('A2s7'))
  const { game } = await prepareImportedPuzzle(source.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?global-entropy-save'
    const { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(source.solution[0])))
    const reload = '../src/sudoku/storage.ts?global-entropy-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], source.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, source.puzzle)
  } finally {
    keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})

test('generation preserves the global rule, exact givens, first technique, score target and family dependence', async () => {
  for (const seed of [17, 43, 608]) {
    const template: VariantPuzzle = { ...published.puzzle, givens: '0'.repeat(81) }
    const request = { type: 'generate-variant', seed, maxAttempts: 20, maxNodes: 50_000, template, givens: 30, variantClues: 0,
      requiredRule: 'global-entropy', technique: { id: 'global-entropy', mode: 'first' },
      techniqueOrder: ['global-entropy', 'full-house', 'naked-single', 'hidden-single'] } as const
    const result = await runEngine(request)
    assert.equal(result.givens, 30)
    assert.equal(result.variantClues, 0)
    assert.equal(result.puzzle.givens.replaceAll('0', '').length, 30)
    assert.deepEqual(result.puzzle.rules, template.rules)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, result.solution)
    assertVariantCompletion(result.puzzle, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: result.puzzle }, techniqueOrder: request.techniqueOrder })
    assert.equal(trace.steps[0].technique, 'global-entropy')
    assertGlobalEntropyProof(result.puzzle, trace.steps[0])
    assert.deepEqual(trace.rating, result.rating)
    assert.deepEqual((await runEngine({ ...request, score: [result.rating.points, result.rating.points] })).puzzle, result.puzzle)
    await assert.rejects(runEngine({ ...request, maxAttempts: 1, score: [0, 0] }),
      error => error instanceof Error && 'code' in error && error.code === 'invalid-rating-target')
  }
})
