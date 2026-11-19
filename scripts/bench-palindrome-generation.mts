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
import { palindromeKey } from '../tests/helpers/palindrome-key.ts'
import { useWasmWorker } from '../tests/helpers/wasm-worker.ts'

// Run alone: node --experimental-strip-types --test scripts/bench-palindrome-generation.mts.
// Assertions stay outside timing. The adapter excludes worker startup/transfers and browser rendering.
useWasmWorker()
test('measure published Palindrome callers and both actual New Puzzle levels', async () => {
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
  const source = JSON.parse(readFileSync(new URL('../tests/fixtures/palindrome-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
  const share = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'palindrome', puzzle: source.puzzle }))
  const { game } = await prepareImportedPuzzle(share), techniqueOrder = await getVariantPlayOrder()
  await sample('published preview', () => prepareImportedPuzzle(share), value => assert.equal(value.game.variant?.solution, source.solution))
  await sample('published candidates', () => playCandidates(game), value => assert.equal(value?.length, 81))
  await sample('published ordinary hints', () => puzzleHints(game), value => assert.ok(value.choices.length > 1))
  await sample('published app rate', () => runEngine({ type: 'variant', operation: 'rate', position: { puzzle: source.puzzle }, techniqueOrder }), value => assert.notEqual(value.status, 'stalled'))
  await sample('published exact solve', () => runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle } }), value => assert.equal(value, source.solution))
  await sample('published walkthrough', () => puzzleSolution(game), value => assert.equal(value.board, source.solution))
  function checkGenerated(value: GeneratedVariant, difficulty: 'easy' | 'medium') {
    assert.deepEqual(value.rating.status, { solved: difficulty })
    assert.equal(value.rating.scoringVersion, 8)
    assert.ok(value.rating.counts.palindrome)
    assert.ok(value.givens >= (difficulty === 'medium' ? 14 : 0) && value.givens <= (difficulty === 'medium' ? 24 : 30))
    assert.ok(value.puzzle.rules!.every(rule => rule.type === 'palindrome'))
    const independent = countLineSolutions(value.puzzle)
    assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
    assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
  }
  for (const difficulty of ['easy', 'medium'] as const) {
    let seed = 0
    const distinct = new Set<string>()
    await sample(`actual ${difficulty} New Puzzle`, () => generatePlayableVariant('palindrome', difficulty, ++seed, []), value => {
      checkGenerated(value, difficulty); distinct.add(palindromeKey(value.puzzle))
    })
    console.log(JSON.stringify({ difficulty, seeds: 45, distinct: distinct.size, playedHistory: 0 }))
    if (difficulty === 'medium') {
      const miss = 2, recipe = variantSeeds.palindrome.medium![miss]
      const fresh = variantGenerationRequest('palindrome', difficulty, recipe, techniqueOrder, miss)
      fresh.maxNodes = 20_000
      await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
      await sample('Medium fresh miss and fallback', () => generatePlayableVariant('palindrome', difficulty, miss, []), value => checkGenerated(value, difficulty))
    }
    const previous: Game[] = [], played = new Set<string>()
    for (let n = 1; n <= 30; n++) {
      const value = await generatePlayableVariant('palindrome', difficulty, n, previous)
      const key = palindromeKey(value.puzzle); assert.ok(!played.has(key)); played.add(key)
      previous.push({ ...makeGame(difficulty + n, 'Palindrome', value.puzzle.givens, 'generated'),
        variant: { id: 'palindrome', puzzle: value.puzzle, solution: value.solution } })
    }
    await sample(`${difficulty} with thirty played puzzles`, () => generatePlayableVariant('palindrome', difficulty, 99, previous), value => {
      checkGenerated(value, difficulty); assert.ok(!played.has(palindromeKey(value.puzzle)))
    })
  }
})
