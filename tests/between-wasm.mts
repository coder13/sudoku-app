import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { reflectVariant, variantGenerationRequest, variantSeeds } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertKropkiHouseProof } from './helpers/kropki-house-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
useWasmWorker()

const published = JSON.parse(readFileSync(new URL('./fixtures/between-newman.json', import.meta.url), 'utf8'))
const mixed = JSON.parse(readFileSync(new URL('./fixtures/between-coach.json', import.meta.url), 'utf8')).examples[0]
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

for (const [source, points, steps, complete] of [[published, 1139, 77, true], [mixed, 5566, 163, true]] as const) {
  test(`complete source ${source.title} imports with checked rules, several hints and an honest solution path`, async () => {
    const { game } = await prepareImportedPuzzle(source === published ? share(source.puzzle) : source.code)
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    const candidates = await playCandidates(game)
    candidates!.forEach((mask, cell) => { if (game.givens[cell] === '0') assert.ok(mask & 1 << (Number(source.solution[cell]) - 1)) })
    const hints = await puzzleHints(game)
    assert.ok(hints.choices.length > 1)
    const solution = await puzzleSolution(game)
    assert.equal(solution.rating.score.points, points)
    assert.equal(solution.steps.length, steps)
    assert.equal(solution.rating.status === 'stalled', !complete)
    assert.equal(solution.board === source.solution, complete)
    let play = game
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: variantPosition(game.variant!), techniqueOrder: await getVariantPlayOrder(game.variant!.puzzle) })
    for (const step of trace.steps) {
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
      const before = play
      const puzzle = game.variant!.puzzle
      const masks = variantHouseMasks(puzzle, valuesOf(play), play.position.eliminations)
      if (step.technique === 'kropki-house-support') assertKropkiHouseProof(puzzle, valuesOf(play), masks, step)
      play = applyDeduction(play, step.actions, masks)
      assert.deepEqual(undo(play).position, before.position)
      assert.deepEqual(redo(undo(play)).position, play.position)
    }
    assert.equal(isSolved(play), complete)
    assert.equal(valuesOf(play), solution.board)
    const position = variantPosition(game.variant!)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 20_000 }), 'unique')
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), source.solution)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
    assert.equal((await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder: [] })).points, 0)
  })
}

test('all eight square transformations move each endpoint with its full path and printed completion', async () => {
  for (const source of [published, mixed]) {
    const original = structuredClone(source.puzzle)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry)
      const solution = transformedBoard(source.solution, symmetry)
      assertVariantCompletion(puzzle, solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle } }), solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unique')
      assert.deepEqual(source.puzzle, original)
    }
  }
})

test('Between selection and Finder counts retain all actions before and after an endpoint changes', async () => {
  const { game } = await prepareImportedPuzzle(share(published.puzzle))
  for (const current of [game, enter(game, [0], 'value', Number(published.solution[0]))]) {
    const position = variantPosition(current.variant!, current.position)
    const full = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['between'], limit: 0xffff_ffff })
    assert.ok(full.length)
    for (const deduction of full) for (const action of deduction.actions) {
      assert.ok('eliminate' in action)
      assert.notEqual(action.eliminate.digit, Number(published.solution[action.eliminate.cell]))
    }
    const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, position)
    try {
      const actions = new Set(full.flatMap(deduction => deduction.actions.map(action => JSON.stringify(action))))
      assert.equal(await scan.count('between'), actions.size)
    } finally { scan.close() }
  }
})

test('the real New Puzzle generation path offers a unique Easy puzzle that needs Between Lines', async () => {
  const order = await getVariantPlayOrder()
  const distinct = new Set<string>()
  for (const seed of [1, 7, 15]) {
    const generated = await generatePlayableVariant('between', 'easy', seed, [])
    assert.equal(generated.rating.status === 'stalled' ? 'stalled' : generated.rating.status.solved, 'easy')
    assert.equal(generated.givens, 30)
    assert.ok(generated.rating.counts.between)
    const counted = countLineSolutions(generated.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, generated.solution)
    assert.equal(countLineSolutions({ ...generated.puzzle, rules: generated.puzzle.rules!.filter(rule => rule.type !== 'between') }).count, 2)
    assertVariantCompletion(generated.puzzle, generated.solution)
    const request = variantGenerationRequest('between', 'easy', variantSeeds.between.easy![0], order, seed)
    const repeat = await runEngine(request)
    assert.deepEqual(repeat.puzzle, generated.puzzle)
    distinct.add(generated.puzzle.givens)
  }
  assert.equal(distinct.size, 3)
})

test('Medium fallback generation excludes played puzzles and their square symmetries', async () => {
  const first = await generatePlayableVariant('between', 'medium', 2, [])
  const prior = { ...makeGame('played-between', 'Between Lines', first.puzzle.givens, 'generated'),
    variant: { id: 'between' as const, puzzle: first.puzzle, solution: first.solution } }
  for (const id of ['between', 'mixed'] as const) {
    const next = await generatePlayableVariant('between', 'medium', 2, [{ ...prior, variant: { ...prior.variant, id } }])
    for (let symmetry = 0; symmetry < 8; symmetry++) assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
    assert.deepEqual(next.rating.status, { solved: 'medium' })
    const counted = countLineSolutions(next.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, next.solution)
  }
})

test('selected Between proofs retain every page and release only their own collection', async () => {
  const puzzle: VariantPuzzle = { ...published.puzzle, rules: [...published.puzzle.rules] }
  for (let cell = 0; cell < 81; cell++) if (published.puzzle.givens[cell] === '0' &&
    Number(published.solution[cell]) > 1 && Number(published.solution[cell]) < 8) {
    // Authored extra constraints all hold in the independently unique source.
    // The full original rule list is retained before adding dense alternatives.
    puzzle.rules = [...puzzle.rules!, { type: 'between', cells: [14, cell, 66] }]
  }
  const { game } = await prepareImportedPuzzle(share(puzzle))
  const full = await puzzleHints(game, 'all', 'between')
  assert.ok(full.choices.length > 32)
  const first = await puzzleHints(game, 'all', 'between', 763)
  const choices = [...first.choices]
  while (choices.length < first.available) {
    const page = await puzzleHintPage(game.variant, 763, choices.length)
    assert.equal(page.offset, choices.length)
    assert.ok(page.choices.length)
    choices.push(...page.choices)
  }
  assert.deepEqual(choices, full.choices)
  const other = await puzzleHints(game, 'all', 'between', 764)
  await runEngine({ type: 'release-hints', collection: 763 })
  assert.deepEqual((await puzzleHintPage(game.variant, 764, 0)).choices, other.choices)
  await runEngine({ type: 'release-hints', collection: 764 })
  assert.deepEqual((await puzzleHints(game, 'all', 'between')).choices, full.choices)
})

test('three practice positions and a fresh drill preserve the existing cost and independently unique grids', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const technique = catalog.techniques.find(item => item.id === 'between')!
  assert.equal(technique.cost, 23)
  assert.equal(technique.difficulty, 'easy')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'between' })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'between', seed: 63,
    exclude: examples[0].position.puzzle.givens })
  for (const exercise of [...examples, fresh]) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position,
      technique: 'between', action: exercise.suggestion }), exercise.deduction)
    const action = exercise.suggestion
    const cell = 'place' in action ? action.place.cell : action.eliminate.cell
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position,
      technique: 'between', action: { eliminate: { cell, digit: Number(counted.solution![cell]) } } }), null)
  }
})

test('actual storage reload preserves mixed rules, placed digits, history and shared data', async () => {
  const { game } = await prepareImportedPuzzle(mixed.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const first = '../src/sudoku/storage.ts?between-save'
    const { roomStore } = await import(first) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(mixed.solution[0])))
    const next = '../src/sudoku/storage.ts?between-reload'
    const restored = (await import(next) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], mixed.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, mixed.puzzle)
  } finally {
    keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) })
  }
})
