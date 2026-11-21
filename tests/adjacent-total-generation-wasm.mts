import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantPuzzle, type VariantRule } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { isSharedPuzzleId, publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { generatePlayableVariant, getVariantPlayOrder, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertAdjacentTotalProof } from './helpers/adjacent-total-truth.ts'

useWasmWorker()
const difficulties = ['easy', 'medium'] as const

const variant = 'adjacent-total' as const

function totals(puzzle: VariantPuzzle) {
  return (puzzle.rules ?? []).map(rule => {
    assert.equal(rule.type, 'adjacent-total')
    return rule
  })
}

function gameOf(value: { puzzle: VariantPuzzle; solution: string }, id = 'totals-generated'): Game {
  const type = variantIdForPuzzle(value.puzzle)
  assert.ok(type !== 'classic')
  return {
    ...makeGame(id, 'Two-cell sums', value.puzzle.givens, 'generated'),
    variant: { id: type, puzzle: value.puzzle, solution: value.solution },
  }
}

function verify(value: GeneratedVariant, difficulty: typeof difficulties[number]) {
  const rules = totals(value.puzzle)
  assert.ok(rules.some(rule => rule.sum !== 5 && rule.sum !== 10))
  assert.deepEqual(value.rating.status, { solved: difficulty })
  assert.equal(value.rating.scoringVersion, 9)
  assert.ok(value.rating.counts[variant] > 0)
  assert.ok(value.givens >= (difficulty === 'medium' ? 16 : 0) && value.givens <= 30)
  assertVariantCompletion(value.puzzle, value.solution)
  const unique = countLineSolutions(value.puzzle)
  assert.equal(unique.count, 1)
  assert.equal(unique.solution, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('sixty checked Two-cell sums recipes retain their layouts and independently require the sums', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  assert.equal(catalog.techniques.find(technique => technique.id === 'adjacent-total')?.cost, 20)
  for (const difficulty of difficulties) {
    const recipes = variantSeeds['adjacent-total'][difficulty]!
    assert.equal(recipes.length, 30)
    const completions = new Set()
    for (const recipe of recipes) {
      const request = variantGenerationRequest('adjacent-total', difficulty, recipe, await getVariantPlayOrder())
      request.maxAttempts = 1
      request.maxNodes = 20_000
      const value = await runEngine(request)
      assert.deepEqual(totals(value.puzzle).map(rule => rule.cells), recipe.pairs)
      for (const { cells: [a, b], sum } of totals(value.puzzle)) {
        assert.equal(Number(value.solution[a]) + Number(value.solution[b]), sum)
      }
      verify(value, difficulty)
      completions.add(value.solution)
    }
    assert.equal(completions.size, 30)
  }
})

test('actual Two-cell sums New Puzzle gives distinct puzzles with several hints and complete play replays', async () => {
  const history: Game[] = []
  const seen = new Set<string>()
  for (const difficulty of difficulties) for (let seed = 1; seed <= 30; seed++) {
    const value = await generatePlayableVariant('adjacent-total', difficulty, seed, history)
    verify(value, difficulty)
    const identity = JSON.stringify(value.puzzle)
    assert.ok(!seen.has(identity))
    seen.add(identity)
    const game = { ...gameOf(value, `totals-${difficulty}-${seed}`), difficulty }
    history.push(game)
    const hints = await puzzleHints(game, 10)
    assert.ok(hints.choices.length > 1)
    for (const hint of hints.choices) if (hint.technique === 'adjacent-total') {
      assert.ok('variant' in hint.evidence)
      assertAdjacentTotalProof(value.puzzle, hint.evidence.variant.source!.deduction)
    }

    if (seed === 1) {
      const selected = await puzzleHints(game, 'all', 'adjacent-total')
      assert.ok(selected.choices.length > 0)
      const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant!, game.position))
      try {
        assert.equal(await scan.count('adjacent-total'), targets.size)
      } finally {
        scan.close()
      }
    }

    const trace = await runEngine({
      type: 'variant', operation: 'trace', position: { puzzle: value.puzzle }, techniqueOrder: value.rating.techniqueOrder,
    })
    assert.deepEqual(trace.rating, value.rating)
    let played = game
    for (const step of trace.steps) {
      if (step.technique === 'adjacent-total') assertAdjacentTotalProof(value.puzzle, step)
      for (const action of step.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(value.solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
    }
    assert.ok(isSolved(played))
    assert.equal(valuesOf(played), value.solution)
    assert.equal((await puzzleSolution(game)).board, value.solution)
  }
  assert.equal(seen.size, 60)
})

const complement = (grid: string) => [...grid].map(digit => digit === '0' ? digit : String(10 - Number(digit))).join('')

test('duplicate edges, equivalent XV layers and complemented totals exclude played copies', async () => {
  const order = await getVariantPlayOrder()
  const recipe = variantSeeds[variant].easy![0]
  const request = { ...variantGenerationRequest(variant, 'easy', recipe, order), maxNodes: 20_000, maxAttempts: 1 }
  const first = await runEngine(request)
  const rules = totals(first.puzzle)
  const generic = rules.find(rule => rule.sum !== 5 && rule.sum !== 10)!
  const duplicate: VariantRule[] = [...rules, { ...generic, cells: [generic.cells[1], generic.cells[0]] }]
  const aliased: VariantRule[] = rules.map(rule => {
    if (rule.sum === 5) return { type: 'xv', five: { pairs: [rule.cells] } }
    if (rule.sum === 10) return { type: 'xv', ten: { pairs: [rule.cells] } }
    return rule
  })
  assert.ok(aliased.some(rule => rule.type === 'xv'))
  for (const [prior, invert] of [[duplicate, false], [aliased, false], [rules, true]] as const) {
    for (const symmetry of [0, 1, 3, 7]) {
      const before = invert ? {
        ...first.puzzle, givens: complement(first.puzzle.givens),
        rules: totals(first.puzzle).map(rule => ({ ...rule, sum: 20 - rule.sum })),
      } : { ...first.puzzle, rules: [...prior].reverse() }
      const puzzle = reflectVariant(before, symmetry)
      const solution = transformedBoard(invert ? complement(first.solution) : first.solution, symmetry)
      assert.equal(countLineSolutions(puzzle).solution, solution)
      try {
        const next = await runEngine({ ...request, exclude: [puzzle] })
        assert.notDeepEqual(next.puzzle, first.puzzle)
      } catch (error) {
        if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
      }
    }
  }
  const value = await generatePlayableVariant(variant, 'easy', 1, [])
  const equivalent = {
    ...value.puzzle, givens: complement(value.puzzle.givens),
    rules: totals(value.puzzle).map(rule => ({ ...rule, sum: 20 - rule.sum })),
  }
  const next = await generatePlayableVariant(variant, 'easy', 1, [
    gameOf({ puzzle: equivalent, solution: complement(value.solution) }),
  ])
  assert.notDeepEqual(next.puzzle, value.puzzle)
})

test('Two-cell sums reaches verified fallback after a bounded fresh miss', async () => {
  const seed = 387276917
  const order = await getVariantPlayOrder()
  const recipe = variantSeeds[variant].medium![seed % variantSeeds[variant].medium!.length]
  const fresh = { ...variantGenerationRequest(variant, 'medium', recipe, order, seed), maxNodes: 20_000 }
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  const result = await generatePlayableVariant(variant, 'medium', seed, [])
  verify(result, 'medium')
  assert.deepEqual(result, await runEngine(variantGenerationRequest(variant, 'medium', recipe, order)))
  await assert.rejects(generatePlayableVariant(variant, 'hard', 1, []),
    error => error instanceof EngineError && error.code === 'unsupported')
})

test('generated sums, score, progress and the starting puzzle survive storage and sharing', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage', 'fetch'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  const { sqlite, fetcher } = syncDatabase()
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
    fetch: { value: fetcher, configurable: true },
  })
  try {
    const path = '../src/sudoku/storage.ts?totals-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const value = await generatePlayableVariant('adjacent-total', 'medium', 7, [])
    const game = { ...gameOf(value), difficulty: 'medium' as const, score: value.rating.points }
    roomStore.add(game)
    const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(value.solution[cell])))
    const reload = '../src/sudoku/storage.ts?totals-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.score, game.score)
    assert.equal(restored.difficulty, game.difficulty)
    assert.equal(restored.position.entries[cell], value.solution[cell])
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    const shared = await publishSharedPuzzle(restored)
    assert.ok(isSharedPuzzleId(shared))
    const opened = (await prepareSharedPuzzle(shared, [], new AbortController().signal)).game
    assert.deepEqual(opened.variant, game.variant)
    assert.equal(valuesOf(opened), game.givens)
    assert.equal((await puzzleSolution(opened)).board, value.solution)
  } finally {
    sqlite.close()
    keys.forEach((key, i) => {
      if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
})
