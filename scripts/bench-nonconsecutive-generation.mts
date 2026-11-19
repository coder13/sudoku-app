import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, playCandidates, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { runEngine, EngineError, type Difficulty, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { countCellRuleSolutions } from '../tests/helpers/cell-rule-oracle.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-nonconsecutive-generation.mts.
// Independent assertions stay outside the timer. Transport excludes real worker startup/transfers.
useWasmWorker()
test('measure published Non-Consecutive app callers and actual Easy/Medium New Puzzle', async () => {
  const bytes = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
  console.log(JSON.stringify({ host: `${process.platform} ${process.arch}`, node: process.version,
    engine: createHash('sha256').update(bytes).digest('hex'), rawBytes: bytes.length,
    method: '5 warmups/40 samples, assertions outside timing, in-process transport; no compiler/suite/other benchmark alongside. New Puzzle uses empty played history. No browser startup/layout/paint or full all-technique exhaustive scan is measured.' }))
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
  const source = JSON.parse(readFileSync(new URL('../tests/fixtures/nonconsecutive-newman.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
  const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'non-consecutive', puzzle: source.puzzle }))
  const { game } = await prepareImportedPuzzle(share), techniqueOrder = await getVariantPlayOrder()
  await sample('published preview', () => prepareImportedPuzzle(share), value => assert.equal(value.game.variant?.solution, source.solution))
  await sample('published candidates', () => playCandidates(game), value => assert.equal(value?.length, 81))
  await sample('published ordinary hints', () => puzzleHints(game), value => assert.ok(value.choices.length > 1))
  await sample('published app rate', () => runEngine({ type: 'variant', operation: 'rate', position: { puzzle: source.puzzle }, techniqueOrder }), value => assert.notEqual(value.status, 'stalled'))
  await sample('published exact solve', () => runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle } }), value => assert.equal(value, source.solution))
  await sample('published walkthrough', () => puzzleSolution(game), value => assert.equal(value.board, source.solution))
  function checkGenerated(value: GeneratedVariant, difficulty: Difficulty) {
    assert.deepEqual(value.rating.status, { solved: difficulty })
    assert.equal(value.rating.scoringVersion, 8)
    assert.ok(value.rating.counts['non-consecutive'])
    assert.ok(value.givens >= (difficulty === 'medium' ? 14 : 0) && value.givens <= (difficulty === 'medium' ? 20 : 30))
    const independent = countCellRuleSolutions(value.puzzle)
    assert.equal(independent.count, 1)
    assert.equal(independent.solution, value.solution)
    assert.equal(countCellRuleSolutions({ ...value.puzzle, rules: [] }).count, 2)
  }
  for (const difficulty of ['easy', 'medium'] as const) {
    let seed = 0
    const distinct = new Set<string>()
    await sample(`actual ${difficulty} New Puzzle`, () => generatePlayableVariant('non-consecutive', difficulty, ++seed, []), value => {
      checkGenerated(value, difficulty)
      distinct.add(value.puzzle.givens)
    })
    console.log(JSON.stringify({ difficulty, seeds: 45, distinct: distinct.size, playedHistory: 0 }))
  }
  const fresh = variantGenerationRequest('non-consecutive', 'medium', variantSeeds['non-consecutive'].medium![1], techniqueOrder, 1)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  await sample('actual Medium fresh miss and fallback', () => generatePlayableVariant('non-consecutive', 'medium', 1, []), value => checkGenerated(value, 'medium'))
})
