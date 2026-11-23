import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
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

useWasmWorker()

const recipes = variantSeeds.quadruple.medium!

function clues(puzzle: VariantPuzzle) {
  return (puzzle.rules ?? []).map(rule => {
    assert.equal(rule.type, 'quadruple')
    return rule
  })
}

function gameOf(value: GeneratedVariant, id: string): Game {
  return {
    ...makeGame(id, 'Quadruple', value.puzzle.givens, 'generated'),
    variant: { id: 'quadruple', puzzle: value.puzzle, solution: value.solution },
    difficulty: 'medium', score: value.rating.points,
  }
}

function verify(value: GeneratedVariant) {
  assert.deepEqual(value.rating.status, { solved: 'medium' })
  assert.equal(value.rating.scoringVersion, 22)
  assert.ok(value.rating.counts.quadruple > 0)
  assert.ok(value.givens >= 16 && value.givens <= 30)
  assertVariantCompletion(value.puzzle, value.solution)
  const unique = countLineSolutions(value.puzzle)
  assert.equal(unique.count, 1)
  assert.equal(unique.solution, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('all thirty Medium recipes preserve the circle layout and require Quadruple for uniqueness', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  assert.equal(catalog.techniques.find(technique => technique.id === 'quadruple')?.cost, 27)
  const order = await getVariantPlayOrder()
  const completions = new Set<string>()
  let repeated = 0
  assert.equal(recipes.length, 30)
  for (const recipe of recipes) {
    const request = variantGenerationRequest('quadruple', 'medium', recipe, order)
    const value = await runEngine({ ...request, maxAttempts: 1, maxNodes: 20_000 })
    verify(value)
    assert.deepEqual(clues(value.puzzle).map(({ topLeft, digits }) => ({ topLeft, clueSize: digits.length })), recipe.quadruples)
    completions.add(value.solution)
    if (clues(value.puzzle).some(({ digits }) => new Set(digits).size < digits.length)) repeated++
  }
  assert.equal(completions.size, 30)
  assert.equal(repeated, 20)
  for (const difficulty of ['easy', 'hard'] as const) {
    await assert.rejects(generatePlayableVariant('quadruple', difficulty, 1, []),
      error => error instanceof EngineError && error.code === 'unsupported')
  }
})

test('Quadruple New Puzzle supports several hints, Technique Finder and complete logical replay', async () => {
  const games: Game[] = []
  const seen = new Set<string>()
  for (let seed = 1; seed <= 30; seed++) {
    const value = await generatePlayableVariant('quadruple', 'medium', seed, games)
    verify(value)
    const identity = JSON.stringify(value.puzzle)
    assert.ok(!seen.has(identity))
    seen.add(identity)
    const game = gameOf(value, `quadruple-${seed}`)
    games.push(game)

    const ranked = await puzzleHints(game)
    assert.ok(ranked.choices.length > 1 && ranked.choices.length <= 10)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: value.puzzle },
      techniqueOrder: value.rating.techniqueOrder })
    assert.deepEqual(trace.rating, value.rating)
    if (seed === 1) {
      const selected = await puzzleHints(game, 'all', 'quadruple')
      assert.ok(selected.choices.length)
      for (const hint of selected.choices) {
        assert.ok('variant' in hint.evidence)
        assert.ok(hint.evidence.variant.source)
      }
      const actions = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant!, game.position))
      try { assert.equal(await scan.count('quadruple'), actions.size) } finally { scan.close() }
    }
    let played = game
    for (const step of trace.steps) {
      for (const action of step.actions) {
        const { cell, digit } = 'place' in action ? action.place : action.eliminate
        assert.equal(value.solution[cell] === String(digit), 'place' in action)
      }
      const next = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
      assert.notEqual(next, played)
      played = next
    }
    assert.ok(isSolved(played))
    assert.equal(valuesOf(played), value.solution)
    assert.equal((await puzzleSolution(game)).board, value.solution)
  }
})

const rename = (digit: number) => digit ? digit % 9 + 1 : 0
const renameBoard = (grid: string) => [...grid].map(digit => rename(Number(digit))).join('')

test('layered circles and digit relabeling exclude played repeats under square symmetries', async () => {
  const request = { ...variantGenerationRequest('quadruple', 'medium', recipes[0], await getVariantPlayOrder()),
    maxAttempts: 1, maxNodes: 20_000 }
  const first = await runEngine(request)
  const rules = clues(first.puzzle)
  const target = rules.find(rule => new Set(rule.digits).size > 1 && new Set(rule.digits).size < rule.digits.length)
  assert.ok(target)
  const layered = rules.flatMap(rule => rule === target
    ? [...new Set(rule.digits)].map(digit => ({ ...rule, digits: rule.digits.filter(value => value === digit) }))
    : [rule])
  layered.push({ ...target, digits: [target.digits[0]] })
  const renamed = {
    ...first.puzzle, givens: renameBoard(first.puzzle.givens),
    rules: rules.map(rule => ({ ...rule, digits: rule.digits.map(rename).reverse() })),
  }
  for (const [before, solution] of [[{ ...first.puzzle, rules: layered.reverse() }, first.solution],
    [renamed, renameBoard(first.solution)]] as const) {
    for (const symmetry of [0, 1, 3, 7]) {
      const prior = reflectVariant(before, symmetry)
      const counted = countLineSolutions(prior)
      assert.equal(counted.count, 1)
      assert.equal(counted.solution, transformedBoard(solution, symmetry))
      try {
        const next = await runEngine({ ...request, exclude: [prior] })
        assert.notDeepEqual(next.puzzle, first.puzzle)
      } catch (error) {
        if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
      }
    }
  }
  const value = await generatePlayableVariant('quadruple', 'medium', 1, [])
  const played = { ...value, solution: renameBoard(value.solution), puzzle: {
    ...value.puzzle, givens: renameBoard(value.puzzle.givens),
    rules: clues(value.puzzle).map(rule => ({ ...rule, digits: rule.digits.map(rename) })),
  } }
  const next = await generatePlayableVariant('quadruple', 'medium', 1, [gameOf(played, 'played-quadruple')])
  assert.notDeepEqual(next.puzzle, value.puzzle)
  verify(next)
})

test('Quadruple uses the checked fallback when the fresh attempt hits its search limit', async () => {
  const seed = 111
  const recipe = recipes[seed % recipes.length]
  const order = await getVariantPlayOrder()
  const fresh = variantGenerationRequest('quadruple', 'medium', recipe, order, seed)
  await assert.rejects(runEngine({ ...fresh, maxNodes: 20_000 }),
    error => error instanceof EngineError && error.code === 'search-limit')
  const result = await generatePlayableVariant('quadruple', 'medium', seed, [])
  verify(result)
  assert.deepEqual(result, await runEngine(variantGenerationRequest('quadruple', 'medium', recipe, order)))
})

test('generated repeated circles, rating and progress survive save and starting-puzzle sharing', async () => {
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
    const path = '../src/sudoku/storage.ts?quadruple-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const value = await runEngine(variantGenerationRequest('quadruple', 'medium', recipes[0], await getVariantPlayOrder()))
    assert.ok(clues(value.puzzle).some(({ digits }) => new Set(digits).size < digits.length))
    const game = gameOf(value, 'quadruple-generated')
    roomStore.add(game)
    const cell = game.givens.indexOf('0')
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(value.solution[cell])))
    const reload = '../src/sudoku/storage.ts?quadruple-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)
    assert.ok(restored)
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
