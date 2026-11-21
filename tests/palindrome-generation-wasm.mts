import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EngineError, runEngine, type GeneratedVariant, type VariantRule, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf, type Game } from '../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { assertPalindromeProof } from './helpers/palindrome-truth.ts'
import { palindromeGroups, palindromeKey } from './helpers/palindrome-key.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const geometry = JSON.parse(readFileSync(new URL('./fixtures/palindrome-generation.json', import.meta.url), 'utf8')) as { patterns: { name: string; lines: number[][] }[] }
function gameOf(result: GeneratedVariant, id = 'palindrome-generated'): Game {
  return { ...makeGame(id, 'Palindrome', result.puzzle.givens, 'generated'),
    variant: { id: 'palindrome', puzzle: result.puzzle, solution: result.solution } }
}
function verify(value: GeneratedVariant, difficulty: 'easy' | 'medium') {
  assert.ok(value.puzzle.rules!.every(rule => rule.type === 'palindrome'))
  assert.ok(geometry.patterns.some(pattern => JSON.stringify(pattern.lines) === JSON.stringify(value.puzzle.rules!.map(rule => rule.type === 'palindrome' ? rule.cells : []))))
  assert.deepEqual(value.rating.status, { solved: difficulty }); assert.equal(value.rating.scoringVersion, 10)
  assert.ok(value.rating.counts.palindrome)
  assert.ok(value.givens >= (difficulty === 'medium' ? 14 : 0) && value.givens <= (difficulty === 'medium' ? 24 : 30))
  const independent = countLineSolutions(value.puzzle)
  assert.equal(independent.count, 1); assert.equal(independent.solution, value.solution)
  assertVariantCompletion(value.puzzle, value.solution)
  assert.equal(countLineSolutions({ ...value.puzzle, rules: [] }).count, 2)
}

test('all sixty checked recipes retain complete geometry, independent dependence and the 21-point Easy rule', async () => {
  for (const pattern of geometry.patterns) {
    const source = JSON.parse(readFileSync(new URL(`./fixtures/palindrome-${pattern.name}.json`, import.meta.url), 'utf8')) as { puzzle: VariantPuzzle }
    assert.deepEqual(pattern.lines, source.puzzle.rules!.flatMap(rule => rule.type === 'palindrome' ? [rule.cells] : []))
  }
  const catalog = await runEngine({ type: 'techniques', variant: true }), technique = catalog.techniques.find(item => item.id === 'palindrome')!
  assert.equal(technique.cost, 21); assert.equal(technique.difficulty, 'easy'); assert.equal(technique.requiresUniqueSolution, false)
  for (const difficulty of ['easy', 'medium'] as const) {
    const recipes = variantSeeds.palindrome[difficulty]!
    assert.equal(recipes.length, 30)
    const distinct = new Set<string>()
    for (const recipe of recipes) {
      const request = variantGenerationRequest('palindrome', difficulty, recipe, await getVariantPlayOrder()); request.maxNodes = 20_000
      const value = await runEngine(request); verify(value, difficulty); distinct.add(palindromeKey(value.puzzle))
    }
    assert.equal(distinct.size, 30)
  }
})
for (const difficulty of ['easy', 'medium'] as const) test(`actual ${difficulty} Palindrome New Puzzle gives thirty distinct dependent puzzles with several hints and complete independent replay`, async () => {
  const previous: Game[] = [], seen = new Set<string>()
  for (let seed = 1; seed <= 30; seed++) {
    const value = await generatePlayableVariant('palindrome', difficulty, seed, previous)
    verify(value, difficulty); assert.equal(variantIdForPuzzle(value.puzzle), 'palindrome')
    const key = palindromeKey(value.puzzle); assert.ok(!seen.has(key)); seen.add(key)
    const game = gameOf(value, difficulty + seed), hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1 && hints.choices.length <= 10)
    for (const hint of hints.choices) for (const action of hint.actions) {
      if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
      else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
    }
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: value.puzzle }, techniqueOrder: await getVariantPlayOrder() })
    assert.equal(trace.rating.points, value.rating.points); assert.equal(trace.rating.hardest, value.rating.hardest)
    assert.deepEqual(trace.rating.counts, value.rating.counts); assert.deepEqual(trace.rating.status, value.rating.status)
    let played = game
    for (const step of trace.steps) {
      if (step.technique === 'palindrome') assertPalindromeProof({ puzzle: value.puzzle, entries: played.position.entries, eliminations: played.position.eliminations }, step)
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(value.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(value.solution[action.eliminate.cell]))
      }
      played = applyDeduction(played, step.actions, variantHouseMasks(value.puzzle, valuesOf(played)))
    }
    assert.ok(isSolved(played)); assert.equal(valuesOf(played), value.solution); previous.push(game)
  }
  assert.equal(seen.size, 30)
})

test('generation is deterministic and Medium reaches its checked fallback after a fresh miss', async () => {
  const recipe = variantSeeds.palindrome.medium![2], order = await getVariantPlayOrder()
  const fresh = variantGenerationRequest('palindrome', 'medium', recipe, order, 2); fresh.maxNodes = 20_000
  await assert.rejects(runEngine(fresh), error => error instanceof EngineError && error.code === 'search-limit')
  const fallback = await runEngine(variantGenerationRequest('palindrome', 'medium', recipe, order))
  assert.deepEqual(await generatePlayableVariant('palindrome', 'medium', 2, []), fallback)
  for (const difficulty of ['easy', 'medium'] as const)
    assert.deepEqual(await generatePlayableVariant('palindrome', difficulty, 8, []), await generatePlayableVariant('palindrome', difficulty, 8, []))
})

test('actual exclusions retain all symmetries, digit renamings, reversed and split mirrors, free centers and alternative drawings', async () => {
  for (const difficulty of ['easy', 'medium'] as const) {
    const value = await generatePlayableVariant('palindrome', difficulty, 4, []), original = value.puzzle
    const equivalents = Array.from({ length: 8 }, (_, symmetry) => ({ puzzle: reflectVariant(original, symmetry), solution: transformedBoard(value.solution, symmetry) }))
    const rename = (board: string) => [...board].map(digit => digit === '0' ? digit : String(10 - Number(digit))).join('')
    equivalents.push(...equivalents.map(({ puzzle, solution }) => ({ puzzle: { ...puzzle, givens: rename(puzzle.givens) }, solution: rename(solution) })))
    const split = original.rules!.flatMap<VariantRule>(rule => rule.type === 'palindrome'
      ? Array.from({ length: Math.floor(rule.cells.length / 2) }, (_, i) => ({ type: 'palindrome', cells: [rule.cells[i], rule.cells[rule.cells.length - 1 - i]] })) : [rule])
    for (const rules of [
      [...original.rules!].reverse().map(rule => rule.type === 'palindrome' ? { ...rule, cells: [...rule.cells].reverse() } : rule),
      split, [...split, ...split],
      original.rules!.map(rule => rule.type === 'palindrome' ? { ...rule, segments: rule.cells.length === 2 ? [[...rule.cells]] :
        [rule.cells.slice(0, Math.floor(rule.cells.length / 2) + 1), rule.cells.slice(Math.floor(rule.cells.length / 2))] } : rule),
      original.rules!.map((rule, i) => rule.type === 'palindrome' && i === 0 ? { ...rule, cells: [
        ...rule.cells.slice(0, rule.cells.length / 2), Array.from({ length: 81 }, (_, cell) => cell).find(cell => !rule.cells.includes(cell))!, ...rule.cells.slice(rule.cells.length / 2),
      ] } : rule),
    ]) equivalents.push({ puzzle: { ...original, rules }, solution: value.solution })
    for (const { puzzle, solution } of equivalents) {
      assert.equal(palindromeKey(puzzle), palindromeKey(original)); assertVariantCompletion(puzzle, solution)
      const prior = { ...makeGame('palindrome-alias', 'Palindrome', puzzle.givens, 'imported'), variant: { id: 'mixed' as const, puzzle, solution } }
      const next = await generatePlayableVariant('palindrome', difficulty, 4, [prior])
      verify(next, difficulty); assert.notEqual(palindromeKey(next.puzzle), palindromeKey(original))
    }
  }
})

test('native generation excludes the archived reversed and split counterexamples and equivalent Clone groups', async () => {
  for (const pattern of geometry.patterns) {
    const request = { type: 'generate-variant' as const, seed: 1, maxAttempts: 1, maxNodes: 20_000,
      template: { version: 1 as const, givens: '0'.repeat(81), rules: pattern.lines.map(cells => ({ type: 'palindrome' as const, cells })) },
      givens: 30, requiredRule: 'palindrome', difficulty: 'easy' as const, techniqueOrder: await getVariantPlayOrder() }
    const first = await runEngine(request)
    const alternatives: VariantRule[][] = [
      [...pattern.lines].reverse().map(cells => ({ type: 'palindrome', cells: [...cells].reverse() })),
      pattern.lines.flatMap(cells => Array.from({ length: Math.floor(cells.length / 2) }, (_, i) => ({ type: 'palindrome' as const, cells: [cells[i], cells[cells.length - 1 - i]] }))),
      [{ type: 'clone', groups: palindromeGroups(first.puzzle) }],
    ]
    for (const rules of alternatives) {
      const alternative = { ...first.puzzle, rules }
      assert.equal(palindromeKey(alternative), palindromeKey(first.puzzle))
      try {
        const next = await runEngine({ ...request, exclude: [alternative] })
        assert.notEqual(palindromeKey(next.puzzle), palindromeKey(first.puzzle))
      } catch (error) { if (!(error instanceof EngineError && error.code === 'search-limit')) throw error }
    }
  }
})

test('generated Palindromes retain paths, progress, history, solutions and shared definitions through real storage', async () => {
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const path = '../src/sudoku/storage.ts?palindrome-generated-save'
    const { roomStore } = await import(path) as typeof import('../src/sudoku/storage.ts')
    const game = gameOf(await generatePlayableVariant('palindrome', 'medium', 10, []))
    roomStore.add(game)
    const cell = game.givens.indexOf('0'), solution = game.variant!.solution
    roomStore.update(game.id, saved => enter(saved, [cell], 'value', Number(solution[cell])))
    const reload = '../src/sudoku/storage.ts?palindrome-generated-reload'
    const restored = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant); assert.equal(restored.position.entries[cell], solution[cell])
    assert.equal(undo(restored).position.entries[cell], '0'); assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.equal((await puzzleSolution(restored)).board, solution)
    const shared = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'palindrome', puzzle: game.variant!.puzzle }))
    assert.deepEqual((await prepareImportedPuzzle(shared)).game.variant, game.variant)
  } finally { keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})
