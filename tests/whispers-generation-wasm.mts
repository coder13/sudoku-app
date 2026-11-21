import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantRule } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { generationRulesets, puzzleGenerationRuleset } from '../src/sudoku/variant-rulesets.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { countWhispersSolutions } from './helpers/whispers-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { assertWhispersProof } from './helpers/whispers-proof.ts'
import { assertLineHouseProof } from './helpers/line-house-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const geometry = JSON.parse(readFileSync(new URL('./fixtures/whispers-generation.json', import.meta.url), 'utf8')) as { lines: number[][] }
function gameOf(result: GeneratedVariant, id = 'whispers-generated') {
  return { ...makeGame(id, 'Whispers', result.puzzle.givens, 'generated'),
    variant: { id: 'whispers' as const, puzzle: result.puzzle, solution: result.solution } }
}
function verify(result: GeneratedVariant, minDifference: number) {
  assert.deepEqual(result.puzzle.rules, geometry.lines.map(cells => ({ type: 'whispers', cells, minDifference })))
  assert.deepEqual(result.rating.status, { solved: 'medium' })
  assert.equal(result.rating.scoringVersion, 17)
  assert.ok(result.rating.counts.whispers || result.rating.counts['whispers-house-support'])
  assert.ok(result.givens <= 20)
  const independent = countWhispersSolutions(result.puzzle)
  assert.equal(independent.count, 1)
  assert.equal(independent.solution, result.solution)
  assertVariantCompletion(result.puzzle, result.solution)
  assert.equal(countWhispersSolutions({ ...result.puzzle, rules: [] }).count, 2)
}

test('all sixty recipes preserve every original path, selected minimum, independent completion and Medium costs', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/whispers-brain-zaps.json', import.meta.url), 'utf8')) as { puzzle: { rules: { cells: number[] }[] } }
  assert.deepEqual(geometry.lines, source.puzzle.rules.map(rule => rule.cells))
  const catalog = await runEngine({ type: 'techniques', variant: true })
  for (const [id, cost] of [['whispers', 27], ['whispers-house-support', 39]] as const) {
    const technique = catalog.techniques.find(item => item.id === id)!
    assert.equal(technique.cost, cost); assert.equal(technique.difficulty, 'medium'); assert.equal(technique.requiresUniqueSolution, false)
  }
  assert.equal(variantSeeds.whispers.medium!.length, 60)
  const boards = new Set<string>()
  for (const recipe of variantSeeds.whispers.medium!) {
    const request = variantGenerationRequest('whispers', 'medium', recipe, await getVariantPlayOrder())
    request.maxNodes = 20_000
    const result = await runEngine(request)
    verify(result, recipe.minDifference!)
    boards.add(result.puzzle.givens)
  }
  assert.equal(boards.size, 60)
})
for (const preset of generationRulesets('whispers')) {
  test(`actual ${preset.name} New Puzzle yields thirty successive distinct puzzles, sound hints and complete proof replay`, async () => {
    const previous: Game[] = [], boards = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const result = await generatePlayableVariant('whispers', 'medium', seed, previous, { ruleset: preset.id })
      verify(result, preset.minDifference)
      assert.equal(variantIdForPuzzle(result.puzzle), 'whispers')
      assert.equal(puzzleGenerationRuleset(result.puzzle), preset.id)
      const game = gameOf(result, preset.id + seed), hints = await puzzleHints(game)
      assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
      const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: result.puzzle }, techniqueOrder: await getVariantPlayOrder() })
      assert.equal(trace.rating.points, result.rating.points)
      assert.equal(trace.rating.hardest, result.rating.hardest)
      assert.deepEqual(trace.rating.counts, result.rating.counts)
      assert.deepEqual(trace.rating.status, result.rating.status)
      let played: Game = game
      for (const step of trace.steps) {
        if (step.technique === 'whispers') assertWhispersProof(result.puzzle, step)
        if (step.technique === 'whispers-house-support') assertLineHouseProof({ puzzle: result.puzzle, entries: played.position.entries, eliminations: played.position.eliminations }, step)
        for (const action of step.actions) {
          if ('place' in action) assert.equal(action.place.digit, Number(result.solution[action.place.cell]))
          else assert.notEqual(action.eliminate.digit, Number(result.solution[action.eliminate.cell]))
        }
        played = applyDeduction(played, step.actions, variantHouseMasks(result.puzzle, valuesOf(played)))
      }
      for (const hint of hints.choices) for (const action of hint.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(result.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(result.solution[action.eliminate.cell]))
      }
      assert.ok(isSolved(played)); assert.equal(valuesOf(played), result.solution)
      boards.add(result.puzzle.givens); previous.push(game)
    }
    assert.equal(boards.size, 30)
  })
}

test('default generation is German; explicit styles are deterministic and reach their own checked fallbacks', async () => {
  assert.deepEqual(await generatePlayableVariant('whispers', 'medium', 11, []), await generatePlayableVariant('whispers', 'medium', 11, [], { ruleset: 'german' }))
  for (const [ruleset, minDifference, seed] of [['german', 5, 1], ['dutch', 4, 6]] as const) {
    const recipes = variantSeeds.whispers.medium!.filter(recipe => recipe.minDifference === minDifference)
    const recipe = recipes[seed % recipes.length], order = await getVariantPlayOrder()
    const fresh = variantGenerationRequest('whispers', 'medium', recipe, order, seed); fresh.maxNodes = 20_000
    await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
    const expected = await runEngine(variantGenerationRequest('whispers', 'medium', recipe, order))
    assert.deepEqual(await generatePlayableVariant('whispers', 'medium', seed, [], { ruleset }), expected)
  }
  await assert.rejects(generatePlayableVariant('parity', 'easy', 1, [], { ruleset: 'dutch' }), error => error instanceof EngineError && error.code === 'unsupported')
  for (const ruleset of ['', 'unknown', null, 4]) {
    await assert.rejects(generatePlayableVariant('whispers', 'medium', 1, [], { ruleset: ruleset as never }),
      error => error instanceof EngineError && error.code === 'unsupported')
  }
})

test('both styles exclude mixed aliases, all square symmetries, reversed paths and reordered lines', async () => {
  for (const ruleset of ['german', 'dutch'] as const) {
    const first = await generatePlayableVariant('whispers', 'medium', 12, [], { ruleset }), prior = gameOf(first)
    assert.deepEqual(await generatePlayableVariant('whispers', 'medium', 12, [], { ruleset }), first)
    const split = first.puzzle.rules!.flatMap<VariantRule>(rule => rule.type === 'whispers'
      ? rule.cells.slice(1).map((cell, i) => ({ type: 'whispers', cells: [cell, rule.cells[i]], minDifference: rule.minDifference })) : [rule])
    const equivalents = [...Array.from({ length: 8 }, (_, symmetry) => reflectVariant(first.puzzle, symmetry)),
      { ...first.puzzle, rules: [...first.puzzle.rules!].reverse().map(rule => rule.type === 'whispers' ? { ...rule, cells: [...rule.cells].reverse() } : rule) },
      { ...first.puzzle, rules: split },
      { ...first.puzzle, rules: [...split, ...split.map(rule => rule.type === 'whispers' ? { ...rule, minDifference: rule.minDifference - 1 } : rule)] }]
    for (const puzzle of equivalents) {
      const next = await generatePlayableVariant('whispers', 'medium', 12, [{ ...prior, variant: { ...prior.variant, id: 'mixed', puzzle } }], { ruleset })
      for (let comparison = 0; comparison < 8; comparison++) assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, comparison))
      verify(next, ruleset === 'german' ? 5 : 4)
    }
  }
})

test('generated styles retain every line, progress, undo/redo, next-puzzle style, solutions and sharing through real storage', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?whispers-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    for (const ruleset of ['german', 'dutch'] as const) {
      const game = gameOf(await generatePlayableVariant('whispers', 'medium', 10, [], { ruleset }), ruleset)
      roomStore.add(game)
      const cell = game.givens.indexOf('0')
      roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(game.variant.solution[cell])))
      const reload = '../src/sudoku/storage.ts?whispers-generated-reload-' + ruleset
      const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
      assert.deepEqual(restored.variant, game.variant)
      assert.equal(restored.position.entries[cell], game.variant.solution[cell])
      assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
      assert.equal(puzzleGenerationRuleset(restored.variant?.puzzle), ruleset)
      assert.equal((await puzzleSolution(restored)).board, game.variant.solution)
      const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'whispers', puzzle: game.variant.puzzle }))
      assert.deepEqual((await prepareImportedPuzzle(share)).game.variant, game.variant)
    }
  } finally { keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})
