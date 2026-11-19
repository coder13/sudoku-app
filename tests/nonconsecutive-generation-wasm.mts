import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { countCellRuleSolutions } from './helpers/cell-rule-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertExclusionProof } from './helpers/exclusion-truth.ts'
import { readFileSync } from 'node:fs'
useWasmWorker()

test('all checked recipes preserve their completion witnesses, density bounds and eight-point Easy rule', async () => {
  const layouts = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-generation.json', import.meta.url), 'utf8')) as {
    layouts: { solution: string }[]
  }
  const puzzle = { version: 1 as const, givens: '0'.repeat(81), rules: [{ type: 'non-consecutive' as const }] }
  for (const { solution } of layouts.layouts) assertVariantCompletion(puzzle, solution)
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(item => item.id === 'non-consecutive')!
  assert.equal(technique.cost, 8)
  assert.equal(technique.difficulty, 'easy')
  assert.equal(technique.requiresUniqueSolution, false)
  for (const difficulty of ['easy', 'medium'] as const) {
    const recipes = variantSeeds['non-consecutive'][difficulty]!
    assert.equal(recipes.length, 30)
    assert.equal(new Set(recipes.map(recipe => recipe.layout)).size, 3)
    for (const recipe of recipes) {
      const request = variantGenerationRequest('non-consecutive', difficulty, recipe, await getVariantPlayOrder())
      request.maxNodes = 20_000
      const result = await runEngine(request)
      assert.deepEqual(result.rating.status, { solved: difficulty })
      assert.ok(result.givens >= (recipe.minGivens ?? 0) && result.givens <= recipe.maxGivens)
      const independent = countCellRuleSolutions(result.puzzle)
      assert.equal(independent.count, 1)
      assert.equal(independent.solution, result.solution)
      assert.equal(countCellRuleSolutions({ ...result.puzzle, rules: [] }).count, 2)
    }
  }
})

function gameOf(result: GeneratedVariant, id = 'non-consecutive-generated') {
  return { ...makeGame(id, 'Non-Consecutive', result.puzzle.givens, 'generated'),
    variant: { id: 'non-consecutive' as const, puzzle: result.puzzle, solution: result.solution } }
}

function checkEdgeProof(deduction: VariantDeduction, puzzle: VariantPuzzle) {
  if (deduction.technique !== 'non-consecutive') return
  const evidence = deduction.evidence
  assert.equal(evidence.type, 'constraint')
  if (evidence.type !== 'constraint') throw Error('Missing edge premises')
  assert.equal(evidence.cells.length, 2)
  assert.equal(evidence.domains.length, 2)
  assert.ok(evidence.rules.length > 0 && evidence.rules.every(index => puzzle.rules?.[index].type === 'non-consecutive'))
  const [a, b] = evidence.cells
  assert.equal(Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs(a % 9 - b % 9), 1)
  for (const action of deduction.actions) {
    assert.ok('eliminate' in action)
    const target = evidence.cells.indexOf(action.eliminate.cell)
    assert.ok(target >= 0 && evidence.domains[target] & 1 << (action.eliminate.digit - 1))
    const other = evidence.cells.findIndex(cell => cell !== action.eliminate.cell)
    assert.ok(evidence.domains[other])
    for (let digit = 1; digit <= 9; digit++) if (evidence.domains[other] & 1 << (digit - 1))
      assert.equal(Math.abs(digit - action.eliminate.digit), 1)
  }
}

for (const difficulty of ['easy', 'medium'] as const) {
  test(`actual ${difficulty} Non-Consecutive New Puzzle produces thirty distinct dependent puzzles with several hints and complete replay`, async () => {
    const previous = [], distinct = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const result = await generatePlayableVariant('non-consecutive', difficulty, seed, previous)
      assert.equal(variantIdForPuzzle(result.puzzle), 'non-consecutive')
      assert.deepEqual(result.puzzle.rules, [{ type: 'non-consecutive' }])
      assert.deepEqual(result.rating.status, { solved: difficulty })
      assert.equal(result.rating.scoringVersion, 8)
      assert.ok(result.rating.counts['non-consecutive'])
      assert.ok(result.givens >= (difficulty === 'medium' ? 14 : 0) && result.givens <= (difficulty === 'medium' ? 20 : 30))
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
        checkEdgeProof(step, result.puzzle)
        if (step.evidence.type === 'exclusion') assertExclusionProof(variantPosition(game.variant, played.position), step)
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
  const recipe = variantSeeds['non-consecutive'].medium![1], techniqueOrder = await getVariantPlayOrder()
  const fresh = variantGenerationRequest('non-consecutive', 'medium', recipe, techniqueOrder, 1)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  const fallback = await runEngine(variantGenerationRequest('non-consecutive', 'medium', recipe, techniqueOrder))
  assert.deepEqual(await generatePlayableVariant('non-consecutive', 'medium', 1, []), fallback)
  assert.deepEqual(fallback.rating.status, { solved: 'medium' })
})

test('the recipe given floor rejects a Medium result that only exists below its advertised range', async () => {
  const recipe = variantSeeds['non-consecutive'].medium![0]
  const bounded = variantGenerationRequest('non-consecutive', 'medium', recipe, await getVariantPlayOrder(), 18)
  bounded.maxNodes = 20_000
  await assert.rejects(runEngine(bounded), error => error instanceof EngineError && error.code === 'search-limit')
  const lower = await runEngine({ ...bounded, givens: [0, recipe.maxGivens] })
  assert.ok(lower.givens < recipe.minGivens!)
  assert.deepEqual(lower.rating.status, { solved: 'medium' })
  const independent = countCellRuleSolutions(lower.puzzle)
  assert.equal(independent.count, 1)
  assert.equal(independent.solution, lower.solution)
  assert.equal(countCellRuleSolutions({ ...lower.puzzle, rules: [] }).count, 2)
})

test('Non-Consecutive repeats are deterministic and exclude mixed aliases under every square symmetry', async () => {
  for (const difficulty of ['easy', 'medium'] as const) {
    const first = await generatePlayableVariant('non-consecutive', difficulty, 4, [])
    assert.deepEqual(await generatePlayableVariant('non-consecutive', difficulty, 4, []), first)
    const prior = gameOf(first)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const next = await generatePlayableVariant('non-consecutive', difficulty, 4, [{ ...prior,
        variant: { ...prior.variant, id: 'mixed', puzzle: reflectVariant(first.puzzle, symmetry) } }])
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

test('a generated Non-Consecutive puzzle retains rules, progress, history, solution and sharing through real storage', async () => {
  const game = gameOf(await generatePlayableVariant('non-consecutive', 'medium', 10, []))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?non-consecutive-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(game.variant.solution[cell])))
    const reload = '../src/sudoku/storage.ts?non-consecutive-generated-reload'
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
