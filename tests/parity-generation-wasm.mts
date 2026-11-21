import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertParityProof } from './helpers/parity-proof.ts'
import { readFileSync } from 'node:fs'
useWasmWorker()

const patterns = JSON.parse(readFileSync(new URL('./fixtures/parity-generation.json', import.meta.url), 'utf8')) as {
  patterns: { name: string; cells: number[] }[]
}

test('every checked recipe derives exactly its markers and preserves the six-point Easy rule', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/parity-big-eight.json', import.meta.url), 'utf8')) as {
    puzzle: { rules: { cells: number[] }[] }
  }
  assert.deepEqual(patterns.patterns[1].cells, [...new Set(source.puzzle.rules.flatMap(rule => rule.cells))].sort((a, b) => a - b))
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(item => item.id === 'parity')!
  assert.equal(technique.cost, 6)
  assert.equal(technique.difficulty, 'easy')
  assert.equal(technique.requiresUniqueSolution, false)
  for (const difficulty of ['easy', 'medium'] as const) {
    const recipes = variantSeeds.parity[difficulty]!
    assert.equal(recipes.length, 30)
    for (const recipe of recipes) {
      assert.ok(patterns.patterns.some(pattern => JSON.stringify(pattern.cells) === JSON.stringify(recipe.markedCells)))
      const request = variantGenerationRequest('parity', difficulty, recipe, await getVariantPlayOrder())
      request.maxNodes = 20_000
      const result = await runEngine(request)
      assert.deepEqual(result.rating.status, { solved: difficulty })
      assert.ok(result.givens >= (recipe.minGivens ?? 0) && result.givens <= recipe.maxGivens)
      assert.equal(result.variantClues, recipe.markedCells!.length)
      assert.deepEqual(result.puzzle.rules!.flatMap(rule => rule.type === 'parity' ? rule.cells : []).sort((a, b) => a - b), recipe.markedCells)
      const independent = countCellRuleSolutions(result.puzzle)
      assert.equal(independent.count, 1)
      assert.equal(independent.solution, result.solution)
      assertVariantCompletion(result.puzzle, result.solution)
      assert.equal(countCellRuleSolutions({ ...result.puzzle, rules: [] }).count, 2)
    }
  }
})
function gameOf(result: GeneratedVariant, id = 'parity-generated') {
  return { ...makeGame(id, 'Odd/Even', result.puzzle.givens, 'generated'),
    variant: { id: 'parity' as const, puzzle: result.puzzle, solution: result.solution } }
}

for (const difficulty of ['easy', 'medium'] as const) {
  test(`actual ${difficulty} Odd/Even New Puzzle produces thirty distinct dependent puzzles with several hints and complete replay`, async () => {
    const previous = [], distinct = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const result = await generatePlayableVariant('parity', difficulty, seed, previous)
      assert.equal(variantIdForPuzzle(result.puzzle), 'parity')
      assert.ok(result.puzzle.rules!.every(rule => rule.type === 'parity'))
      assert.ok([23, 27].includes(result.variantClues))
      assert.deepEqual(result.rating.status, { solved: difficulty })
      assert.equal(result.rating.scoringVersion, 14)
      assert.ok(result.rating.counts['parity'])
      assert.ok(result.givens >= (difficulty === 'medium' ? 20 : 0) && result.givens <= 30)
      const independent = countCellRuleSolutions(result.puzzle)
      assert.equal(independent.count, 1)
      assert.equal(independent.solution, result.solution)
      assert.equal(countCellRuleSolutions({ ...result.puzzle, rules: [] }).count, 2)
      assertVariantCompletion(result.puzzle, result.solution)
      const game = gameOf(result, difficulty + seed)
      const hints = await puzzleHints(game)
      assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
      for (const hint of hints.choices) for (const action of hint.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(result.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(result.solution[action.eliminate.cell]))
      }
      const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: result.puzzle },
        techniqueOrder: await getVariantPlayOrder() })
      // Generation caps its advertised profile; the full app order must retain its result.
      assert.equal(trace.rating.points, result.rating.points)
      assert.equal(trace.rating.hardest, result.rating.hardest)
      assert.deepEqual(trace.rating.counts, result.rating.counts)
      assert.deepEqual(trace.rating.status, result.rating.status)
      let played: Game = game
      for (const step of trace.steps) {
        if (step.technique === 'parity') assertParityProof(result.puzzle, step)
        for (const action of step.actions) {
          if ('place' in action) assert.equal(action.place.digit, Number(result.solution[action.place.cell]))
          else assert.notEqual(action.eliminate.digit, Number(result.solution[action.eliminate.cell]))
        }
        played = applyDeduction(played, step.actions, variantHouseMasks(result.puzzle, valuesOf(played)))
      }
      assert.equal(isSolved(played), true)
      assert.equal(valuesOf(played), result.solution)
      distinct.add(result.puzzle.givens)
      previous.push(game)
    }
    assert.equal(distinct.size, 30)
  })
}

test('Medium generation reaches a checked fallback after its bounded fresh search misses', async () => {
  const recipe = variantSeeds['parity'].medium![1], techniqueOrder = await getVariantPlayOrder()
  const fresh = variantGenerationRequest('parity', 'medium', recipe, techniqueOrder, 1)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  const fallback = await runEngine(variantGenerationRequest('parity', 'medium', recipe, techniqueOrder))
  assert.deepEqual(await generatePlayableVariant('parity', 'medium', 1, []), fallback)
  assert.deepEqual(fallback.rating.status, { solved: 'medium' })
})

test('Odd/Even repeats exclude mixed aliases, marker order and every square symmetry', async () => {
  for (const difficulty of ['easy', 'medium'] as const) {
    const first = await generatePlayableVariant('parity', difficulty, 4, [])
    assert.deepEqual(await generatePlayableVariant('parity', difficulty, 4, []), first)
    const prior = gameOf(first)
    const equivalents = [...Array.from({ length: 8 }, (_, symmetry) => reflectVariant(first.puzzle, symmetry)),
      { ...first.puzzle, rules: [...first.puzzle.rules!].reverse().map(rule =>
        rule.type === 'parity' ? { ...rule, cells: [...rule.cells].reverse() } : rule) }]
    for (const puzzle of equivalents) {
      const next = await generatePlayableVariant('parity', difficulty, 4, [{ ...prior,
        variant: { ...prior.variant, id: 'mixed', puzzle } }])
      for (let comparison = 0; comparison < 8; comparison++)
        assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, comparison))
      assert.deepEqual(next.rating.status, { solved: difficulty })
      const independent = countCellRuleSolutions(next.puzzle)
      assert.equal(independent.count, 1)
      assert.equal(independent.solution, next.solution)
      assert.equal(countCellRuleSolutions({ ...next.puzzle, rules: [] }).count, 2)
    }
  }
})

test('a generated Odd/Even puzzle retains rules, progress, history, solution and sharing through real storage', async () => {
  const game = gameOf(await generatePlayableVariant('parity', 'medium', 10, []))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?parity-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(game.variant.solution[cell])))
    const reload = '../src/sudoku/storage.ts?parity-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[cell], game.variant.solution[cell])
    assert.equal(undo(restored).position.entries[cell], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.equal((await puzzleSolution(restored)).board, game.variant.solution)
    const shared = '#variant=' + encodeURIComponent(JSON.stringify({ id: restored.variant!.id, puzzle: restored.variant!.puzzle }))
    assert.deepEqual((await prepareImportedPuzzle(shared)).game.variant, game.variant)
  } finally {
    keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})
