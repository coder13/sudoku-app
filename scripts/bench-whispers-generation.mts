import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, playCandidates, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { runEngine, EngineError, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { generationRulesets } from '../src/sudoku/variant-rulesets.ts'
import { makeGame, type Game } from '../src/sudoku/game.ts'
import { countWhispersSolutions } from '../tests/helpers/whispers-oracle.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-whispers-generation.mts.
// Assertions stay outside timing. The adapter excludes worker startup/transfers and browser rendering.
useWasmWorker()
test('measure published Whispers callers and both actual New Puzzle rulesets', async () => {
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
  const source = JSON.parse(readFileSync(new URL('../tests/fixtures/whispers-brain-zaps.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
  const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'whispers', puzzle: source.puzzle }))
  const { game } = await prepareImportedPuzzle(share), techniqueOrder = await getVariantPlayOrder()
  await sample('published preview', () => prepareImportedPuzzle(share), value => assert.equal(value.game.variant?.solution, source.solution))
  await sample('published candidates', () => playCandidates(game), value => assert.equal(value?.length, 81))
  await sample('published ordinary hints', () => puzzleHints(game), value => assert.ok(value.choices.length > 1))
  await sample('published app rate', () => runEngine({ type: 'variant', operation: 'rate', position: { puzzle: source.puzzle }, techniqueOrder }), value => assert.notEqual(value.status, 'stalled'))
  await sample('published exact solve', () => runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle } }), value => assert.equal(value, source.solution))
  await sample('published walkthrough', () => puzzleSolution(game), value => assert.equal(value.board, source.solution))
  function checkGenerated(value: GeneratedVariant, gap: number) {
    assert.deepEqual(value.rating.status, { solved: 'medium' })
    assert.equal(value.rating.scoringVersion, 8)
    assert.ok(value.rating.counts.whispers || value.rating.counts['whispers-house-support'])
    assert.ok(value.givens <= 20)
    assert.equal(value.puzzle.rules?.length, 4)
    assert.ok(value.puzzle.rules!.every(rule => rule.type === 'whispers' && rule.minDifference === gap))
    const independent = countWhispersSolutions(value.puzzle)
    assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
    assert.equal(countWhispersSolutions({ ...value.puzzle, rules: [] }).count, 2)
  }
  for (const preset of generationRulesets('whispers')) {
    let seed = 0
    const distinct = new Set<string>(), options = { ruleset: preset.id }
    await sample(`actual ${preset.name} New Puzzle`, () => generatePlayableVariant('whispers', 'medium', ++seed, [], options), value => {
      checkGenerated(value, preset.minDifference); distinct.add(value.puzzle.givens)
    })
    console.log(JSON.stringify({ ruleset: preset.id, seeds: 45, distinct: distinct.size, playedHistory: 0 }))
    const miss = preset.id === 'german' ? 1 : 6
    const recipes = variantSeeds.whispers.medium!.filter(recipe => recipe.minDifference === preset.minDifference)
    const fresh = variantGenerationRequest('whispers', 'medium', recipes[miss % recipes.length], techniqueOrder, miss)
    fresh.maxNodes = 20_000
    await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
    await sample(`${preset.name} fresh miss and fallback`, () => generatePlayableVariant('whispers', 'medium', miss, [], options), value => checkGenerated(value, preset.minDifference))
    const previous: Game[] = []
    for (let n = 1; n <= 30; n++) {
      const value = await generatePlayableVariant('whispers', 'medium', n, previous, options)
      previous.push({ ...makeGame(preset.id + n, preset.name, value.puzzle.givens, 'generated'),
        variant: { id: 'whispers', puzzle: value.puzzle, solution: value.solution } })
    }
    await sample(`${preset.name} with thirty played puzzles`, () => generatePlayableVariant('whispers', 'medium', 99, previous, options), value => {
      checkGenerated(value, preset.minDifference)
      assert.ok(previous.every(game => game.givens !== value.puzzle.givens))
    })
  }
})
