import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, playCandidates, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { runEngine, EngineError, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantIdForPuzzle, type PlayableVariant } from '../src/sudoku/variants.ts'
import { makeGame, type Game } from '../src/sudoku/game.ts'
import { countLineSolutions } from '../tests/helpers/line-oracle.ts'
import { renbanKey } from '../tests/helpers/renban-key.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-renban-generation.mts.
// Assertions stay outside timing. This transport excludes worker startup and browser rendering.
useWasmWorker()
test('measure published Renban callers and actual Medium New Puzzle generation', async () => {
  const bytes = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
    engine: createHash('sha256').update(bytes).digest('hex'), rawBytes: bytes.length,
    method: '5 warmups/40 samples; independent assertions outside timing; in-process transport, no owned compiler/suite/other benchmark alongside; ordinary hints only, no exhaustive all-technique scan or browser startup/layout/paint.' }))
  async function sample<T>(name: string, run: () => Promise<T>, check: (result: T) => void) {
    const times: number[] = []
    for (let i = 0; i < 45; i++) {
      const start = performance.now(), result = await run(), elapsed = performance.now() - start
      check(result)
      if (i >= 5) times.push(elapsed)
    }
    times.sort((a, b) => a - b)
    console.log(JSON.stringify({ name, medianP95: [0.5, 0.95].map(q => Number(times[Math.ceil(q * times.length) - 1].toFixed(3))) }))
  }
  const source = JSON.parse(readFileSync(new URL('../tests/fixtures/renban-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
  const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(source.puzzle), puzzle: source.puzzle }))
  const { game } = await prepareImportedPuzzle(share), techniqueOrder = await getVariantPlayOrder()
  await sample('published preview', () => prepareImportedPuzzle(share), value => assert.equal(value.game.variant?.solution, source.solution))
  await sample('published candidates', () => playCandidates(game), value => assert.equal(value?.length, 81))
  await sample('published ordinary hints', () => puzzleHints(game), value => assert.ok(value.choices.length > 1))
  await sample('published app rate', () => runEngine({ type: 'variant', operation: 'rate', position: { puzzle: source.puzzle }, techniqueOrder }), value => assert.notEqual(value.status, 'stalled'))
  await sample('published exact solve', () => runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle } }), value => assert.equal(value, source.solution))
  await sample('published walkthrough', () => puzzleSolution(game), value => assert.equal(value.board, source.solution))
  function checkGenerated(value: GeneratedVariant) {
    assert.deepEqual(value.rating.status, { solved: 'medium' }); assert.equal(value.rating.scoringVersion, 8)
    assert.ok(value.rating.counts.renban); assert.ok(value.givens >= 14 && value.givens <= 20)
    assert.ok(value.puzzle.rules!.every(rule => rule.type === 'renban'))
    const independent = countLineSolutions(value.puzzle)
    assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
    assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
  }
  let seed = 0
  const distinct = new Set<string>()
  await sample('actual Medium New Puzzle', () => generatePlayableVariant('renban', 'medium', ++seed, []), value => {
    checkGenerated(value); distinct.add(renbanKey(value.puzzle))
  })
  console.log(JSON.stringify({ seeds: 45, distinct: distinct.size, playedHistory: 0 }))
  const fresh = variantGenerationRequest('renban', 'medium', variantSeeds.renban.medium![11], techniqueOrder, 11)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  await sample('Medium fresh miss and checked fallback', () => generatePlayableVariant('renban', 'medium', 11, []), checkGenerated)
  const previous: Game[] = [], played = new Set<string>()
  for (let n = 1; n <= 30; n++) {
    const value = await generatePlayableVariant('renban', 'medium', n, previous)
    const key = renbanKey(value.puzzle); assert.ok(!played.has(key)); played.add(key)
    previous.push({ ...makeGame('renban-' + n, 'Renban Lines', value.puzzle.givens, 'generated'),
      variant: { id: 'renban', puzzle: value.puzzle, solution: value.solution } })
  }
  await sample('Medium with thirty played puzzles', () => generatePlayableVariant('renban', 'medium', 99, previous), value => {
    checkGenerated(value); assert.ok(!played.has(renbanKey(value.puzzle)))
  })
  const mixed = [...previous]
  const groups: [PlayableVariant, 'easy' | 'medium', number?][] = [
    ['modular', 'medium'], ['entropic', 'medium'], ['global-entropy', 'easy'], ['global-entropy', 'medium'],
    ['palindrome', 'easy'], ['palindrome', 'medium'], ['whispers', 'medium', 5], ['whispers', 'medium', 4], ['parity', 'medium'],
  ]
  for (const [family, difficulty, gap] of groups) {
    const recipes = variantSeeds[family][difficulty]!.filter(recipe => gap === undefined || recipe.minDifference === gap).slice(0, 30)
    assert.equal(recipes.length, 30)
    for (const recipe of recipes) {
      const value = await runEngine(variantGenerationRequest(family, difficulty, recipe, techniqueOrder))
      const id = variantIdForPuzzle(value.puzzle); assert.ok(id !== 'classic')
      mixed.push({ ...makeGame('mixed-history-' + mixed.length, 'Saved puzzle', value.puzzle.givens, 'generated'),
        variant: { id, puzzle: value.puzzle, solution: value.solution } })
    }
  }
  assert.equal(mixed.length, 300)
  await sample('Medium with three hundred mixed played puzzles', () => generatePlayableVariant('renban', 'medium', 99, mixed), value => {
    checkGenerated(value); assert.ok(!played.has(renbanKey(value.puzzle)))
  })
})
