import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
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
import { checkXSumProof } from './helpers/x-sum-proof.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { coachCode } from './helpers/coach-code.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
useWasmWorker()

const sources = ['newman', 'murphy', 'clover', 'coach-transcription', 'mixed'].map(
  (name) =>
    JSON.parse(readFileSync(new URL('./fixtures/x-sum-' + name + '.json', import.meta.url), 'utf8')) as {
      title: string
      puzzle: VariantPuzzle
      solution: string
    },
)
const authoredCoach = JSON.parse(readFileSync(new URL('./fixtures/x-sum-AsnF.json', import.meta.url), 'utf8')) as {
  metadata: { sudoku: string; solution: string; name: string }
}
const share = (puzzle: VariantPuzzle) =>
  '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

test('the reviewed original Coach AsnF export imports and verifies through the app engine', async () => {
  const { game } = await prepareImportedPuzzle(authoredCoach.metadata.sudoku)
  assert.equal(game.title, authoredCoach.metadata.name)
  assert.equal(game.variant?.solution, authoredCoach.metadata.solution)
  assert.equal(game.variant?.puzzle.rules?.length, 16)
  assertVariantCompletion(game.variant!.puzzle, authoredCoach.metadata.solution)
})

test('the reviewed Coach AsnF export composes with Ratio through the app engine', async () => {
  const data = await decodeSudokuCoachPayload(authoredCoach.metadata.sudoku)
  const ratio = { type: 'ratio', segments: [{ cells: [0, 1], parameters: {} }] }
  const imported = await prepareImportedPuzzle(coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] }))
  assert.equal(imported.game.variant?.solution, authoredCoach.metadata.solution)
  assert.equal(imported.game.variant?.puzzle.rules?.filter(rule => rule.type === 'x-sum').length, 16)
  assert.ok(imported.game.variant?.puzzle.rules?.some(rule => rule.type === 'kropki' &&
    rule.ratioTwo?.pairs.some(([a, b]) => a === 0 && b === 1)))
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.game.variant!.puzzle, entries: authoredCoach.metadata.solution,
  } }), 'unique')
})

for (const [index, source] of sources.entries()) {
  test(source.title + ' imports all rules with multiple valid hints and a complete checked human path', async () => {
    const { game } = await prepareImportedPuzzle(share(source.puzzle))
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assert.equal(game.variant!.id, index === 4 ? 'mixed' : 'x-sum')
    const candidates = await playCandidates(game)
    for (let cell = 0; cell < 81; cell++)
      if (game.givens[cell] === '0') assert.ok(candidates![cell] & (1 << (Number(source.solution[cell]) - 1)))
    const choices = await puzzleHints(game)
    assert.ok(choices.choices.length > 1)
    const solution = await puzzleSolution(game)
    assert.notEqual(solution.rating.status, 'stalled')
    assert.equal(solution.board, source.solution)
    if (index < 4) assert.equal(solution.rating.score.points, [3178, 2744, 1940, 6414][index])
    let play = game
    const trace = await runEngine({
      type: 'variant',
      operation: 'trace',
      position: { puzzle: source.puzzle },
      techniqueOrder: await getVariantPlayOrder(),
    })
    for (const step of trace.steps) {
      if (step.technique === 'x-sum') checkXSumProof(step, source.puzzle)
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
    assert.ok(isSolved(play))
    assert.equal(valuesOf(play), source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    assert.equal(countLineSolutions(source.puzzle).solution, source.solution)
    assert.equal(
      await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: source.puzzle }, maxNodes: 20_000 }),
      'unique',
    )
    assert.equal(
      await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle }, maxNodes: 20_000 }),
      source.solution,
    )
  })
}

test('Murphy exhaustive hints include complete five-digit overlay proofs', async () => {
  const hints = await runEngine({
    type: 'variant',
    operation: 'hints',
    position: { puzzle: sources[1].puzzle },
    techniqueOrder: await getVariantPlayOrder(),
    difficulty: 'hard',
    limit: 0xffff_ffff,
  })
  const overlays = hints.filter(hint => hint.technique === 'quintuple-pattern-overlay')
  const excluded = [4, 22, 36, 38, 42, 44, 58, 76]
  assert.deepEqual(
    overlays.map(hint => hint.actions),
    [1, 3, 5, 7, 9].map(digit => excluded.map(cell => ({ eliminate: { cell, digit } }))),
  )
  assert.ok(hints.some(hint => hint.technique === 'x-sum'))
})

test('disabled human techniques and explicit removals still enforce all X-Sums and companion rules', async () => {
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

test('X-Sums proof descriptions and Finder counts keep the printed totals before and after a placement', async () => {
  const source = sources[0],
    { game } = await prepareImportedPuzzle(share(source.puzzle))
  for (const current of [
    game,
    enter(
      game,
      [source.puzzle.givens.indexOf('0')],
      'value',
      Number(source.solution[source.puzzle.givens.indexOf('0')]),
    ),
  ]) {
    const position = variantPosition(current.variant!, current.position)
    const full = await runEngine({
      type: 'variant',
      operation: 'hints',
      position,
      techniqueOrder: ['x-sum'],
      limit: 0xffff_ffff,
    })
    assert.ok(full.length > 1)
    const choices = await puzzleHints(current, 'all', 'x-sum')
    assert.equal(choices.choices.length, full.length)
    for (const choice of choices.choices) {
      assert.ok('variant' in choice.evidence)
      assert.match(choice.evidence.variant.description, /tells how many cells to add, including itself/)
    }
    for (const deduction of full) {
      checkXSumProof(deduction, source.puzzle)
      assert.equal(deduction.evidence.type, 'constraint')
      if (deduction.evidence.type !== 'constraint') throw new Error('X-Sums needs its constraint premises')
      for (const action of deduction.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
    }
    const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, position)
    try {
      assert.equal(
        await scan.count('x-sum'),
        new Set(full.flatMap((d) => d.actions.map((a) => JSON.stringify(a)))).size,
      )
    } finally {
      scan.close()
    }
  }
})

test('selected X-Sums hint pages preserve every proof and release only their collection', async () => {
  const { game } = await prepareImportedPuzzle(share(sources[0].puzzle))
  const full = await puzzleHints(game, 'all', 'x-sum')
  assert.ok(full.choices.length > 1)
  const first = await puzzleHints(game, 'all', 'x-sum', 851)
  assert.equal(first.available, full.choices.length)
  const collected = []
  for (let index = 0; index < first.available;) {
    const page = await puzzleHintPage(game.variant, 851, index)
    assert.equal(page.offset, index)
    assert.ok(page.choices.length)
    collected.push(...page.choices)
    index += page.choices.length
  }
  assert.deepEqual(collected, full.choices)
  const second = await puzzleHints(game, 'all', 'x-sum', 852)
  await runEngine({ type: 'release-hints', collection: 851 })
  assert.deepEqual((await puzzleHintPage(game.variant, 852, 0)).choices, second.choices)
  await runEngine({ type: 'release-hints', collection: 852 })
})

test('actual Hard New Puzzle generation yields twenty distinct independently unique X-Sums-dependent puzzles', async () => {
  const distinct = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const result = await generatePlayableVariant('x-sum', 'hard', seed, [])
    assert.ok(result.givens >= 29 && result.givens <= 30)
    assert.deepEqual(result.rating.status, { solved: 'hard' })
    assert.ok(result.rating.counts['x-sum'])
    assertVariantCompletion(result.puzzle, result.solution)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    const game = {
      ...makeGame('x-sum-generated-' + seed, 'X-Sums', result.puzzle.givens, 'generated'),
      difficulty: 'hard' as const,
      variant: { id: 'x-sum' as const, puzzle: result.puzzle, solution: result.solution },
    }
    assert.ok((await puzzleHints(game)).choices.length > 1)
    distinct.add(result.puzzle.givens)
  }
  assert.equal(distinct.size, 20)
})

test('New Puzzle repeats are deterministic and exclude played puzzles, mixed aliases and reordered outside clues in all orientations', async () => {
  const first = await generatePlayableVariant('x-sum', 'hard', 2, [])
  assert.deepEqual(await generatePlayableVariant('x-sum', 'hard', 2, []), first)
  const prior = {
    ...makeGame('x-sum-prior', 'X-Sums', first.puzzle.givens, 'generated'),
    variant: { id: 'x-sum' as const, puzzle: first.puzzle, solution: first.solution },
  }
  const reordered = { ...first.puzzle, rules: [...first.puzzle.rules!].reverse() }
  for (const puzzle of [first.puzzle, reflectVariant(first.puzzle, 3), reordered])
    for (const id of ['x-sum', 'mixed'] as const) {
      const next = await generatePlayableVariant('x-sum', 'hard', 2, [
        { ...prior, variant: { ...prior.variant, id, puzzle } },
      ])
      for (let symmetry = 0; symmetry < 8; symmetry++)
        assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
      assert.deepEqual(next.rating.status, { solved: 'hard' })
      assert.equal(countLineSolutions(next.puzzle).solution, next.solution)
    }
})

test('three X-Sums practice positions and a fresh drill retain sound moves, outside clues and the 80-point Hard cost', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }),
    technique = catalog.techniques.find((item) => item.id === 'x-sum')!
  assert.equal(technique.cost, 80)
  assert.equal(technique.difficulty, 'hard')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'x-sum' })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({
    type: 'generate-practice-example',
    variant: true,
    technique: 'x-sum',
    seed: 67,
    exclude: examples[0].position.puzzle.givens,
  })
  for (const exercise of [...examples, fresh]) {
    checkXSumProof(exercise.deduction, exercise.position.puzzle)
    const unique = await runEngine({ type: 'variant', operation: 'solve-unique', position: exercise.position })
    assert.equal(unique.status, 'unique')
    assertVariantCompletion(exercise.position.puzzle, unique.solution)
    assert.deepEqual(
      await runEngine({
        type: 'variant',
        operation: 'check-practice-move',
        position: exercise.position,
        technique: 'x-sum',
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
        technique: 'x-sum',
        action: { eliminate: { cell, digit: Number(unique.solution[cell]) } },
      }),
      null,
    )
    assert.ok(exercise.position.puzzle.rules?.some((rule) => rule.type === 'x-sum'))
  }
})

test('actual mixed X-Sums storage reload preserves rules, progress, history and shared data', async () => {
  const source = sources[4],
    { game } = await prepareImportedPuzzle(share(source.puzzle))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const,
    prior = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const module = '../src/sudoku/storage.ts?x-sum-save',
      { roomStore } = (await import(module)) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, (saved) =>
      enter(
        saved,
        [source.puzzle.givens.indexOf('0')],
        'value',
        Number(source.solution[source.puzzle.givens.indexOf('0')]),
      ),
    )
    const next = '../src/sudoku/storage.ts?x-sum-reload'
    const restored = ((await import(next)) as typeof import('../src/sudoku/storage.ts')).roomStore
      .getSnapshot()
      .games.find((saved) => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(
      restored.position.entries[source.puzzle.givens.indexOf('0')],
      source.solution[source.puzzle.givens.indexOf('0')],
    )
    assert.equal(undo(restored).position.entries[source.puzzle.givens.indexOf('0')], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, source.puzzle)
  } finally {
    keys.forEach((key, i) => {
      if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
})

test('authored Jigsaw/Killer/outside companions retain every rule and an independently unique completion', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/x-sum-jigsaw-mixed.json', import.meta.url), 'utf8'))
  const { game } = await prepareImportedPuzzle(share(source.puzzle))
  assert.deepEqual(game.variant!.puzzle, source.puzzle)
  assert.equal(game.variant!.solution, source.solution)
  assert.equal(countLineSolutions(source.puzzle).count, 1)
  assertVariantCompletion(source.puzzle, source.solution)
  assert.equal((await puzzleSolution(game)).board, source.solution)
  assert.ok((await puzzleHints(game)).choices.length > 1)
})
