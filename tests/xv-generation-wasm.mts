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
import { variantHouseMasks } from '../src/sudoku/variants.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertXvProof } from './helpers/xv-truth.ts'

useWasmWorker()
const difficulties = ['easy', 'medium'] as const

function xvRule(puzzle: VariantPuzzle) {
  assert.equal(puzzle.rules?.length, 1)
  const rule = puzzle.rules![0]
  assert.equal(rule.type, 'xv')
  return rule
}

function gameOf(value: { puzzle: VariantPuzzle; solution: string }, id = 'xv-generated'): Game {
  const variantId = value.puzzle.rules?.some(rule => rule.type === 'xv') ? 'xv' : 'adjacent-total'
  return {
    ...makeGame(id, 'XV', value.puzzle.givens, 'generated'),
    variant: { id: variantId, puzzle: value.puzzle, solution: value.solution },
  }
}

function verify(value: GeneratedVariant, difficulty: typeof difficulties[number]) {
  const { five, ten } = xvRule(value.puzzle)
  assert.ok(five?.pairs?.length && ten?.pairs?.length)
  assert.equal(Boolean(five.negative) || Boolean(ten.negative), false)
  assert.deepEqual(value.rating.status, { solved: difficulty })
  assert.equal(value.rating.scoringVersion, 14)
  assert.ok(value.rating.counts.xv > 0)
  assert.ok(value.givens >= (difficulty === 'medium' ? 16 : 0) && value.givens <= 30)
  assertVariantCompletion(value.puzzle, value.solution)
  const unique = countLineSolutions(value.puzzle)
  assert.equal(unique.count, 1)
  assert.equal(unique.solution, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('sixty checked XV recipes generate both marks and independently require XV', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  assert.equal(catalog.techniques.find(technique => technique.id === 'xv')?.cost, 20)
  for (const difficulty of difficulties) {
    const recipes = variantSeeds.xv[difficulty]!
    assert.equal(recipes.length, 30)
    const completions = new Set()
    for (const recipe of recipes) {
      const request = variantGenerationRequest('xv', difficulty, recipe, await getVariantPlayOrder())
      request.maxAttempts = 1
      request.maxNodes = 20_000
      const value = await runEngine(request)
      const { five, ten } = xvRule(value.puzzle)
      assert.equal(five!.pairs!.length + ten!.pairs!.length, recipe.markCount)
      verify(value, difficulty)
      completions.add(value.solution)
    }
    assert.equal(completions.size, 30)
  }
})

test('actual XV New Puzzle gives distinct puzzles with several hints and complete play replays', async () => {
  const history: Game[] = []
  const seen = new Set<string>()
  for (const difficulty of difficulties) for (let seed = 1; seed <= 30; seed++) {
    const value = await generatePlayableVariant('xv', difficulty, seed, history)
    verify(value, difficulty)
    const identity = JSON.stringify(value.puzzle)
    assert.ok(!seen.has(identity))
    seen.add(identity)
    const game = { ...gameOf(value, `xv-${difficulty}-${seed}`), difficulty }
    history.push(game)
    const hints = await puzzleHints(game, 10)
    assert.ok(hints.choices.length > 1)
    for (const hint of hints.choices) if (hint.technique === 'xv') {
      assert.ok('variant' in hint.evidence)
      assertXvProof(value.puzzle, hint.evidence.variant.source!.deduction)
    }

    if (seed === 1) {
      const selected = await puzzleHints(game, 'all', 'xv')
      assert.ok(selected.choices.length > 0)
      const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant!, game.position))
      try {
        assert.equal(await scan.count('xv'), targets.size)
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
      if (step.technique === 'xv') assertXvProof(value.puzzle, step)
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

test('split and reversed marker layers and general sums exclude a previously played puzzle', async () => {
  const order = await getVariantPlayOrder()
  const recipe = variantSeeds.xv.easy!.find(recipe => recipe.markCount === 14 && recipe.seed === 16)!
  assert.ok(recipe)
  const request = { ...variantGenerationRequest('xv', 'easy', recipe, order), maxNodes: 20_000, maxAttempts: 1 }
  const first = await runEngine(request)
  const { five, ten } = xvRule(first.puzzle)
  const totals: VariantRule[] = [...five!.pairs!.map(([a, b]) => ({ type: 'adjacent-total', cells: [b, a], sum: 5 }) as const),
    ...ten!.pairs!.map(([a, b]) => ({ type: 'adjacent-total', cells: [b, a], sum: 10 }) as const)]
  const split: VariantRule[] = totals.map(rule => {
    assert.equal(rule.type, 'adjacent-total')
    return rule.sum === 5 ? { type: 'xv', five: { pairs: [rule.cells] } } : { type: 'xv', ten: { pairs: [rule.cells] } }
  })
  for (const rules of [split, totals, [xvRule(first.puzzle), totals[0]]]) {
    for (const symmetry of [0, 1, 3, 7]) {
      const puzzle = reflectVariant({ ...first.puzzle, rules }, symmetry)
      const solution = transformedBoard(first.solution, symmetry)
      assert.equal(countLineSolutions(puzzle).solution, solution)
      try {
        const next = await runEngine({ ...request, exclude: [puzzle] })
        assert.notEqual(next.puzzle.givens, first.puzzle.givens)
      } catch (error) {
        if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
      }
    }
  }
  const starting = await generatePlayableVariant('xv', 'easy', 1, [])
  const mark = xvRule(starting.puzzle)
  const equivalent: VariantPuzzle = { ...starting.puzzle, rules: [
    ...mark.five!.pairs!.map(cells => ({ type: 'adjacent-total', cells, sum: 5 }) as const),
    ...mark.ten!.pairs!.map(cells => ({ type: 'adjacent-total', cells, sum: 10 }) as const),
  ] }
  const next = await generatePlayableVariant('xv', 'easy', 1, [gameOf({ puzzle: equivalent, solution: starting.solution })])
  assert.notEqual(next.puzzle.givens, starting.puzzle.givens)
})

test('XV uses the checked fallback after a search limit or a single-symbol layout', async () => {
  const order = await getVariantPlayOrder()
  for (const [seed, reason] of [[387276917, 'search-limit'], [3929271828, 'one-mark']] as const) {
    const recipe = variantSeeds.xv.medium![seed % variantSeeds.xv.medium!.length]
    const fresh = { ...variantGenerationRequest('xv', 'medium', recipe, order, seed), maxNodes: 20_000 }
    if (reason === 'search-limit') {
      await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === reason)
    } else {
      const { five, ten } = xvRule((await runEngine(fresh)).puzzle)
      assert.equal(five?.pairs?.length, 0)
      assert.ok(ten?.pairs?.length)
    }
    const result = await generatePlayableVariant('xv', 'medium', seed, [])
    verify(result, 'medium')
    assert.deepEqual(result, await runEngine(variantGenerationRequest('xv', 'medium', recipe, order)))
  }
  await assert.rejects(generatePlayableVariant('xv', 'hard', 1, []),
    error => error instanceof EngineError && error.code === 'unsupported')
})

test('generated XV markers, score, progress and the starting puzzle survive storage and sharing', async () => {
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
    const path = '../src/sudoku/storage.ts?xv-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const value = await generatePlayableVariant('xv', 'medium', 7, [])
    const game = { ...gameOf(value), difficulty: 'medium' as const, score: value.rating.points }
    roomStore.add(game)
    const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(value.solution[cell])))
    const reload = '../src/sudoku/storage.ts?xv-generated-reload'
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
