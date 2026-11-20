import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution, puzzleTechniqueCatalog } from '../src/sudoku/puzzle-help.ts'
import { saveDisabledHintTechniques } from '../src/sudoku/hint-preferences.ts'
import { ratePuzzle } from '../src/sudoku/puzzle-rating.ts'
import {
  generatePlayableVariant,
  getVariantPlayOrder,
  playCandidates,
  variantPosition,
} from '../src/sudoku/variant-play.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHouseCells, variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
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
    source.title + ' imports all rules with multiple valid hints and a complete checked walkthrough',
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
      const technique = 'little-killer-house-support'
      const selected = await puzzleHints(game, 'all', technique)
      assert.ok(selected.choices.length >= 2)
      const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant!, game.position))
      try {
        assert.equal(await scan.count(technique), new Set(selected.choices.flatMap(choice =>
          choice.actions.map(action => JSON.stringify(action)))).size)
      } finally {
        scan.close()
      }
      for (const hint of selected.choices) {
        assert.ok('variant' in hint.evidence)
        assert.match(hint.evidence.variant.description, /Little Killer diagonal.*must add to.*same house/)
        assert.ok(hint.actions.every(action => 'eliminate' in action &&
          Number(source.solution[action.eliminate.cell]) !== action.eliminate.digit))
      }
      const [points, steps, supportedSteps] = [[2522,105,5],[3434,119,9],[2888,114,4]][index]
      const solution = await puzzleSolution(game)
      assert.deepEqual(solution.rating.status, { solved: 'medium' })
      assert.equal(solution.board, source.solution)
      assert.equal(solution.rating.score.points, points)
      assert.equal(solution.steps.length, steps)
      assert.equal(solution.rating.score.counts[technique], supportedSteps)
      const grade = await ratePuzzle(game.givens, game.variant)
      assert.ok(grade)
      assert.equal(grade.points, points)
      assert.deepEqual(grade.techniqueOrder, solution.rating.techniqueOrder)
      const previous = await runEngine({
        type: 'variant', operation: 'rate', position: { puzzle: source.puzzle },
        techniqueOrder: await getVariantPlayOrder(),
      })
      assert.equal(previous.status, 'stalled')
      if (index < 2) assert.equal(previous.points, index === 0 ? 958 : 558)
      let play = game
      const trace = await runEngine({
        type: 'variant',
        operation: 'trace',
        position: { puzzle: source.puzzle },
        techniqueOrder: await getVariantPlayOrder(source.puzzle),
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
      assert.equal(isSolved(play), true)
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
    const order = await getVariantPlayOrder(result.puzzle)
    assert.ok(order.includes('little-killer-house-support'))
    const { techniqueOrder: generationOrder, ...generatedRating } = result.rating
    const { techniqueOrder: playOrder, ...playRating } = await runEngine({
      type: 'variant', operation: 'rate', position: { puzzle: result.puzzle }, techniqueOrder: order,
    })
    assert.ok(generationOrder.includes('little-killer-house-support'))
    assert.deepEqual(generationOrder, playOrder.filter(id => generationOrder.includes(id)))
    assert.deepEqual(generatedRating, playRating)
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

test('Renban ModE opens with seven hints and completes a sound logical walkthrough', async () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/little-killer-menace.json', import.meta.url), 'utf8')) as {
    puzzle: VariantPuzzle; solution: string
  }
  const { game } = await prepareImportedPuzzle(share(source.puzzle))
  const variant = game.variant!
  assert.deepEqual(variant.puzzle, source.puzzle)
  assert.equal(variant.solution, source.solution)
  assertVariantCompletion(source.puzzle, source.solution)
  const technique = 'renban-sum'
  const sharedHouse = 'renban-sum-house'
  const lockedDigit = 'renban-locked-digit'
  const houseSupport = 'renban-house-support'
  const rayHouses = 'renban-sum-ray-houses'
  const pureHouses = 'little-killer-house-support'
  const position = variantPosition(variant, game.position)
  const baseOrder = await getVariantPlayOrder()
  assert.ok(!baseOrder.includes(technique) && !baseOrder.includes(sharedHouse))
  const pureOrder = await getVariantPlayOrder(sources[0].puzzle)
  assert.ok(pureOrder.includes(pureHouses))
  assert.deepEqual(pureOrder.filter(id => id !== pureHouses), baseOrder)
  const modeOrder = await getVariantPlayOrder(source.puzzle)
  assert.ok(modeOrder.includes(rayHouses))
  assert.ok(modeOrder.includes(houseSupport))
  assert.deepEqual(modeOrder.filter(id => ![technique, sharedHouse, lockedDigit, houseSupport, pureHouses, rayHouses].includes(id)), baseOrder)

  const catalog = await puzzleTechniqueCatalog(true)
  assert.deepEqual(catalog.techniques.find(item => item.id === technique), {
    id: technique, cost: 66, difficulty: 'medium', requiresUniqueSolution: false, aliases: [],
  })
  const { choices, candidates } = await puzzleHints(game)
  assert.equal(choices.length, 7)
  const locked = await puzzleHints(game, 'all', lockedDigit)
  assert.equal(locked.choices.length, 1)
  const lock = locked.choices[0]
  assert.deepEqual(choices[0], lock)
  assert.deepEqual(lock.actions, [36, 37, 43, 44].map(cell => ({ eliminate: { cell, digit: 5 } })))
  assert.ok('variant' in lock.evidence)
  assert.match(lock.evidence.variant.description, /Every set of 5 consecutive digits includes 5.*row 5/)
  assert.deepEqual(lock.pattern?.candidates.slice(-5), [38, 39, 40, 41, 42].map(cell => ({ cell, digit: 5 })))
  const lockedGame = applyDeduction(game, lock.actions, candidates!)
  assert.deepEqual(undo(lockedGame).position, game.position)
  for (const cell of [36, 37, 43, 44]) assert.ok(lockedGame.position.eliminations[cell] & (1 << 4))
  const selected = await puzzleHints(game, 'all', technique)
  assert.equal(selected.choices.length, 4)
  assert.deepEqual(choices.slice(1, 5), selected.choices)
  const shared = await puzzleHints(game, 'all', sharedHouse)
  assert.deepEqual(choices.slice(5), shared.choices)
  assert.deepEqual(shared.choices.flatMap(hint => hint.actions), [
    { eliminate: { cell: 36, digit: 8 } }, { eliminate: { cell: 76, digit: 8 } },
  ])
  assert.deepEqual(catalog.techniques.find(item => item.id === sharedHouse), {
    id: sharedHouse, cost: 88, difficulty: 'hard', requiresUniqueSolution: false, aliases: [],
  })
  const atR9C5 = shared.choices[1]
  assert.ok('variant' in atR9C5.evidence)
  assert.match(atR9C5.evidence.variant.description, /box 4/)
  assert.match(atR9C5.evidence.variant.reason, /If r9c5 is 8, the other cells of the diagonal must add to 7/i)
  assert.match(atR9C5.evidence.variant.reason, /box 4 and leaves no candidate for r6c2/i)
  const sharedProof = atR9C5.evidence.variant.source?.deduction
  assert.ok(sharedProof?.evidence.type === 'renban-sum-house')
  assert.deepEqual(sharedProof.evidence.rules, [13, 3, 10])
  assert.deepEqual(sharedProof.evidence.witness, {
    candidate: { cell: 76, digit: 8 }, sharedDigit: 1, containedStart: 1, otherStart: 1, restrictedDigits: 7,
  })
  for (const hint of selected.choices) {
    assert.equal(hint.technique, technique)
    assert.ok('variant' in hint.evidence)
    const proof = hint.evidence.variant.source?.deduction.evidence
    assert.ok(proof?.type === 'renban-sum')
    assert.deepEqual(hint.pattern?.cells, proof.cells)
    assert.equal(source.puzzle.rules?.[proof.rules[0]].type, 'renban')
    assert.equal(source.puzzle.rules?.[proof.rules[1]].type, 'little-killer')
    assert.match(hint.evidence.variant.description, /Little Killer diagonal.*totals.*Renban/)
    assert.match(hint.evidence.variant.reason, /sets that fit both clues/)
  }

  const scan = watchTechniqueScan(valuesOf(game), game.position.eliminations, position)
  try {
    const count = new Set(selected.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action)))).size
    assert.equal(count, 53)
    assert.equal(await scan.count(technique), count)
    assert.equal(await scan.count(sharedHouse), 2)
    assert.equal(await scan.count(lockedDigit), 4)
  } finally {
    scan.close()
  }

  const first = choices.find(hint => 'variant' in hint.evidence && /totals 25/.test(hint.evidence.variant.description))!
  assert.ok('variant' in first.evidence)
  assert.match(first.evidence.variant.reason, /5 to 7 adds to 18, leaving 7/)
  assert.match(first.evidence.variant.reason, /7 to 9 adds to 24, leaving 1/)
  const played = applyDeduction(game, first.actions, candidates!)
  assert.notDeepEqual(played.position.eliminations, game.position.eliminations)
  assert.deepEqual(undo(played).position, game.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
  assert.ok((await puzzleHints(played)).choices.length > 0)

  const storage = new MemoryStorage()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try {
    saveDisabledHintTechniques([technique, sharedHouse])
    assert.deepEqual((await puzzleHints(game)).choices, locked.choices)
    saveDisabledHintTechniques([technique, lockedDigit])
    assert.deepEqual((await puzzleHints(game)).choices, shared.choices)
    saveDisabledHintTechniques([technique, sharedHouse, lockedDigit])
    assert.deepEqual((await puzzleHints(game)).choices, [])
    assert.equal((await puzzleHints(game, 'all', technique)).choices.length, 4)
    assert.equal((await puzzleHints(game, 'all', sharedHouse)).choices.length, 2)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }

  const request = { type: 'variant', position, techniqueOrder: [sharedHouse] } as const
  const configured = await runEngine({ ...request, operation: 'trace' })
  assert.equal(configured.rating.points, 88 * configured.steps.length)
  assert.ok(configured.steps.length >= 2)
  assert.ok(configured.steps.every(step => step.technique === sharedHouse))
  for (const [stepIndex, step] of configured.steps.entries()) {
    const replay = await runEngine({ ...request, operation: 'replay-step', stepIndex })
    assert.deepEqual(replay?.deduction, step)
    for (const action of step.actions) {
      assert.ok('eliminate' in action)
      assert.notEqual(source.solution[action.eliminate.cell], String(action.eliminate.digit))
      const bit = 1 << (action.eliminate.digit - 1)
      assert.equal(replay!.before.eliminations[action.eliminate.cell] & bit, 0)
      assert.equal(replay!.after.eliminations[action.eliminate.cell] & bit, bit)
    }
  }

  const previous = await runEngine({
    type: 'variant', operation: 'trace', position, techniqueOrder: modeOrder.filter(id => id !== houseSupport),
  })
  assert.equal(previous.rating.status, 'stalled')
  assert.equal(previous.steps.length, 12)
  assert.equal(previous.rating.points, 649)
  assert.equal(previous.steps[11].technique, rayHouses)
  assert.deepEqual(previous.steps[11].actions, [{ eliminate: { cell: 56, digit: 4 } }])

  const path = await puzzleSolution(game)
  assert.deepEqual(path.rating.status, { solved: 'medium' })
  assert.equal(path.board, source.solution)
  assert.equal(path.steps.length, 154)
  assert.equal(path.rating.score.counts[houseSupport], 18)
  assert.equal(path.rating.score.points, 4702)
  assert.equal(path.positions!.length, path.steps.length + 1)
  assert.equal((await ratePuzzle(game.givens, variant))?.points, 4702)

  const firstHouse = path.steps[11]
  const pairRemovals = [3, 6].map(digit => ({ eliminate: { cell: 44, digit } }))
  assert.equal(firstHouse.technique, houseSupport)
  assert.deepEqual(firstHouse.actions, pairRemovals)
  assert.ok('variant' in firstHouse.evidence)
  assert.match(firstHouse.evidence.variant.description, /r5c1 can contain only 3 or 6.*row 5 with r5c9/i)
  assert.match(firstHouse.evidence.variant.reason, /both 3 and 6.*Remove 3 and 6 from r5c9/i)
  assert.deepEqual(path.steps[12].actions, [{ place: { cell: 44, digit: 9 } }])

  let current = game
  for (const [index, step] of path.steps.entries()) {
    for (const action of step.actions) {
      const candidate = 'place' in action ? action.place : action.eliminate
      assert.equal(Number(source.solution[candidate.cell]) === candidate.digit, 'place' in action)
    }
    if (step.technique === houseSupport) {
      assert.ok('variant' in step.evidence)
      const deduction = step.evidence.variant.source!.deduction
      const replay = await runEngine({
        type: 'variant', operation: 'replay-step', position, techniqueOrder: modeOrder, stepIndex: index,
      })
      assert.deepEqual(replay?.deduction, deduction)
      assertRenbanHouseProof(source.puzzle, valuesOf(current), current.position.eliminations, deduction)
    }
    if (index === 11) {
      const selected = await puzzleHints(current, 'all', houseSupport)
      const choice = selected.choices[0]
      assert.deepEqual(choice.actions, firstHouse.actions)
      assert.deepEqual(choice.pattern, firstHouse.pattern)
      assert.ok('variant' in choice.evidence)
      assert.deepEqual(choice.evidence.variant.source?.deduction, firstHouse.evidence.variant.source?.deduction)
      const ordinary = await puzzleHints(current)
      assert.ok(ordinary.choices.some(choice => JSON.stringify(choice.actions) === JSON.stringify(pairRemovals)))
      const firstPage = await puzzleHints(current, 'all', houseSupport, 181)
      const retained = await puzzleHintPage(variant, 181, 0)
      assert.deepEqual(retained.choices, firstPage.choices)
      const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, variantPosition(variant, current.position))
      try {
        assert.equal(await scan.count(houseSupport), new Set(selected.choices.flatMap(choice =>
          choice.actions.map(action => JSON.stringify(action)))).size)
      } finally {
        scan.close()
      }
    }
    current = applyDeduction(current, step.actions, variantHouseMasks(variant.puzzle, valuesOf(current)))
  }
  assert.equal(isSolved(current), true)
  assert.equal(valuesOf(current), source.solution)
  assert.deepEqual(redo(undo(current)).position, current.position)
  assert.equal(
    await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 20_000 }),
    'search-limit',
  )
})

function assertRenbanHouseProof(puzzle: VariantPuzzle, values: string, eliminations: readonly number[], deduction: VariantDeduction) {
  const { evidence, actions } = deduction
  assert.ok(evidence.type === 'renban-house-support')
  const line = puzzle.rules?.[evidence.rule]
  assert.ok(line?.type === 'renban')
  assert.deepEqual(evidence.cells.slice(0, evidence.lineLength), line.cells)
  assert.deepEqual([...evidence.cells].sort((a, b) => a - b), [...variantHouseCells(evidence.house, puzzle)].sort((a, b) => a - b))
  const rules = puzzle.rules?.filter(rule => rule.type === 'diagonal' || rule.type === 'extra-house')
  const masks = variantHouseMasks({ ...puzzle, rules }, values, eliminations)
  const domains = evidence.cells.map(cell => values[cell] === '0' ? masks[cell] : 1 << (Number(values[cell]) - 1))
  assert.deepEqual(evidence.domains, domains)
  const supported = Array<number>(9).fill(0)
  let starts = 0
  const visit = (digits: number[], used: number) => {
    if (digits.length === 9) {
      const line = digits.slice(0, evidence.lineLength)
      const first = Math.min(...line)
      if (Math.max(...line) - first + 1 === line.length) {
        starts |= 1 << (first - 1)
        digits.forEach((digit, index) => { supported[index] |= 1 << (digit - 1) })
      }
      return
    }
    for (let digit = 1; digit <= 9; digit++) {
      const mask = 1 << (digit - 1)
      if (domains[digits.length] & ~used & mask) visit([...digits, digit], used | mask)
    }
  }
  visit([], 0)
  assert.ok(starts)
  assert.equal(evidence.starts, starts)
  assert.deepEqual(evidence.supported, supported)
  for (const action of actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    const index = evidence.cells.indexOf(cell)
    assert.ok(domains[index] & 1 << (digit - 1))
    assert.equal(supported[index] & 1 << (digit - 1), 0)
  }
}
