import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { customDifficulties, customRuleIds, type CustomRule } from '../src/sudoku/custom-modes.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { makeGame, restartGame, valuesOf } from '../src/sudoku/game.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { variantSeeds } from '../src/sudoku/variant-generation.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('all 35 rule choices have a verified generation path at an offered level', async () => {
  assert.equal(customRuleIds.length, 35)
  for (const rule of customRuleIds) {
    const recipes = Object.hasOwn(variantSeeds, rule) ? variantSeeds[rule as keyof typeof variantSeeds] : undefined
    const difficulty = recipes?.hard && !recipes.medium ? 'hard' : 'medium'
    const result = await generateCustomSudoku([rule], difficulty, 5, [])
    assert.deepEqual(result.rating.status, { solved: difficulty }, rule)
    assertVariantCompletion(result.puzzle, result.solution)
    const actual = result.puzzle.rules ?? []
    if (rule === 'jigsaw') assert.equal(result.puzzle.regions?.type, 'jigsaw')
    else if (rule === 'windoku') assert.equal(actual.filter(item => item.type === 'extra-house').length, 4)
    else if (rule === 'diagonal-main' || rule === 'diagonal-anti') {
      assert.deepEqual(actual, [{ type: 'diagonal', diagonal: rule.slice(9) }])
    } else if (rule === 'dutch-whispers') {
      assert.ok(actual.length && actual.every(item => item.type === 'whispers' && item.minDifference === 4))
    } else if (rule === 'kropki-white' || rule === 'kropki-black') {
      const dots = actual.find(item => item.type === 'kropki')!
      assert.equal(Boolean(dots.consecutive?.pairs?.length), rule === 'kropki-white')
      assert.equal(Boolean(dots.ratioTwo?.pairs?.length), rule === 'kropki-black')
    } else if (rule === 'xv-five' || rule === 'xv-ten') {
      const marks = actual.find(item => item.type === 'xv')!
      assert.equal(Boolean(marks.five?.pairs?.length), rule === 'xv-five')
      assert.equal(Boolean(marks.ten?.pairs?.length), rule === 'xv-ten')
    } else assert.ok(actual.some(item => item.type === rule), rule)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: result.puzzle } }),
      { status: 'unique', solution: result.solution })
  }
})

test('the same mixed mode generates three actual difficulty grades with all selected rules', async () => {
  const rules = ['windoku', 'arrow'] as const satisfies readonly CustomRule[]
  const completions = new Set<string>()
  for (const level of customDifficulties) {
    const result = await generateCustomSudoku(rules, level, 5, [])
    assert.deepEqual(result.rating.status, { solved: level })
    assert.equal(result.puzzle.rules?.filter(rule => rule.type === 'extra-house').length, 4)
    assert.ok(result.puzzle.rules?.some(rule => rule.type === 'arrow'))
    assertVariantCompletion(result.puzzle, result.solution)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: result.puzzle } }),
      { status: 'unique', solution: result.solution })
    completions.add(result.puzzle.givens)

    const game = { ...makeGame('custom', 'Windoku Arrows', result.puzzle.givens, 'generated'),
      customMode: { name: 'Windoku Arrows', rules }, difficulty: level,
      variant: { id: 'mixed' as const, puzzle: result.puzzle, solution: result.solution } }
    assert.deepEqual(restartGame(game).customMode, game.customMode)
    assert.ok((await puzzleHints(game)).choices.length > 1)
    assert.equal((await puzzleSolution(game)).board, result.solution)
    if (level === 'medium') {
      const hints = await puzzleHints(game, 'all', 'arrow')
      assert.ok(hints.choices.length > 0)
      const actions = new Set(hints.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      const scan = watchTechniqueScan(valuesOf(game), undefined, variantPosition(game.variant))
      try { assert.equal(await scan.count('arrow'), actions.size) } finally { scan.close() }
      const next = await generateCustomSudoku(rules, level, 5, [game])
      assert.notDeepEqual(next.puzzle, result.puzzle)
      assert.deepEqual(next.rating.status, { solved: level })
    }
  }
  assert.equal(completions.size, 3)
})

test('white dots and Non-Consecutive use the same exception edges', async () => {
  const result = await generateCustomSudoku(['non-consecutive', 'kropki-white'], 'easy', 5, [])
  const rules = result.puzzle.rules!
  const restriction = rules.find(rule => rule.type === 'non-consecutive')!
  const dots = rules.find(rule => rule.type === 'kropki')!
  assert.ok(restriction.except?.length)
  assert.deepEqual(restriction.except, dots.consecutive?.pairs)
  assertVariantCompletion(result.puzzle, result.solution)
})

test('the saved game retains the original mode for its next puzzle after reload', async () => {
  const globals = { window: {}, localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() }
  const originals = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true })
  try {
    const mode = { name: 'Windoku Arrows', rules: ['windoku', 'arrow'] as const }
    const { puzzle, solution } = await generateCustomSudoku(mode.rules, 'medium', 5, [])
    const game = { ...makeGame('custom-sudoku-mode', mode.name, puzzle.givens, 'generated'),
      customMode: mode, variant: { id: 'mixed' as const, puzzle, solution }, difficulty: 'medium' as const }
    const storage = '../src/sudoku/storage.ts?custom-sudoku-save'
    const { roomStore } = await import(storage) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    const reload = '../src/sudoku/storage.ts?custom-sudoku-reload'
    const { games } = (await import(reload) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot()
    const restored = games.find(item => item.id === game.id)
    assert.ok(restored?.customMode)
    assert.deepEqual(restored.customMode, mode)
    assert.deepEqual(restored.variant, game.variant)
    assert.equal((await puzzleSolution(restored)).board, solution)
  } finally {
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
