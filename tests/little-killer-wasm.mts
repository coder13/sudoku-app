import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import {
  generatePlayableVariant,
  getVariantPlayOrder,
  playCandidates,
  variantPosition,
} from '../src/sudoku/variant-play.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { checkLittleKillerProof } from './helpers/little-killer-proof.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { littleKillerCoach } from './helpers/little-killer-export.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
useWasmWorker()

const sources = ['murphy', 'newman', 'mixed'].map(
  (name) =>
    JSON.parse(readFileSync(new URL('./fixtures/little-killer-' + name + '.json', import.meta.url), 'utf8')) as {
      title: string
      puzzle: VariantPuzzle
      solution: string
    },
)
const share = (puzzle: VariantPuzzle) =>
  '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

for (const [index, source] of sources.entries()) {
  test(
    source.title + ' imports all rules with multiple valid hints and a checked, honestly partial human path',
    async () => {
      const { game } = await prepareImportedPuzzle(share(source.puzzle))
      assert.deepEqual(game.variant!.puzzle, source.puzzle)
      assert.equal(game.variant!.solution, source.solution)
      assert.equal(game.variant!.id, index === 2 ? 'mixed' : 'little-killer')
      const candidates = await playCandidates(game)
      for (let cell = 0; cell < 81; cell++)
        if (game.givens[cell] === '0') assert.ok(candidates![cell] & (1 << (Number(source.solution[cell]) - 1)))
      const choices = await puzzleHints(game)
      assert.ok(choices.choices.length > 1)
      const solution = await puzzleSolution(game)
      assert.equal(solution.rating.status, 'stalled')
      assert.notEqual(solution.board, source.solution)
      if (index < 2) {
        assert.equal(solution.rating.score.points, index === 0 ? 958 : 558)
      }
      let play = game
      const trace = await runEngine({
        type: 'variant',
        operation: 'trace',
        position: { puzzle: source.puzzle },
        techniqueOrder: await getVariantPlayOrder(),
      })
      for (const step of trace.steps) {
        for (const action of step.actions) {
          if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
          else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
        }
        const before = play
        play = applyDeduction(
          play,
          step.actions,
          variantHouseMasks(source.puzzle, valuesOf(play), play.position.eliminations),
        )
        assert.deepEqual(undo(play).position, before.position)
        assert.deepEqual(redo(undo(play)).position, play.position)
      }
      assert.equal(isSolved(play), false)
      assert.equal(valuesOf(play), solution.board)
      assertVariantCompletion(source.puzzle, source.solution)
      assert.equal(countLineSolutions(source.puzzle).solution, source.solution)
      assert.equal(
        await runEngine({
          type: 'variant',
          operation: 'analyze',
          position: { puzzle: source.puzzle },
          maxNodes: 20_000,
        }),
        'unique',
      )
      assert.equal(
        await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle }, maxNodes: 20_000 }),
        source.solution,
      )
    },
  )
}

test('disabled human techniques and explicit removals still enforce all Little Killer and companion rules', async () => {
  for (const source of sources) {
    const position = { puzzle: source.puzzle }
    assert.deepEqual(
      await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }),
      [],
    )
    assert.equal((await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder: [] })).points, 0)
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), source.solution)
    const cell = source.puzzle.givens.indexOf('0'),
      removals = Array<number>(81).fill(0)
    removals[cell] = 1 << (Number(source.solution[cell]) - 1)
    assert.equal(
      await runEngine({ type: 'variant', operation: 'analyze', position: { ...position, eliminations: removals } }),
      'unsolvable',
    )
  }
})

test('every square transform preserves outside directions, companion clues and exact completions', async () => {
  for (const source of sources) {
    const original = structuredClone(source.puzzle)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry),
        solution = transformedBoard(source.solution, symmetry)
      assertVariantCompletion(puzzle, solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle } }), solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unique')
    }
    assert.deepEqual(source.puzzle, original)
  }
})

test('Little Killer proof descriptions and Finder counts keep the printed totals before and after a placement', async () => {
  const source = sources[0],
    { game } = await prepareImportedPuzzle(share(source.puzzle))
  for (const current of [game, enter(game, [0], 'value', Number(source.solution[0]))]) {
    const position = variantPosition(current.variant!, current.position)
    const full = await runEngine({
      type: 'variant',
      operation: 'hints',
      position,
      techniqueOrder: ['little-killer'],
      limit: 0xffff_ffff,
    })
    assert.ok(full.length > 1)
    const choices = await puzzleHints(current, 'all', 'little-killer')
    assert.equal(choices.choices.length, full.length)
    for (const choice of choices.choices) {
      assert.ok('variant' in choice.evidence)
      assert.match(choice.evidence.variant.description, /diagonal from .*must add to/)
    }
    for (const deduction of full) {
      checkLittleKillerProof(deduction, source.puzzle)
      assert.equal(deduction.evidence.type, 'constraint')
      if (deduction.evidence.type !== 'constraint') throw new Error('Little Killer needs its constraint premises')
      for (const action of deduction.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
    }
    const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, position)
    try {
      assert.equal(
        await scan.count('little-killer'),
        new Set(full.flatMap((d) => d.actions.map((a) => JSON.stringify(a)))).size,
      )
    } finally {
      scan.close()
    }
  }
})

test('selected Little Killer hint pages preserve every proof and release only their collection', async () => {
  const { game } = await prepareImportedPuzzle(share(sources[0].puzzle))
  const full = await puzzleHints(game, 'all', 'little-killer')
  assert.ok(full.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'little-killer', 851)
  assert.deepEqual(first.choices, full.choices)
  assert.deepEqual((await puzzleHintPage(game.variant, 851, 3)).choices, full.choices) // Index 3 belongs to the first 32-choice page.
  const second = await puzzleHints(game, 'all', 'little-killer', 852)
  await runEngine({ type: 'release-hints', collection: 851 })
  assert.deepEqual((await puzzleHintPage(game.variant, 852, 0)).choices, second.choices)
  await runEngine({ type: 'release-hints', collection: 852 })
})

test('actual Medium New Puzzle generation yields twenty distinct independently unique Little Killer-dependent puzzles', async () => {
  const distinct = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const result = await generatePlayableVariant('little-killer', 'medium', seed, [])
    assert.equal(result.givens, 30)
    assert.deepEqual(result.rating.status, { solved: 'medium' })
    assert.ok(result.rating.counts['little-killer'])
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
  const first = await generatePlayableVariant('little-killer', 'medium', 2, [])
  assert.deepEqual(await generatePlayableVariant('little-killer', 'medium', 2, []), first)
  const prior = {
    ...makeGame('little-killer-prior', 'Little Killer', first.puzzle.givens, 'generated'),
    variant: { id: 'little-killer' as const, puzzle: first.puzzle, solution: first.solution },
  }
  const reordered = { ...first.puzzle, rules: [...first.puzzle.rules!].reverse() }
  for (const puzzle of [first.puzzle, reflectVariant(first.puzzle, 3), reordered])
    for (const id of ['little-killer', 'mixed'] as const) {
      const next = await generatePlayableVariant('little-killer', 'medium', 2, [
        { ...prior, variant: { ...prior.variant, id, puzzle } },
      ])
      for (let symmetry = 0; symmetry < 8; symmetry++)
        assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
      assert.deepEqual(next.rating.status, { solved: 'medium' })
      assert.equal(countLineSolutions(next.puzzle).solution, next.solution)
    }
})

test('three Little Killer practice positions and a fresh drill retain sound moves, diagonal arrows and the 50-point Medium cost', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }),
    technique = catalog.techniques.find((item) => item.id === 'little-killer')!
  assert.equal(technique.cost, 50)
  assert.equal(technique.difficulty, 'medium')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'little-killer' })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({
    type: 'generate-practice-example',
    variant: true,
    technique: 'little-killer',
    seed: 67,
    exclude: examples[0].position.puzzle.givens,
  })
  for (const exercise of [...examples, fresh]) {
    checkLittleKillerProof(exercise.deduction, exercise.position.puzzle)
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assert.deepEqual(
      await runEngine({
        type: 'variant',
        operation: 'check-practice-move',
        position: exercise.position,
        technique: 'little-killer',
        action: exercise.suggestion,
      }),
      exercise.deduction,
    )
    const action = exercise.suggestion,
      cell = 'place' in action ? action.place.cell : action.eliminate.cell
    assert.equal(
      await runEngine({
        type: 'variant',
        operation: 'check-practice-move',
        position: exercise.position,
        technique: 'little-killer',
        action: { eliminate: { cell, digit: Number(counted.solution![cell]) } },
      }),
      null,
    )
    assert.ok(exercise.position.puzzle.rules?.some((rule) => rule.type === 'little-killer'))
  }
})

test('actual mixed Little Killer storage reload preserves rules, progress, history and shared data', async () => {
  const source = sources[2],
    { game } = await prepareImportedPuzzle(share(source.puzzle))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const,
    prior = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const module = '../src/sudoku/storage.ts?little-killer-save',
      { roomStore } = (await import(module)) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, (saved) => enter(saved, [0], 'value', Number(source.solution[0])))
    const next = '../src/sudoku/storage.ts?little-killer-reload'
    const restored = ((await import(next)) as typeof import('../src/sudoku/storage.ts')).roomStore
      .getSnapshot()
      .games.find((saved) => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], source.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, source.puzzle)
  } finally {
    keys.forEach((key, i) => {
      if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
})

test('converted typed Coach controls and authored Jigsaw companions retain every rule and independently unique completion', async () => {
  const mixed = JSON.parse(readFileSync(new URL('./fixtures/little-killer-jigsaw-mixed.json', import.meta.url), 'utf8'))
  for (const source of [...sources, mixed]) {
    const code = source === mixed ? share(source.puzzle) : littleKillerCoach(source.puzzle)
    const { game } = await prepareImportedPuzzle(code)
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assert.equal(countLineSolutions(source.puzzle).count, 1)
    assertVariantCompletion(source.puzzle, source.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
  }
})

test('the full zero-given Renban companion imports its exact completion and preserves honest zero-hint and partial statuses', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/little-killer-menace.json', import.meta.url), 'utf8'))
  const { game } = await prepareImportedPuzzle(share(source.puzzle))
  assert.deepEqual(game.variant!.puzzle, source.puzzle)
  assert.equal(game.variant!.solution, source.solution)
  assertVariantCompletion(source.puzzle, source.solution)
  assert.equal((await puzzleHints(game)).choices.length, 0)
  const path = await puzzleSolution(game)
  assert.equal(path.rating.status, 'stalled')
  assert.equal(path.steps.length, 0)
  assert.equal(path.board, source.puzzle.givens)
  assert.equal(
    await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: source.puzzle }, maxNodes: 20_000 }),
    'search-limit',
  )
})
