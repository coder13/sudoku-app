import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, playCandidates, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { runEngine, EngineError, type GeneratedVariant, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { makeGame, type Game } from '../src/sudoku/game.ts'
import { countLineSolutions } from '../tests/helpers/line-oracle.ts'
import { entropicKey } from '../tests/helpers/entropic-key.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-entropic-generation.mts.
// Assertions stay outside timing. This transport excludes worker startup and browser rendering.
useWasmWorker()
test('measure published Entropic callers and actual Medium New Puzzle generation', async () => {
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
  const source = JSON.parse(readFileSync(new URL('../tests/fixtures/entropic-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
  const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'entropic', puzzle: source.puzzle }))
  const { game } = await prepareImportedPuzzle(share), techniqueOrder = await getVariantPlayOrder()
  await sample('published preview', () => prepareImportedPuzzle(share), value => assert.equal(value.game.variant?.solution, source.solution))
  await sample('published candidates', () => playCandidates(game), value => assert.equal(value?.length, 81))
  await sample('published ordinary hints', () => puzzleHints(game), value => assert.ok(value.choices.length > 1))
  await sample('published app rate', () => runEngine({ type: 'variant', operation: 'rate', position: { puzzle: source.puzzle }, techniqueOrder }), value => assert.notEqual(value.status, 'stalled'))
  await sample('published exact solve', () => runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle } }), value => assert.equal(value, source.solution))
  await sample('published walkthrough', () => puzzleSolution(game), value => assert.equal(value.board, source.solution))
  function checkGenerated(value: GeneratedVariant) {
    assert.deepEqual(value.rating.status, { solved: 'medium' }); assert.equal(value.rating.scoringVersion, 8)
    assert.ok(value.rating.counts.entropic); assert.ok(value.givens >= 14 && value.givens <= 20)
    assert.ok(value.puzzle.rules!.every(rule => rule.type === 'entropic'))
    const independent = countLineSolutions(value.puzzle)
    assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
    assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
  }
  let seed = 0
  const distinct = new Set<string>()
  await sample('actual Medium New Puzzle', () => generatePlayableVariant('entropic', 'medium', ++seed, []), value => {
    checkGenerated(value); distinct.add(entropicKey(value.puzzle))
  })
  console.log(JSON.stringify({ seeds: 45, distinct: distinct.size, playedHistory: 0 }))
  const fresh = variantGenerationRequest('entropic', 'medium', variantSeeds.entropic.medium![12], techniqueOrder, 42)
  fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  await sample('Medium fresh miss and checked fallback', () => generatePlayableVariant('entropic', 'medium', 42, []), checkGenerated)
  const previous: Game[] = [], played = new Set<string>()
  for (let n = 1; n <= 30; n++) {
    const value = await generatePlayableVariant('entropic', 'medium', n, previous)
    const key = entropicKey(value.puzzle); assert.ok(!played.has(key)); played.add(key)
    previous.push({ ...makeGame('entropic-' + n, 'Entropic Lines', value.puzzle.givens, 'generated'),
      variant: { id: 'entropic', puzzle: value.puzzle, solution: value.solution } })
  }
  await sample('Medium with thirty played puzzles', () => generatePlayableVariant('entropic', 'medium', 99, previous), value => {
    checkGenerated(value); assert.ok(!played.has(entropicKey(value.puzzle)))
  })
})
