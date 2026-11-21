import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { isSharedPuzzleId, publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { comparisonKey } from './helpers/comparison-key.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertInequalityProof } from './helpers/inequality-truth.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const fixture = JSON.parse(readFileSync(new URL('./fixtures/inequality-generation.json', import.meta.url), 'utf8')) as {
  layouts: { id: string; pairs: number[][] }[]
  example: { puzzle: VariantPuzzle; solution: string }
  exclusionControls: { layout: string; difficulty: 'easy' | 'medium'; seed: number; original: { puzzle: VariantPuzzle; solution: string }; cases: {
    label: string; prior: VariantPuzzle; witness: string; returnedOriginal: boolean
  }[] }[]
}
function gameOf(value: { puzzle: VariantPuzzle; solution: string }, id = 'inequality-generated'): Game {
  const variantId = variantIdForPuzzle(value.puzzle)
  assert.ok(variantId !== 'classic')
  return { ...makeGame(id, 'Inequality', value.puzzle.givens, 'generated'), variant: { id: variantId, puzzle: value.puzzle, solution: value.solution } }
}
function positions(puzzle: VariantPuzzle) {
  return puzzle.rules!.map(rule => {
    assert.equal(rule.type, 'inequality')
    if (rule.type !== 'inequality') throw new Error('Expected a directed comparison')
    return [rule.less, rule.greater].sort((a, b) => a - b)
  })
}
function verify(value: GeneratedVariant, difficulty: 'easy' | 'medium') {
  assert.ok(fixture.layouts.some(layout => JSON.stringify(layout.pairs.map(pair => [...pair].sort((a, b) => a - b))) === JSON.stringify(positions(value.puzzle))))
  assert.deepEqual(value.rating.status, { solved: difficulty }); assert.equal(value.rating.scoringVersion, 13)
  assert.ok(value.rating.counts.inequality); assert.ok(value.givens >= (difficulty === 'medium' ? 18 : 0) && value.givens <= 30)
  const truth = countLineSolutions(value.puzzle)
  assert.equal(truth.count, 1); assert.equal(truth.solution, value.solution)
  assertVariantCompletion(value.puzzle, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('sixty checked Inequality recipes sample distinct completions and retain the eight-point Easy technique', async () => {
  const technique = (await runEngine({ type: 'techniques', variant: true })).techniques.find(item => item.id === 'inequality')!
  assert.equal(technique.cost, 8); assert.equal(technique.difficulty, 'easy'); assert.equal(technique.requiresUniqueSolution, false)
  const completions = new Set<string>(), identities = new Set<string>()
  for (const difficulty of ['easy', 'medium'] as const) {
    const recipes = variantSeeds.inequality[difficulty]!, counts = new Map<string, number>()
    assert.equal(recipes.length, 30)
    for (const recipe of recipes) {
      assert.equal(recipe.layout, undefined); assert.equal(recipe.retryAttempts, 12)
      const layout = fixture.layouts.find(layout => JSON.stringify(layout.pairs) === JSON.stringify(recipe.pairs))!
      assert.ok(layout); counts.set(layout.id, (counts.get(layout.id) ?? 0) + 1)
      const value = await runEngine(variantGenerationRequest('inequality', difficulty, recipe, await getVariantPlayOrder()))
      verify(value, difficulty); completions.add(value.solution); identities.add(comparisonKey(value.puzzle))
      if (difficulty === 'easy' && recipe === recipes[0]) assert.deepEqual({ puzzle: value.puzzle, solution: value.solution }, fixture.example)
    }
    assert.equal(counts.size, 3); assert.ok([...counts.values()].every(count => count === 10))
  }
  assert.equal(completions.size, 60); assert.equal(identities.size, 60)
})

test('sixty actual Inequality puzzles have several hints, distinct played identities and complete independent replay', async () => {
  const history: Game[] = [], seen = new Set<string>()
  for (const difficulty of ['easy', 'medium'] as const) for (let seed = 1; seed <= 30; seed++) {
    const value = await generatePlayableVariant('inequality', difficulty, seed, history); verify(value, difficulty)
    const key = comparisonKey(value.puzzle); assert.ok(!seen.has(key)); seen.add(key)
    const game = gameOf(value, difficulty + seed), hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
    for (const proof of hints.choices) {
      if (proof.technique === 'inequality') {
        assert.ok('variant' in proof.evidence); const source = proof.evidence.variant.source!
        assert.deepEqual(source.puzzle, value.puzzle); assertInequalityProof(value.puzzle, source.deduction)
      }
      for (const action of proof.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(candidate.digit === Number(value.solution[candidate.cell]), 'place' in action)
      }
    }
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: value.puzzle }, techniqueOrder: await getVariantPlayOrder() })
    const { techniqueOrder: traceOrder, ...traceRating } = trace.rating, { techniqueOrder: generationOrder, ...generationRating } = value.rating
    assert.deepEqual(traceRating, generationRating); assert.deepEqual(traceOrder.slice(0, generationOrder.length), generationOrder)
    let played = game
    for (const step of trace.steps) {
      if (step.technique === 'inequality') assertInequalityProof(value.puzzle, step)
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(candidate.digit === Number(value.solution[candidate.cell]), 'place' in action)
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
    }
    assert.ok(isSolved(played)); assert.equal(valuesOf(played), value.solution); history.push(game)
  }
  assert.equal(seen.size, 60)
})

test('all forty-five archived comparison histories exclude the original, including thirty-five former repeats', async () => {
  let cases = 0, formerRepeats = 0
  for (const control of fixture.exclusionControls) {
    const layout = fixture.layouts.find(layout => layout.id === control.layout)!
    const recipe = variantSeeds.inequality[control.difficulty]!.find(recipe => recipe.seed === control.seed && JSON.stringify(recipe.pairs) === JSON.stringify(layout.pairs))!
    assert.ok(recipe)
    const request = variantGenerationRequest('inequality', control.difficulty, recipe, await getVariantPlayOrder()); request.maxNodes = 20_000; request.maxAttempts = 1
    const first = await runEngine(request)
    assert.deepEqual({ puzzle: first.puzzle, solution: first.solution }, control.original)
    for (const prior of control.cases) {
      cases++; formerRepeats += Number(prior.returnedOriginal)
      assertVariantCompletion(prior.prior, prior.witness)
      const truth = countLineSolutions(prior.prior)
      assert.equal(truth.count, 1); assert.equal(truth.solution, prior.witness)
      assert.equal(comparisonKey(prior.prior), comparisonKey(first.puzzle))
      try { assert.notEqual(comparisonKey((await runEngine({ ...request, exclude: [prior.prior] })).puzzle), comparisonKey(first.puzzle)) }
      catch (error) { if (!(error instanceof EngineError && error.code === 'search-limit')) throw error }
    }
  }
  assert.equal(cases, 45); assert.equal(formerRepeats, 35)
})

test('the actual caller excludes complemented and transformed signs and a real equivalent Thermometer import', async () => {
  const value = await generatePlayableVariant('inequality', 'medium', 11, [])
  const complement = (grid: string) => [...grid].map(digit => digit === '0' ? digit : String(10 - Number(digit))).join('')
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(value.puzzle, symmetry)
    puzzle.givens = complement(puzzle.givens)
    puzzle.rules = [...puzzle.rules!].reverse().map(rule => {
      assert.equal(rule.type, 'inequality')
      return rule.type === 'inequality' ? { ...rule, less: rule.greater, greater: rule.less } : rule
    })
    const solution = complement(transformedBoard(value.solution, symmetry))
    assertVariantCompletion(puzzle, solution); assert.equal(comparisonKey(puzzle), comparisonKey(value.puzzle))
    const next = await generatePlayableVariant('inequality', 'medium', 11, [gameOf({ puzzle, solution })])
    assert.notEqual(comparisonKey(next.puzzle), comparisonKey(value.puzzle))
  }
  const equivalent: VariantPuzzle = { ...value.puzzle, rules: value.puzzle.rules!.map(rule => {
    if (rule.type !== 'inequality') throw new Error('Expected a directed comparison')
    return { type: 'thermometer', cells: [rule.less, rule.greater] }
  }) }
  const imported = (await prepareImportedPuzzle('#variant=' + encodeURIComponent(JSON.stringify({ id: 'thermometer', puzzle: equivalent })))).game
  assert.equal(imported.variant!.id, 'thermometer'); assert.deepEqual(imported.variant!.puzzle.rules, equivalent.rules)
  const next = await generatePlayableVariant('inequality', 'medium', 11, [imported])
  assert.notEqual(comparisonKey(next.puzzle), comparisonKey(value.puzzle))
})

test('bounded fresh misses reach checked Easy and Medium fallbacks and reject unavailable levels', async () => {
  for (const [difficulty, seed] of [['easy', 7], ['medium', 17]] as const) {
    const recipes = variantSeeds.inequality[difficulty]!, recipe = recipes[seed % recipes.length], order = await getVariantPlayOrder()
    const fresh = variantGenerationRequest('inequality', difficulty, recipe, order, seed); fresh.maxNodes = 20_000
    await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
    const value = await generatePlayableVariant('inequality', difficulty, seed, [])
    assert.deepEqual(value, await runEngine(variantGenerationRequest('inequality', difficulty, recipe, order)))
    assert.deepEqual(value, await generatePlayableVariant('inequality', difficulty, seed, []))
  }
  await assert.rejects(generatePlayableVariant('inequality', 'hard', 1, []), error => error instanceof EngineError && error.code === 'unsupported')
})

test('generated comparisons, scores, progress, exact solutions and UUID shares survive real storage', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage', 'fetch'] as const, originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  const { sqlite, fetcher } = syncDatabase()
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true }, fetch: { value: fetcher, configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?inequality-generated-save', { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const value = await generatePlayableVariant('inequality', 'easy', 8, []), game = { ...gameOf(value), difficulty: 'easy' as const, score: value.rating.points }
    roomStore.add(game)
    const cell = game.givens.indexOf('0'), solution = value.solution
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(solution[cell])))
    const reload = '../src/sudoku/storage.ts?inequality-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[cell], solution[cell])
    assert.equal(restored.difficulty, 'easy'); assert.equal(restored.score, value.rating.points)
    assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.equal((await puzzleSolution(restored)).board, solution)
    const id = await publishSharedPuzzle(restored); assert.ok(isSharedPuzzleId(id))
    const imported = (await prepareSharedPuzzle(id, [], new AbortController().signal)).game
    assert.equal(imported.sharedPuzzleId, id); assert.deepEqual(imported.variant, game.variant); assert.equal(valuesOf(imported), game.givens)
    assert.equal((await puzzleSolution(imported)).board, solution)
  } finally {
    sqlite.close()
    keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})
