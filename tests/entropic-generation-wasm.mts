import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { assertEntropicProof } from './helpers/entropic-truth.ts'
import { entropicEdges, entropicKey } from './helpers/entropic-key.ts'
import { relabelEntropy } from './helpers/entropy-key.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const fixture = JSON.parse(readFileSync(new URL('./fixtures/entropic-generation.json', import.meta.url), 'utf8')) as {
  sources: { id: string; lines: number[][]; completionTemplate: string }[]
}
function gameOf(value: GeneratedVariant, id = 'entropic-generated'): Game {
  return { ...makeGame(id, 'Entropic Lines', value.puzzle.givens, 'generated'), variant: { id: 'entropic', puzzle: value.puzzle, solution: value.solution } }
}
function verify(value: GeneratedVariant) {
  assert.ok(value.puzzle.rules!.every(rule => rule.type === 'entropic'))
  const lines = value.puzzle.rules!.map(rule => rule.type === 'entropic' ? rule.cells : [])
  assert.ok(fixture.sources.some(source => JSON.stringify(source.lines) === JSON.stringify(lines)))
  assert.deepEqual(value.rating.status, { solved: 'medium' }); assert.equal(value.rating.scoringVersion, 19)
  assert.ok(value.rating.counts.entropic); assert.ok(value.givens >= 14 && value.givens <= 20)
  const independent = countLineSolutions(value.puzzle)
  assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
  assertVariantCompletion(value.puzzle, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}
function decompositions(puzzle: VariantPuzzle): VariantRule[][] {
  return [
    [...puzzle.rules!].reverse().map(rule => rule.type === 'entropic' ? { ...rule, cells: [...rule.cells].reverse() } : rule),
    puzzle.rules!.flatMap<VariantRule>(rule => rule.type !== 'entropic' || rule.cells.length < 3 ? [rule] :
      rule.cells.slice(2).map((_, i) => ({ type: 'entropic', cells: rule.cells.slice(i, i + 3) }))),
    entropicEdges(puzzle).map(cells => ({ type: 'entropic', cells })),
  ]
}

test('thirty checked recipes retain complete pure source paths, both density targets and the 27-point Medium technique', async () => {
  const coach = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')).examples
  for (const source of fixture.sources) {
    const original = source.id === 'clover' ? JSON.parse(readFileSync(new URL('./fixtures/entropic-clover.json', import.meta.url), 'utf8')) :
      coach.find((item: { url: string }) => item.url.endsWith(source.id))
    assert.deepEqual(original.puzzle.rules, source.lines.map(cells => ({ type: 'entropic', cells })))
    assert.equal(original.solution, source.completionTemplate)
  }
  const technique = (await runEngine({ type: 'techniques', variant: true })).techniques.find(item => item.id === 'entropic')!
  assert.equal(technique.cost, 27); assert.equal(technique.difficulty, 'medium'); assert.equal(technique.requiresUniqueSolution, false)
  const recipes = variantSeeds.entropic.medium!, seen = new Set<string>(), counts = new Map<string, number>()
  assert.equal(recipes.length, 30)
  for (const recipe of recipes) {
    const source = fixture.sources.find(source => source.completionTemplate === recipe.layout && JSON.stringify(source.lines) === JSON.stringify(recipe.lines))!
    assert.ok(source); assert.ok([17, 20].includes(recipe.maxGivens)); assert.equal(recipe.minGivens, 14); assert.equal(recipe.retryAttempts, 12)
    const label = source.id + recipe.maxGivens; counts.set(label, (counts.get(label) ?? 0) + 1)
    const request = variantGenerationRequest('entropic', 'medium', recipe, await getVariantPlayOrder()); request.maxNodes = 20_000
    const value = await runEngine(request); verify(value); assert.equal(value.givens, recipe.maxGivens); seen.add(entropicKey(value.puzzle))
  }
  assert.equal(seen.size, 30); assert.equal(counts.size, 6); assert.ok([...counts.values()].every(count => count === 5))
})

test('sixty successive actual Medium puzzles are distinct, rule-dependent and have multiple hints with complete independent replay', async () => {
  const previous: Game[] = [], seen = new Set<string>()
  for (let seed = 1; seed <= 60; seed++) {
    const value = await generatePlayableVariant('entropic', 'medium', seed, previous); verify(value)
    assert.equal(variantIdForPuzzle(value.puzzle), 'entropic')
    const key = entropicKey(value.puzzle); assert.ok(!seen.has(key)); seen.add(key)
    const game = gameOf(value, 'entropic-history-' + seed), hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
    for (const hint of hints.choices) for (const action of hint.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
    }
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: value.puzzle }, techniqueOrder: await getVariantPlayOrder(value.puzzle) })
    assert.equal(trace.rating.points, value.rating.points); assert.equal(trace.rating.hardest, value.rating.hardest)
    assert.deepEqual(trace.rating.counts, value.rating.counts); assert.deepEqual(trace.rating.status, value.rating.status)
    let played = game
    for (const step of trace.steps) {
      if (step.technique === 'entropic') assertEntropicProof(value.puzzle, step)
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
    }
    assert.ok(isSolved(played)); assert.equal(valuesOf(played), value.solution); previous.push(game)
  }
  assert.equal(seen.size, 60)
})

test('generation is deterministic, reaches a checked fallback after a fresh miss and rejects unavailable levels', async () => {
  const recipe = variantSeeds.entropic.medium![12]
  const order = await getVariantPlayOrder(variantGenerationRequest('entropic', 'medium', recipe, []).template)
  const fresh = variantGenerationRequest('entropic', 'medium', recipe, order, 42); fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  assert.deepEqual(await generatePlayableVariant('entropic', 'medium', 42, []), await runEngine(variantGenerationRequest('entropic', 'medium', recipe, order)))
  assert.deepEqual(await generatePlayableVariant('entropic', 'medium', 8, []), await generatePlayableVariant('entropic', 'medium', 8, []))
  await assert.rejects(generatePlayableVariant('entropic', 'easy', 1, []), error => error instanceof EngineError && error.code === 'unsupported')
})

test('actual exclusions cover all source geometries, square transforms, valid group renamings and equivalent path descriptions', async () => {
  const identity = Array.from({ length: 10 }, (_, digit) => digit)
  const mappings = [identity, identity.map(d => d === 1 ? 3 : d === 3 ? 1 : d), identity.map(d => d ? 10 - d : 0), identity.map(d => d ? (d + 2) % 9 + 1 : 0)]
  for (const seed of [1, 11, 21]) {
    const value = await generatePlayableVariant('entropic', 'medium', seed, []), original = value.puzzle
    const alternatives: { puzzle: VariantPuzzle; solution: string }[] = []
    for (const mapping of mappings) for (let symmetry = 0; symmetry < 8; symmetry++) {
      const transformed = reflectVariant(original, symmetry)
      alternatives.push({ puzzle: { ...transformed, givens: relabelEntropy(transformed.givens, mapping) }, solution: relabelEntropy(transformedBoard(value.solution, symmetry), mapping) })
    }
    for (const rules of [...decompositions(original), [...original.rules!, ...original.rules!]]) alternatives.push({ puzzle: { ...original, rules }, solution: value.solution })
    for (const { puzzle, solution } of alternatives) {
      assert.equal(entropicKey(puzzle), entropicKey(original)); assertVariantCompletion(puzzle, solution)
      const prior = { ...makeGame('entropic-alias', 'Entropic Lines', puzzle.givens, 'imported'), variant: { id: 'mixed' as const, puzzle, solution } }
      const next = await generatePlayableVariant('entropic', 'medium', seed, [prior]); verify(next)
      assert.notEqual(entropicKey(next.puzzle), entropicKey(original))
    }
  }
})

test('native generation excludes all eighteen archived reversed, decomposed and digit-renamed histories', async () => {
  for (const source of fixture.sources) {
    const recipe = variantSeeds.entropic.medium!.find(recipe => recipe.layout === source.completionTemplate && recipe.maxGivens === 17)!
    const request = variantGenerationRequest('entropic', 'medium', recipe, await getVariantPlayOrder()); request.maxNodes = 20_000
    const value = await runEngine(request), original = value.puzzle, identity = Array.from({ length: 10 }, (_, digit) => digit)
    const alternatives = [
      ...decompositions(original).map(rules => ({ ...original, rules })),
      ...[identity.map(d => d === 1 ? 3 : d === 3 ? 1 : d), identity.map(d => d ? 10 - d : 0), identity.map(d => d ? (d + 2) % 9 + 1 : 0)]
        .map(mapping => ({ ...original, givens: relabelEntropy(original.givens, mapping) })),
    ]
    assert.equal(alternatives.length, 6)
    for (const prior of alternatives) {
      assert.equal(entropicKey(prior), entropicKey(original))
      try { assert.notEqual(entropicKey((await runEngine({ ...request, exclude: [prior] })).puzzle), entropicKey(original)) }
      catch (error) { if (!(error instanceof EngineError && error.code === 'search-limit')) throw error }
    }
  }
})

test('generated Entropic paths, progress, history, solutions and shared definitions survive real storage', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?entropic-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const game = gameOf(await generatePlayableVariant('entropic', 'medium', 8, [])); roomStore.add(game)
    const cell = game.givens.indexOf('0'), solution = game.variant!.solution
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(solution[cell])))
    const reload = '../src/sudoku/storage.ts?entropic-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[cell], solution[cell])
    assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.equal((await puzzleSolution(restored)).board, solution)
    const shared = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'entropic', puzzle: game.variant!.puzzle }))
    assert.deepEqual((await prepareImportedPuzzle(shared)).game.variant, game.variant)
  } finally { keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})
