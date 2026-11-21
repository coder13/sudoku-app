import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { assertGlobalEntropyProof } from './helpers/global-entropy-truth.ts'
import { entropyKey, relabelEntropy } from './helpers/entropy-key.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const source = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-newman.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
function gameOf(result: GeneratedVariant, id = 'global-entropy-generated'): Game {
  return { ...makeGame(id, 'Global Entropy', result.puzzle.givens, 'generated'),
    variant: { id: 'global-entropy', puzzle: result.puzzle, solution: result.solution } }
}
function verify(value: GeneratedVariant, difficulty: 'easy' | 'medium') {
  assert.deepEqual(value.puzzle.rules, [{ type: 'global-entropy' }])
  assert.deepEqual(value.rating.status, { solved: difficulty }); assert.equal(value.rating.scoringVersion, 12)
  assert.ok(value.rating.counts['global-entropy'])
  assert.ok(value.givens >= (difficulty === 'medium' ? 14 : 0) && value.givens <= (difficulty === 'medium' ? 24 : 30))
  const independent = countLineSolutions(value.puzzle)
  assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
  assertVariantCompletion(value.puzzle, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('all sixty checked recipes preserve the complete global rule, independent dependence and 24-point Easy technique', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }), technique = catalog.techniques.find(item => item.id === 'global-entropy')!
  assert.equal(technique.cost, 24); assert.equal(technique.difficulty, 'easy'); assert.equal(technique.requiresUniqueSolution, false)
  for (const difficulty of ['easy', 'medium'] as const) {
    const recipes = variantSeeds['global-entropy'][difficulty]!
    assert.equal(recipes.length, 30)
    const distinct = new Set<string>()
    for (const recipe of recipes) {
      const request = variantGenerationRequest('global-entropy', difficulty, recipe, await getVariantPlayOrder()); request.maxNodes = 20_000
      const value = await runEngine(request); verify(value, difficulty); distinct.add(entropyKey(value.puzzle))
    }
    assert.equal(distinct.size, 30)
  }
})
for (const difficulty of ['easy', 'medium'] as const) test(`actual ${difficulty} Global Entropy New Puzzle gives thirty distinct dependent puzzles with several hints and complete independent replay`, async () => {
  const previous: Game[] = [], seen = new Set<string>()
  for (let seed = 1; seed <= 30; seed++) {
    const value = await generatePlayableVariant('global-entropy', difficulty, seed, previous)
    verify(value, difficulty); assert.equal(variantIdForPuzzle(value.puzzle), 'global-entropy')
    const key = entropyKey(value.puzzle); assert.ok(!seen.has(key)); seen.add(key)
    const game = gameOf(value, difficulty + seed), hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
    for (const hint of hints.choices) for (const action of hint.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
    }
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: value.puzzle }, techniqueOrder: await getVariantPlayOrder() })
    assert.equal(trace.rating.points, value.rating.points); assert.equal(trace.rating.hardest, value.rating.hardest)
    assert.deepEqual(trace.rating.counts, value.rating.counts); assert.deepEqual(trace.rating.status, value.rating.status)
    let played = game
    for (const step of trace.steps) {
      if (step.technique === 'global-entropy') assertGlobalEntropyProof(value.puzzle, step)
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
    }
    assert.ok(isSolved(played)); assert.equal(valuesOf(played), value.solution); previous.push(game)
  }
  assert.equal(seen.size, 30)
})

test('both levels are deterministic and reach checked fallbacks after known fresh misses', async () => {
  const order = await getVariantPlayOrder()
  for (const [difficulty, seed] of [['easy', 10], ['medium', 1]] as const) {
    const recipe = variantSeeds['global-entropy'][difficulty]![seed]
    const fresh = variantGenerationRequest('global-entropy', difficulty, recipe, order, seed); fresh.maxNodes = 20_000
    await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
    assert.deepEqual(await generatePlayableVariant('global-entropy', difficulty, seed, []), await runEngine(variantGenerationRequest('global-entropy', difficulty, recipe, order)))
    assert.deepEqual(await generatePlayableVariant('global-entropy', difficulty, 8, []), await generatePlayableVariant('global-entropy', difficulty, 8, []))
  }
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-generation.json', import.meta.url), 'utf8')) as { completionTemplate: string }
  assert.equal(fixture.completionTemplate, source.solution)
  assert.equal(source.puzzle.givens.replaceAll('0', '').length, 20)
})

test('actual played-history exclusions retain every square transform, valid group relabeling and duplicate rules through mixed aliases', async () => {
  const identity = Array.from({ length: 10 }, (_, digit) => digit)
  const mappings = [identity, identity.map(d => d === 1 ? 3 : d === 3 ? 1 : d), identity.map(d => d ? 10 - d : 0), identity.map(d => d ? (d + 2) % 9 + 1 : 0)]
  for (const difficulty of ['easy', 'medium'] as const) {
    const value = await generatePlayableVariant('global-entropy', difficulty, 4, []), original = value.puzzle
    for (const mapping of mappings) for (let symmetry = 0; symmetry < 8; symmetry++) {
      const transformed = reflectVariant(original, symmetry), puzzle = { ...transformed, givens: relabelEntropy(transformed.givens, mapping) }
      const solution = relabelEntropy(transformedBoard(value.solution, symmetry), mapping)
      assert.equal(entropyKey(puzzle), entropyKey(original)); assertVariantCompletion(puzzle, solution)
      const prior = { ...makeGame('entropy-alias', 'Global Entropy', puzzle.givens, 'imported'), variant: { id: 'mixed' as const, puzzle, solution } }
      const next = await generatePlayableVariant('global-entropy', difficulty, 4, [prior])
      verify(next, difficulty); assert.notEqual(entropyKey(next.puzzle), entropyKey(original))
    }
    const puzzle = { ...original, rules: [...original.rules!, ...original.rules!] }
    const prior = { ...makeGame('entropy-duplicate', 'Global Entropy', puzzle.givens, 'imported'), variant: { id: 'mixed' as const, puzzle, solution: value.solution } }
    const next = await generatePlayableVariant('global-entropy', difficulty, 4, [prior])
    verify(next, difficulty); assert.notEqual(entropyKey(next.puzzle), entropyKey(original))
  }
})

test('native generation excludes all four archived duplicate-rule and group-renaming counterexamples', async () => {
  const request = { type: 'generate-variant' as const, seed: 1, maxAttempts: 1, maxNodes: 20_000,
    template: { version: 1 as const, givens: '0'.repeat(81), rules: [{ type: 'global-entropy' as const }] },
    givens: [0, 30] as [number, number], requiredRule: 'global-entropy', difficulty: 'easy' as const, techniqueOrder: await getVariantPlayOrder() }
  const first = await runEngine(request), identity = Array.from({ length: 10 }, (_, digit) => digit)
  const alternatives = [
    { ...first.puzzle, rules: [...first.puzzle.rules!, ...first.puzzle.rules!] },
    ...[identity.map(d => d === 1 ? 3 : d === 3 ? 1 : d), identity.map(d => d ? 10 - d : 0), identity.map(d => d ? (d + 2) % 9 + 1 : 0)]
      .map(mapping => ({ ...first.puzzle, givens: relabelEntropy(first.puzzle.givens, mapping) })),
  ]
  for (const alternative of alternatives) {
    assert.equal(entropyKey(alternative), entropyKey(first.puzzle))
    try {
      const next = await runEngine({ ...request, exclude: [alternative] })
      assert.notEqual(entropyKey(next.puzzle), entropyKey(first.puzzle))
    } catch (error) { if (!(error instanceof EngineError && error.code === 'search-limit')) throw error }
  }
})

test('generated Global Entropy puzzles retain their rule, progress, history, solutions and shared definitions through real storage', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?global-entropy-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const game = gameOf(await generatePlayableVariant('global-entropy', 'medium', 10, []))
    roomStore.add(game)
    const cell = game.givens.indexOf('0'), solution = game.variant!.solution
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(solution[cell])))
    const reload = '../src/sudoku/storage.ts?global-entropy-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[cell], solution[cell])
    assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.equal((await puzzleSolution(restored)).board, solution)
    const shared = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'global-entropy', puzzle: game.variant!.puzzle }))
    assert.deepEqual((await prepareImportedPuzzle(shared)).game.variant, game.variant)
  } finally { keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('an exhausted Medium history recovers with the bounded fresh budget and retains every exclusion and rating target', async () => {
  const previous: Game[] = [], played = new Set<string>()
  for (let seed = 1; seed <= 62; seed++) {
    const value = await generatePlayableVariant('global-entropy', 'medium', seed, previous)
    const key = entropyKey(value.puzzle); assert.ok(!played.has(key)); played.add(key)
    previous.push(gameOf(value, 'entropy-long-history-' + seed))
  }
  const seed = 63, recipes = variantSeeds['global-entropy'].medium!, order = await getVariantPlayOrder()
  const exclude = previous.map(game => game.variant!.puzzle)
  const fresh = variantGenerationRequest('global-entropy', 'medium', recipes[seed % recipes.length], order, seed)
  fresh.maxNodes = 20_000; fresh.exclude = exclude
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  for (const recipe of recipes) {
    const request = variantGenerationRequest('global-entropy', 'medium', recipe, order); request.exclude = exclude
    await assert.rejects(runEngine(request), error => error instanceof EngineError && error.code === 'search-limit')
  }
  assert.equal(recipes[seed % recipes.length].retryAttempts, 12)
  const expected = await runEngine({ ...fresh, maxAttempts: 12 })
  const value = await generatePlayableVariant('global-entropy', 'medium', seed, previous)
  assert.deepEqual(value, expected); verify(value, 'medium'); assert.ok(!played.has(entropyKey(value.puzzle)))
  const game = gameOf(value, 'entropy-recovered')
  assert.ok((await puzzleHints(game)).choices.length > 1)
  assert.equal((await puzzleSolution(game)).board, value.solution)
})
