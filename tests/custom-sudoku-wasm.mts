import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { customDifficulties, customRuleIds, type CustomRule, type MarkerRule } from '../src/sudoku/custom-modes.ts'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, makeGame, restartGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { variantSeeds } from '../src/sudoku/variant-generation.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { syncDatabase } from './helpers/sync-database.ts'
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

test('white dots and Non-Consecutive use the same exception edges with either setting', async () => {
  for (const negative of [false, true]) {
    const result = await generateCustomSudoku(['non-consecutive', 'kropki-white'], 'easy', 5, [],
      { negativeMarkers: negative ? ['kropki-white'] : [] })
    const rules = result.puzzle.rules!
    const restriction = rules.find(rule => rule.type === 'non-consecutive')!
    const dots = rules.find(rule => rule.type === 'kropki')!
    assert.ok(restriction.except?.length)
    assert.deepEqual(restriction.except, dots.consecutive?.pairs)
    assert.equal(dots.consecutive?.negative ?? false, negative)
    assert.ok(!dots.ratioTwo?.negative && !dots.ratioTwo?.pairs?.length)
    assertVariantCompletion(result.puzzle, result.solution)
  }
})

test('each complete marking can be enabled independently of its companion symbol', async () => {
  for (const [family, marker] of [
    ['kropki', 'kropki-white'], ['kropki', 'kropki-black'], ['xv', 'xv-five'], ['xv', 'xv-ten'],
  ] as const) {
    const { puzzle, solution, rating } = await generateCustomSudoku([family], 'medium', 5, [], { negativeMarkers: [marker] })
    const layer = puzzle.rules?.find(rule => rule.type === family)
    assert.ok(layer)
    const pairs = layer.type === 'kropki' ? [layer.consecutive, layer.ratioTwo] : [layer.five, layer.ten]
    const flags = marker === 'kropki-white' || marker === 'xv-five' ? [true, false] : [false, true]
    assert.deepEqual(pairs.map(marks => marks?.negative ?? false), flags)
    assert.ok(pairs.every(marks => marks?.pairs?.length))
    assertVariantCompletion(puzzle, solution)
    assert.deepEqual(rating.status, { solved: 'medium' })
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }),
      { status: 'unique', solution })
  }
})

test('a black dot on consecutive digits exempts the edge from the negative white-dot rule', async () => {
  const { puzzle, solution } = await generateCustomSudoku(['kropki'], 'easy', 5, [],
    { negativeMarkers: ['kropki-white', 'kropki-black'] })
  const dots = puzzle.rules?.find(rule => rule.type === 'kropki')
  assert.ok(dots)
  const both = dots.consecutive?.pairs?.find(([a, b]) =>
    dots.ratioTwo?.pairs?.some(([first, second]) => first === a && second === b))
  assert.ok(both)
  const rule = { ...dots, consecutive: { negative: true, pairs: dots.consecutive!.pairs!.filter(pair => pair !== both) } }
  const withoutWhite: VariantPuzzle = { ...puzzle, givens: solution, rules: [rule] }
  assert.ok(variantRuleDescriptions(withoutWhite).includes('Digits in cells sharing an edge without a Kropki dot cannot be consecutive.'))
  assertVariantCompletion(withoutWhite, solution)
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: withoutWhite } }), 'unique')
  const [a, b] = both
  const remainingBlack = dots.ratioTwo!.pairs!.filter(([first, second]) => first !== a || second !== b)
  const withoutEither: VariantPuzzle = { ...withoutWhite,
    rules: [{ ...rule, ratioTwo: { negative: true, pairs: remainingBlack } }] }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: withoutEither } }), 'conflict')
})

const mixedMarkers = ['kropki-white', 'xv-ten'] as const satisfies readonly MarkerRule[]
const mixedRules = ['kropki', 'xv', 'arrow'] as const satisfies readonly CustomRule[]

test('mixed complete marks retain all edge meanings, hints, and three exact ratings', async () => {
  for (const difficulty of customDifficulties) {
    const { puzzle, solution, rating } = await generateCustomSudoku(mixedRules, difficulty, 5, [], { negativeMarkers: mixedMarkers })
    assert.deepEqual(rating.status, { solved: difficulty })
    assertVariantCompletion(puzzle, solution)
    const markers = puzzle.rules?.filter(rule => rule.type === 'kropki' || rule.type === 'xv')
    assert.deepEqual(markers?.map(rule => rule.type === 'kropki'
      ? [rule.consecutive?.negative ?? false, rule.ratioTwo?.negative ?? false]
      : [rule.five?.negative ?? false, rule.ten?.negative ?? false]), [[true, false], [false, true]])
    assert.ok(puzzle.rules?.some(rule => rule.type === 'arrow'))
    const game = { ...makeGame('complete-marks', 'Complete markings', puzzle.givens, 'generated'), difficulty,
      variant: { id: 'mixed' as const, puzzle, solution } }
    const hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1)
    const played = applyDeduction(game, hints.choices[0].actions, hints.candidates!)
    assert.notEqual(played, game)
    assert.deepEqual(undo(played).position, game.position)
    if (difficulty === 'medium') {
      const scan = watchTechniqueScan(valuesOf(played), played.position.eliminations, variantPosition(played.variant!, played.position))
      try {
        for (const technique of ['kropki', 'xv']) {
          const selected = await puzzleHints(played, 'all', technique)
          assert.ok(selected.choices.length > 0)
          const targets = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
          assert.equal(await scan.count(technique), targets.size)
        }
      } finally { scan.close() }
    }
    const path = await puzzleSolution(game)
    assert.equal(path.board, solution)
    assert.deepEqual(path.rating.status, { solved: difficulty })
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }),
      { status: 'unique', solution })
  }
})

test('the saved game retains the original mode for its next puzzle after reload', async () => {
  const { sqlite, fetcher } = syncDatabase()
  const globals = { window: {}, localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), fetch: fetcher }
  const originals = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true })
  try {
    const mode = { name: 'Complete markings', rules: mixedRules, negativeMarkers: mixedMarkers }
    const { puzzle, solution } = await generateCustomSudoku(mode.rules, 'medium', 5, [], mode)
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
    const next = await generateCustomSudoku(restored.customMode.rules, 'medium', 5, [restored], restored.customMode)
    assert.notDeepEqual(next.puzzle, puzzle)
    assertVariantCompletion(next.puzzle, next.solution)
    assert.equal(next.puzzle.rules?.find(rule => rule.type === 'kropki')?.consecutive?.negative, true)
    assert.equal(next.puzzle.rules?.find(rule => rule.type === 'xv')?.ten?.negative, true)
    const id = await publishSharedPuzzle(restored)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.variant, restored.variant)
  } finally {
    sqlite.close()
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
