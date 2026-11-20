import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant } from '../src/sudoku/engine.ts'
import { makeGame, type Game } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates } from '../src/sudoku/variant-play.ts'
import { variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantIdForPuzzle, type PlayableVariant } from '../src/sudoku/variants.ts'
import { comparisonKey } from '../tests/helpers/comparison-key.ts'
import { countLineSolutions } from '../tests/helpers/line-oracle.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-inequality-generation.mts.
useWasmWorker()
test('measure actual Inequality generation, play callers and growing history', async () => {
  const bytes = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
    engine: createHash('sha256').update(bytes).digest('hex'), rawBytes: bytes.length,
    method: '5 warmups/40 samples; independent assertions outside timing; no owned compiler/suite/other runtime benchmark alongside. In-process worker adapter excludes startup, transfers and browser layout/paint. Ordinary hints only.' }))
  async function sample<T>(name: string, run: () => Promise<T>, check: (value: T) => void) {
    const times: number[] = []
    for (let round = 0; round < 45; round++) {
      const start = performance.now(), value = await run(), elapsed = performance.now() - start
      check(value); if (round >= 5) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ name, medianP95: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))) }))
  }
  const order = await getVariantPlayOrder()
  function verify(value: GeneratedVariant, difficulty: 'easy' | 'medium') {
    assert.deepEqual(value.rating.status, { solved: difficulty }); assert.equal(value.rating.scoringVersion, 8)
    assert.ok(value.rating.counts.inequality)
    const truth = countLineSolutions(value.puzzle)
    assert.equal(truth.count, 1); assert.equal(truth.solution, value.solution)
    assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
  }
  function gameOf(value: GeneratedVariant, id: string): Game {
    const family = variantIdForPuzzle(value.puzzle); assert.ok(family !== 'classic')
    return { ...makeGame(id, 'Generated puzzle', value.puzzle.givens, 'generated'), variant: { id: family, puzzle: value.puzzle, solution: value.solution } }
  }
  for (const difficulty of ['easy', 'medium'] as const) {
    const example = await generatePlayableVariant('inequality', difficulty, 8, []), game = gameOf(example, difficulty)
    const link = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'inequality', puzzle: example.puzzle }))
    await sample(difficulty + ' preview', () => prepareImportedPuzzle(link), value => assert.equal(value.game.variant!.solution, example.solution))
    await sample(difficulty + ' candidates', () => playCandidates(game), value => assert.equal(value!.length, 81))
    await sample(difficulty + ' ordinary hints', () => puzzleHints(game), value => assert.ok(value.choices.length > 1))
    await sample(difficulty + ' rating', () => runEngine({ type: 'variant', operation: 'rate', position: { puzzle: example.puzzle }, techniqueOrder: order }), value => assert.deepEqual(value.status, { solved: difficulty }))
    await sample(difficulty + ' exact solve', () => runEngine({ type: 'variant', operation: 'solve', position: { puzzle: example.puzzle } }), value => assert.equal(value, example.solution))
    await sample(difficulty + ' walkthrough', () => puzzleSolution(game), value => assert.equal(value.board, example.solution))
    let seed = 0
    const distinct = new Set<string>()
    await sample(difficulty + ' actual New Puzzle', () => generatePlayableVariant('inequality', difficulty, ++seed, []), value => {
      verify(value, difficulty); distinct.add(comparisonKey(value.puzzle))
    })
    console.log(JSON.stringify({ difficulty, requests: 45, emptyHistoryDistinct: distinct.size }))
    const miss = difficulty === 'easy' ? 7 : 17, recipes = variantSeeds.inequality[difficulty]!
    const fresh = variantGenerationRequest('inequality', difficulty, recipes[miss % recipes.length], order, miss); fresh.maxNodes = 20_000
    await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
    await sample(difficulty + ' fresh miss and checked fallback', () => generatePlayableVariant('inequality', difficulty, miss, []), value => verify(value, difficulty))
    const history: Game[] = [], played = new Set<string>()
    for (let n = 1; n <= 30; n++) {
      const value = await generatePlayableVariant('inequality', difficulty, n, history), key = comparisonKey(value.puzzle)
      assert.ok(!played.has(key)); played.add(key); history.push(gameOf(value, difficulty + n))
    }
    await sample(difficulty + ' thirty played puzzles', () => generatePlayableVariant('inequality', difficulty, 99, history), value => {
      verify(value, difficulty); assert.ok(!played.has(comparisonKey(value.puzzle)))
    })
    const mixed = [...history]
    const groups: [PlayableVariant, 'easy' | 'medium', number?][] = [
      ['renban', 'medium'], ['modular', 'medium'], ['entropic', 'medium'], ['global-entropy', 'easy'], ['global-entropy', 'medium'],
      ['palindrome', 'easy'], ['palindrome', 'medium'], ['whispers', 'medium', 5], ['whispers', 'medium', 4],
    ]
    for (const [family, level, gap] of groups) {
      const recipes = variantSeeds[family][level]!.filter(recipe => gap === undefined || recipe.minDifference === gap).slice(0, 30)
      assert.equal(recipes.length, 30)
      for (const recipe of recipes) mixed.push(gameOf(await runEngine(variantGenerationRequest(family, level, recipe, order)), 'mixed' + mixed.length))
    }
    assert.equal(mixed.length, 300)
    await sample(difficulty + ' three hundred mixed played puzzles', () => generatePlayableVariant('inequality', difficulty, 99, mixed), value => {
      verify(value, difficulty); assert.ok(!played.has(comparisonKey(value.puzzle)))
    })
  }
})
