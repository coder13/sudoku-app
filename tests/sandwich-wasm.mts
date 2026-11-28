import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { checkSandwichProof } from './helpers/sandwich-proof.ts'
import { assertThermometerHouseProof } from './helpers/thermometer-house-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
useWasmWorker()

const sources = ['murphy', 'newman', 'coach-9VLq'].map(name => JSON.parse(readFileSync(new URL('./fixtures/sandwich-' + name + '.json', import.meta.url), 'utf8')) as { title: string; puzzle: VariantPuzzle; solution: string })
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

for (const [index, source] of sources.entries()) {
  test(source.title + ' imports all rules with multiple valid hints and a complete checked human path', async () => {
    const { game } = await prepareImportedPuzzle(share(source.puzzle))
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assert.equal(game.variant!.id, index === 2 ? 'mixed' : 'sandwich')
    const candidates = await playCandidates(game)
    for (let cell = 0; cell < 81; cell++) if (game.givens[cell] === '0') assert.ok(candidates![cell] & 1 << (Number(source.solution[cell]) - 1))
    const choices = await puzzleHints(game)
    assert.ok(choices.choices.length > 1)
    const solution = await puzzleSolution(game)
    assert.notEqual(solution.rating.status, 'stalled')
    assert.equal(solution.board, source.solution)
    if (index < 2) {
      assert.equal(solution.rating.score.points, index === 0 ? 2624 : 1922)
      assert.equal(solution.steps.length, index === 0 ? 87 : 76)
    } else {
      assert.deepEqual(solution.rating.status, { solved: 'very-hard' })
      assert.equal(solution.rating.score.points, 7378)
      assert.equal(solution.steps.length, 163)
    }
    let play = game
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: source.puzzle }, techniqueOrder: await getVariantPlayOrder(source.puzzle) })
    for (const step of trace.steps) {
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
      const before = play
      const masks = variantHouseMasks(source.puzzle, valuesOf(play), play.position.eliminations)
      if (step.technique === 'thermometer-house-support') assertThermometerHouseProof(source.puzzle, valuesOf(play), masks, step)
      play = applyDeduction(play, step.actions, masks)
      assert.deepEqual(undo(play).position, before.position)
      assert.deepEqual(redo(undo(play)).position, play.position)
    }
    assert.ok(isSolved(play))
    assert.equal(valuesOf(play), source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    assert.equal(countLineSolutions(source.puzzle).solution, source.solution)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: source.puzzle }, maxNodes: 20_000 }), 'unique')
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle }, maxNodes: 20_000 }), source.solution)
  })
}

test('Thermo Sandwich keeps its ranked hints and reports no Unique Rectangle chains', async () => {
  const { puzzle, solution } = sources[2]
  const { game } = await prepareImportedPuzzle(share(puzzle))
  const hints = await puzzleHints(game, 10, undefined, 859)
  assert.equal(hints.available, 8)
  assert.deepEqual((await puzzleHintPage(game.variant, 859, 0)).choices, hints.choices)
  await runEngine({ type: 'release-hints', collection: 859 })
  for (const hint of hints.choices) for (const action of hint.actions) {
    if ('place' in action) assert.equal(action.place.digit, Number(solution[action.place.cell]))
    else assert.notEqual(action.eliminate.digit, Number(solution[action.eliminate.cell]))
  }

  const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant!))
  try {
    for (const technique of [
      'unique-rectangle-aic',
      'unique-rectangle-discontinuous-nice-loop',
      'unique-rectangle-continuous-nice-loop',
    ]) {
      assert.equal(await scan.count(technique), 0)
      assert.equal((await puzzleHints(game, 'all', technique)).available, 0)
    }
  } finally {
    scan.close()
  }
})

test('disabled human techniques and explicit removals still enforce all Sandwich and companion rules', async () => {
  for (const source of sources) {
    const position = { puzzle: source.puzzle }
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
    assert.equal((await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder: [] })).points, 0)
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), source.solution)
    const cell = source.puzzle.givens.indexOf('0'), removals = Array<number>(81).fill(0)
    removals[cell] = 1 << (Number(source.solution[cell]) - 1)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { ...position, eliminations: removals } }), 'unsolvable')
  }
})

test('every square transform preserves outside directions, companion clues and exact completions', async () => {
  for (const source of sources) {
    const original = structuredClone(source.puzzle)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry), solution = transformedBoard(source.solution, symmetry)
      assertVariantCompletion(puzzle, solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle } }), solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unique')
    }
    assert.deepEqual(source.puzzle, original)
  }
})

test('Sandwich proof descriptions and Finder counts keep the printed totals before and after a placement', async () => {
  const source = sources[0], { game } = await prepareImportedPuzzle(share(source.puzzle))
  for (const current of [game, enter(game, [0], 'value', Number(source.solution[0]))]) {
    const position = variantPosition(current.variant!, current.position)
    const full = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['sandwich'], limit: 0xffff_ffff })
    assert.ok(full.length > 1)
    const choices = await puzzleHints(current, 'all', 'sandwich')
    assert.equal(choices.choices.length, full.length)
    for (const choice of choices.choices) {
      assert.ok('variant' in choice.evidence)
      assert.match(choice.evidence.variant.description, /Sandwich clue of .*strictly between 1 and 9/)
    }
    for (const deduction of full) {
      checkSandwichProof(deduction, source.puzzle)
      assert.equal(deduction.evidence.type, 'constraint')
      if (deduction.evidence.type !== 'constraint') throw new Error('Sandwich needs its constraint premises')
      for (const action of deduction.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
    }
    const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, position)
    try { assert.equal(await scan.count('sandwich'), new Set(full.flatMap(d => d.actions.map(a => JSON.stringify(a)))).size) }
    finally { scan.close() }
  }
})

test('selected Sandwich hint pages preserve every proof and release only their collection', async () => {
  const { game } = await prepareImportedPuzzle(share(sources[0].puzzle))
  const full = await puzzleHints(game, 'all', 'sandwich')
  assert.ok(full.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'sandwich', 851)
  assert.deepEqual(first.choices, full.choices)
  assert.deepEqual((await puzzleHintPage(game.variant, 851, 3)).choices, full.choices) // Index 3 belongs to the first 32-choice page.
  const second = await puzzleHints(game, 'all', 'sandwich', 852)
  await runEngine({ type: 'release-hints', collection: 851 })
  assert.deepEqual((await puzzleHintPage(game.variant, 852, 0)).choices, second.choices)
  await runEngine({ type: 'release-hints', collection: 852 })
})

test('actual Hard New Puzzle generation yields twenty distinct independently unique Sandwich-dependent puzzles', async () => {
  const distinct = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const result = await generatePlayableVariant('sandwich', 'hard', seed, [])
    assert.ok(result.givens > 0 && result.givens <= 30)
    assert.equal(result.ruleDependencies?.[0].rule, 'sandwich')
    assert.deepEqual(result.rating.status, { solved: 'hard' })
    assert.ok(result.rating.counts.sandwich)
    assertVariantCompletion(result.puzzle, result.solution)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    distinct.add(result.puzzle.givens)
  }
  assert.equal(distinct.size, 20)
})

test('New Puzzle repeats are deterministic and exclude played puzzles, mixed aliases and reordered outside clues in all orientations', async () => {
  const first = await generatePlayableVariant('sandwich', 'hard', 2, [])
  assert.deepEqual(await generatePlayableVariant('sandwich', 'hard', 2, []), first)
  const prior = { ...makeGame('sandwich-prior', 'Sandwich', first.puzzle.givens, 'generated'),
    variant: { id: 'sandwich' as const, puzzle: first.puzzle, solution: first.solution } }
  const reordered = { ...first.puzzle, rules: [...first.puzzle.rules!].reverse() }
  for (const puzzle of [first.puzzle, reflectVariant(first.puzzle, 3), reordered]) for (const id of ['sandwich', 'mixed'] as const) {
    const next = await generatePlayableVariant('sandwich', 'hard', 2, [{ ...prior, variant: { ...prior.variant, id, puzzle } }])
    for (let symmetry = 0; symmetry < 8; symmetry++) assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
    assert.deepEqual(next.rating.status, { solved: 'hard' })
    assert.equal(countLineSolutions(next.puzzle).solution, next.solution)
  }
})

test('three Sandwich practice positions and a fresh drill retain sound moves, outside clues and the 76-point Hard cost', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }), technique = catalog.techniques.find(item => item.id === 'sandwich')!
  assert.equal(technique.cost, 76)
  assert.equal(technique.difficulty, 'hard')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'sandwich' })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'sandwich', seed: 67, exclude: examples[0].position.puzzle.givens })
  for (const exercise of [...examples, fresh]) {
    checkSandwichProof(exercise.deduction, exercise.position.puzzle)
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'sandwich', action: exercise.suggestion }), exercise.deduction)
    const action = exercise.suggestion, cell = 'place' in action ? action.place.cell : action.eliminate.cell
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'sandwich', action: { eliminate: { cell, digit: Number(counted.solution![cell]) } } }), null)
    assert.ok(exercise.position.puzzle.rules?.some(rule => rule.type === 'sandwich'))
  }
})

test('actual mixed Sandwich storage reload preserves rules, progress, history and shared data', async () => {
  const source = sources[2], { game } = await prepareImportedPuzzle(share(source.puzzle))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?sandwich-save', { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(source.solution[0])))
    const next = '../src/sudoku/storage.ts?sandwich-reload'
    const restored = (await import(next) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], source.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, source.puzzle)
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})

test('complete original Coach import and authored Jigsaw/Killer companions retain their independently unique solutions', async () => {
  const coach = JSON.parse(readFileSync(new URL('./fixtures/sandwich-coach-9VLq.json', import.meta.url), 'utf8'))
  const mixed = JSON.parse(readFileSync(new URL('./fixtures/sandwich-jigsaw-mixed.json', import.meta.url), 'utf8'))
  for (const [source, input] of [[coach,coach.originalCode],[mixed,share(mixed.puzzle)]] as const) {
    const { game } = await prepareImportedPuzzle(input)
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assert.equal(countLineSolutions(source.puzzle).count, 1)
    assertVariantCompletion(source.puzzle, source.solution)
    assert.equal((await puzzleSolution(game)).board, source.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
  }
})
