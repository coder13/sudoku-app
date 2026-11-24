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
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { assertRenbanProof } from './helpers/renban-truth.ts'
import { renbanKey } from './helpers/renban-key.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { syncDatabase } from './helpers/sync-database.ts'
useWasmWorker()
const fixture = JSON.parse(readFileSync(new URL('./fixtures/renban-generation.json', import.meta.url), 'utf8')) as {
  sources: { id: string; lines: number[][]; completionTemplate: string }[]
  example: { puzzle: VariantPuzzle; solution: string }
  exclusionControls: { source: string; seed: number; original: { puzzle: VariantPuzzle; solution: string }; cases: {
    label: string; prior: VariantPuzzle; witness: string; returnedOriginal: boolean
  }[] }[]
}
function gameOf(value: { puzzle: VariantPuzzle; solution: string }, id = 'renban-generated'): Game {
  const variantId = variantIdForPuzzle(value.puzzle)
  assert.ok(variantId !== 'classic')
  return { ...makeGame(id, 'Renban', value.puzzle.givens, 'generated'), variant: { id: variantId, puzzle: value.puzzle, solution: value.solution } }
}
function verify(value: GeneratedVariant) {
  assert.ok(value.puzzle.rules!.every(rule => rule.type === 'renban'))
  const lines = value.puzzle.rules!.flatMap(rule => rule.type === 'renban' ? [rule.cells] : [])
  assert.ok(fixture.sources.some(source => JSON.stringify(source.lines) === JSON.stringify(lines)))
  assert.deepEqual(value.rating.status, { solved: 'medium' }); assert.equal(value.rating.scoringVersion, 24)
  assert.ok(value.rating.counts.renban); assert.ok(value.givens >= 14 && value.givens <= 20)
  const truth = countLineSolutions(value.puzzle)
  assert.equal(truth.count, 1); assert.equal(truth.solution, value.solution)
  assertVariantCompletion(value.puzzle, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('thirty checked Renban recipes retain complete source sets, both density targets and the 40-point Medium technique', async () => {
  const technique = (await runEngine({ type: 'techniques', variant: true })).techniques.find(item => item.id === 'renban')!
  assert.equal(technique.cost, 40); assert.equal(technique.difficulty, 'medium'); assert.equal(technique.requiresUniqueSolution, false)
  const recipes = variantSeeds.renban.medium!, seen = new Set<string>(), counts = new Map<string, number>()
  assert.equal(recipes.length, 30)
  const legacyOrder = await getVariantPlayOrder()
  const currentOrder = await getVariantPlayOrder(fixture.example.puzzle)
  let affected = 0
  for (const recipe of recipes) {
    const source = fixture.sources.find(source => source.completionTemplate === recipe.layout && JSON.stringify(source.lines) === JSON.stringify(recipe.lines))!
    assert.ok(source); assert.ok([17, 20].includes(recipe.maxGivens)); assert.equal(recipe.minGivens, 14); assert.equal(recipe.retryAttempts, 12)
    const label = source.id + recipe.maxGivens; counts.set(label, (counts.get(label) ?? 0) + 1)
    const original = await runEngine(variantGenerationRequest('renban', 'medium', recipe, legacyOrder))
    const value = await runEngine(variantGenerationRequest('renban', 'medium', recipe, currentOrder))
    assert.deepEqual(value.puzzle, original.puzzle)
    assert.equal(value.solution, original.solution)
    if (value.rating.points !== original.rating.points) affected++
    verify(value); assert.equal(value.givens, recipe.maxGivens); seen.add(renbanKey(value.puzzle))
    if (recipe === recipes[0]) assert.deepEqual({ puzzle: value.puzzle, solution: value.solution }, fixture.example)
  }
  assert.equal(affected, 5)
  assert.equal(seen.size, 30); assert.equal(counts.size, 6); assert.ok([...counts.values()].every(count => count === 5))
})

test('sixty successive actual Renban puzzles are distinct and have several hints with complete independent replay', async () => {
  const history: Game[] = [], seen = new Set<string>()
  for (let seed = 1; seed <= 60; seed++) {
    const value = await generatePlayableVariant('renban', 'medium', seed, history); verify(value)
    const key = renbanKey(value.puzzle); assert.ok(!seen.has(key)); seen.add(key)
    const game = gameOf(value, 'renban-history-' + seed), hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
    for (const proof of hints.choices) for (const action of proof.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
    }
    const order = await getVariantPlayOrder(value.puzzle)
    assert.ok(order.includes('renban-locked-digit'))
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: value.puzzle }, techniqueOrder: order })
    assert.equal(trace.rating.points, value.rating.points); assert.equal(trace.rating.hardest, value.rating.hardest)
    assert.deepEqual(trace.rating.counts, value.rating.counts); assert.deepEqual(trace.rating.status, value.rating.status)
    let played = game
    for (const step of trace.steps) {
      if (step.technique === 'renban') assertRenbanProof(value.puzzle, step)
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
    }
    assert.ok(isSolved(played)); assert.equal(valuesOf(played), value.solution); history.push(game)
  }
  assert.equal(seen.size, 60)
})

test('all thirty archived Renban history controls exclude the original, including seventeen former failures', async () => {
  let cases = 0, failures = 0
  for (const control of fixture.exclusionControls) {
    const source = fixture.sources.find(source => source.id === control.source)!
    const request = { type: 'generate-variant', seed: control.seed, maxAttempts: 1, maxNodes: 20_000,
      template: { version: 1, givens: source.completionTemplate, rules: source.lines.map(cells => ({ type: 'renban' as const, cells })) },
      givens: [14, 20], requiredRule: 'renban', difficulty: 'medium', techniqueOrder: await getVariantPlayOrder() } as const
    const first = await runEngine(request)
    assert.deepEqual({ puzzle: first.puzzle, solution: first.solution }, control.original)
    for (const prior of control.cases) {
      cases++; failures += Number(prior.returnedOriginal)
      assertVariantCompletion(prior.prior, prior.witness)
      const truth = countLineSolutions(prior.prior)
      assert.equal(truth.count, 1); assert.equal(truth.solution, prior.witness)
      try {
        const next = await runEngine({ ...request, exclude: [prior.prior] })
        assert.notEqual(renbanKey(next.puzzle), renbanKey(first.puzzle), control.source + ': ' + prior.label)
      } catch (error) { if (!(error instanceof EngineError && error.code === 'search-limit')) throw error }
    }
  }
  assert.equal(cases, 30); assert.equal(failures, 17)
})

test('actual app history preserves equivalent mixed imports, set reordering, square transforms and digit renamings', async () => {
  const value = await generatePlayableVariant('renban', 'medium', 11, [])
  const complement = (grid: string) => [...grid].map(digit => digit === '0' ? digit : String(10 - Number(digit))).join('')
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(value.puzzle, symmetry)
    puzzle.givens = complement(puzzle.givens)
    puzzle.rules = [...puzzle.rules!].reverse().map(rule => rule.type === 'renban' ? { ...rule, cells: [...rule.cells].reverse() } : rule)
    const solution = complement(transformedBoard(value.solution, symmetry))
    assertVariantCompletion(puzzle, solution); assert.equal(renbanKey(puzzle), renbanKey(value.puzzle))
    const next = await generatePlayableVariant('renban', 'medium', 11, [gameOf({ puzzle, solution })])
    assert.notEqual(renbanKey(next.puzzle), renbanKey(value.puzzle))
  }
  // Seed 11 selects the first Jh4o completion/density group. Replace its complete
  // nine-cell Renbans with equivalent houses, changing the imported variant label.
  assert.ok(value.puzzle.rules!.some(rule => rule.type === 'renban' && rule.cells.length === 9))
  const mixed: VariantPuzzle = { ...value.puzzle, rules: value.puzzle.rules!.map(rule =>
    rule.type === 'renban' && rule.cells.length === 9 ? { type: 'extra-house', cells: rule.cells } : rule) }
  assert.equal(variantIdForPuzzle(mixed), 'mixed'); assertVariantCompletion(mixed, value.solution)
  const next = await generatePlayableVariant('renban', 'medium', 11, [gameOf({ puzzle: mixed, solution: value.solution })])
  assert.notEqual(renbanKey(next.puzzle), renbanKey(value.puzzle))
})

test('a bounded Renban fresh miss reaches its deterministic checked fallback and rejects unavailable levels', async () => {
  const seed = 12, recipe = variantSeeds.renban.medium![seed], order = await getVariantPlayOrder(fixture.example.puzzle)
  const fresh = variantGenerationRequest('renban', 'medium', recipe, order, seed)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  const value = await generatePlayableVariant('renban', 'medium', seed, [])
  assert.deepEqual(value, await runEngine(variantGenerationRequest('renban', 'medium', recipe, order)))
  assert.deepEqual(value, await generatePlayableVariant('renban', 'medium', seed, []))
  await assert.rejects(generatePlayableVariant('renban', 'easy', 1, []), error => error instanceof EngineError && error.code === 'unsupported')
})

test('generated Renban definitions, progress, history, exact solutions and UUID shares survive actual storage', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage', 'fetch'] as const, originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  const { sqlite, fetcher } = syncDatabase()
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true }, fetch: { value: fetcher, configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?renban-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const game = gameOf(await generatePlayableVariant('renban', 'medium', 8, [])); roomStore.add(game)
    const cell = game.givens.indexOf('0'), solution = game.variant!.solution
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(solution[cell])))
    const reload = '../src/sudoku/storage.ts?renban-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[cell], solution[cell])
    assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.equal((await puzzleSolution(restored)).board, solution)
    const shared = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'renban', puzzle: game.variant!.puzzle }))
    assert.deepEqual((await prepareImportedPuzzle(shared)).game.variant, game.variant)
    const id = await publishSharedPuzzle(restored)
    assert.ok(isSharedPuzzleId(id))
    const imported = (await prepareSharedPuzzle(id, [], new AbortController().signal)).game
    assert.equal(imported.sharedPuzzleId, id)
    assert.deepEqual(imported.variant, game.variant)
    assert.equal(valuesOf(imported), game.givens)
    assert.equal((await puzzleSolution(imported)).board, solution)
  } finally {
    sqlite.close()
    keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})
