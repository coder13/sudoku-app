import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantDeduction } from '../src/sudoku/engine.ts'
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
useWasmWorker()

function gameOf(result: GeneratedVariant, id = 'anti-king-generated') {
  return { ...makeGame(id, 'Anti-King', result.puzzle.givens, 'generated'),
    variant: { id: 'anti-king' as const, puzzle: result.puzzle, solution: result.solution } }
}

function checkCornerProof(deduction: VariantDeduction) {
  if (deduction.technique !== 'anti-king') return
  const evidence = deduction.evidence
  assert.equal(evidence.type, 'constraint')
  if (evidence.type !== 'constraint') throw Error('Missing corner premises')
  assert.equal(evidence.cells.length, 2)
  const [a, b] = evidence.cells
  assert.equal(Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), 1)
  assert.equal(Math.abs(a % 9 - b % 9), 1)
  for (const action of deduction.actions) {
    assert.ok('eliminate' in action)
    const other = evidence.cells.findIndex(cell => cell !== action.eliminate.cell)
    assert.equal(evidence.domains[other], 1 << (action.eliminate.digit - 1))
  }
}

for (const difficulty of ['easy', 'medium'] as const) {
  test(`actual ${difficulty} Anti-King New Puzzle produces twenty distinct dependent puzzles with several hints and complete replay`, async () => {
    const previous = [], distinct = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) {
      const result = await generatePlayableVariant('anti-king', difficulty, seed, previous)
      assert.equal(variantIdForPuzzle(result.puzzle), 'anti-king')
      assert.deepEqual(result.puzzle.rules, [{ type: 'anti-king' }])
      assert.deepEqual(result.rating.status, { solved: difficulty })
      assert.equal(result.rating.scoringVersion, 11)
      assert.ok(result.rating.counts['anti-king'])
      assert.ok(result.givens <= 30)
      const independent = countCellRuleSolutions(result.puzzle)
      assert.equal(independent.count, 1)
      assert.equal(independent.solution, result.solution)
      assert.equal(countCellRuleSolutions({ ...result.puzzle, rules: [] }).count, 2)
      assertVariantCompletion(result.puzzle, result.solution)
      const game = gameOf(result, difficulty + seed)
      const hints = await puzzleHints(game)
      assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
      const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: result.puzzle },
        techniqueOrder: await getVariantPlayOrder() })
      // Generation caps its advertised profile; the full app order must retain its result.
      assert.equal(trace.rating.points, result.rating.points)
      assert.equal(trace.rating.hardest, result.rating.hardest)
      assert.deepEqual(trace.rating.counts, result.rating.counts)
      assert.deepEqual(trace.rating.status, result.rating.status)
      let played: Game = game
      for (const step of trace.steps) {
        checkCornerProof(step)
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
    assert.equal(distinct.size, 20)
  })
}

test('Medium generation reaches a checked fallback after its bounded fresh search misses', async () => {
  const recipe = variantSeeds['anti-king'].medium![1], techniqueOrder = await getVariantPlayOrder()
  const fresh = variantGenerationRequest('anti-king', 'medium', recipe, techniqueOrder, 1)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  const fallback = await runEngine(variantGenerationRequest('anti-king', 'medium', recipe, techniqueOrder))
  assert.deepEqual(await generatePlayableVariant('anti-king', 'medium', 1, []), fallback)
  assert.deepEqual(fallback.rating.status, { solved: 'medium' })
})

test('Anti-King repeats are deterministic and exclude mixed aliases under every square symmetry', async () => {
  for (const difficulty of ['easy', 'medium'] as const) {
    const first = await generatePlayableVariant('anti-king', difficulty, 4, [])
    assert.deepEqual(await generatePlayableVariant('anti-king', difficulty, 4, []), first)
    const prior = gameOf(first)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const next = await generatePlayableVariant('anti-king', difficulty, 4, [{ ...prior,
        variant: { ...prior.variant, id: 'mixed', puzzle: reflectVariant(first.puzzle, symmetry) } }])
      for (let comparison = 0; comparison < 8; comparison++)
        assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, comparison))
      assert.deepEqual(next.rating.status, { solved: difficulty })
      assert.equal(countCellRuleSolutions(next.puzzle).solution, next.solution)
    }
  }
})

test('a generated Anti-King puzzle retains rules, progress, history, solution and sharing through real storage', async () => {
  const game = gameOf(await generatePlayableVariant('anti-king', 'medium', 10, []))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?anti-king-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(game.variant.solution[cell])))
    const reload = '../src/sudoku/storage.ts?anti-king-generated-reload'
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
