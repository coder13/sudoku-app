import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantLogicalMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertGroupOrderElimination, assertGroupOrderProof } from './helpers/group-order-truth.ts'
import { assertModularProof } from './helpers/modular-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/modular-${name}.json`, import.meta.url), 'utf8'))
const newman = load('newman') as { puzzle: VariantPuzzle; solution: string }
const share = (puzzle: VariantPuzzle) =>
  '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
const expected = [
  ['newman', 646, 75, 1006, 75, true, true, 'medium'],
  ['Hu9m', 2176, 161, 2606, 161, true, true, 'easy'],
  ['HCHW', 420, 21, 9058, 230, false, true, 'hard'],
] as const
for (const [
  id,
  nativePoints,
  nativeSteps,
  appPoints,
  appSteps,
  nativeComplete,
  appComplete,
  difficulty,
] of expected) {
  test(`complete source ${id} retains its independently checked full or partial logical paths`, async () => {
    const source =
      id === 'newman'
        ? newman
        : load('coach').examples.find((s: { url: string }) => s.url.endsWith(id))
    const { game } = await prepareImportedPuzzle(
        id === 'newman' ? share(source.puzzle) : source.code
      ),
      puzzle = game.variant!.puzzle
    assert.deepEqual(puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assertVariantCompletion(puzzle, source.solution)
    const candidates = await playCandidates(game)
    candidates!.forEach((mask, cell) => {
      if (game.givens[cell] === '0') assert.ok(mask & (1 << (Number(source.solution[cell]) - 1)))
    })
    const position = variantPosition(game.variant!)
    assert.equal(
      await runEngine({ type: 'variant', operation: 'analyze', position, techniqueOrder: [] }),
      'unique'
    )
    assert.equal(
      await runEngine({ type: 'variant', operation: 'solve', position, techniqueOrder: [] }),
      source.solution
    )
    assert.equal(
      (await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder: [] }))
        .points,
      0
    )
    const orders = [
      [
        (await runEngine({ type: 'techniques', variant: true })).defaultOrder,
        nativePoints,
        nativeSteps,
        nativeComplete,
      ],
      [await getVariantPlayOrder(puzzle), appPoints, appSteps, appComplete],
    ] as const
    for (const [techniqueOrder, points, steps, complete] of orders) {
      const trace = await runEngine({
        type: 'variant',
        operation: 'trace',
        position,
        techniqueOrder,
      })
      assert.equal(trace.rating.points, points)
      assert.equal(trace.steps.length, steps)
      if (id === 'HCHW' && techniqueOrder.includes('group-order-contradiction')) {
        const first = trace.steps.find(step => step.technique === 'group-order-contradiction')?.evidence
        assert.ok(first?.type === 'group-order')
        assert.equal(first.rejected.length, 4)
        assert.ok(first.rejected.every(order => order.checks.length === 0 && order.conflict.scope.type === 'pair'))
      }
      const hasGroupProof = trace.steps.some(proof => proof.technique === 'group-line-house-support')
      assert.equal(trace.rating.scoringVersion, hasGroupProof ? 9 : 8)
      if (complete) assert.deepEqual(trace.rating.status, { solved: difficulty })
      else assert.equal(trace.rating.status, 'stalled')
      let played = game
      for (const proof of trace.steps) {
        for (const action of proof.actions) {
          const c = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
        }
        if (proof.technique === 'modular') assertModularProof(puzzle, proof)
        if (proof.technique === 'group-order-contradiction')
          assertGroupOrderProof(puzzle, valuesOf(played), played.position.eliminations, proof)
        if (proof.technique === 'group-order-elimination')
          assertGroupOrderElimination(puzzle, valuesOf(played), played.position.eliminations, proof)
        played = applyDeduction(played, proof.actions, variantLogicalMasks(puzzle, valuesOf(played)))
      }
      assert.equal(isSolved(played), complete)
      if (complete) assert.equal(valuesOf(played), source.solution)
      assert.deepEqual(redo(undo(played)).position, played.position)
      assert.deepEqual(
        (await runEngine({
          type: 'variant',
          operation: 'replay-step',
          position,
          techniqueOrder,
          stepIndex: 0,
        }))!.deduction,
        trace.steps[0]
      )
    }
    assert.ok((await puzzleHints(game, 10)).choices.length > 1)
    const path = await puzzleSolution(game)
    assert.equal(path.steps.length, appSteps)
    if (appComplete) assert.equal(path.board, source.solution)
    else {
      assert.equal(path.rating.status, 'stalled')
      assert.notEqual(path.board, source.solution)
    }
  })
}

test('both Modular group orders exclude the same move in hints, Finder and replay', async () => {
  const technique = 'group-order-elimination'
  const source = load('coach').examples.find((item: { url: string }) => item.url.endsWith('HCHW'))
  const { game } = await prepareImportedPuzzle(source.code)
  const variant = game.variant!, { puzzle } = variant
  const position = variantPosition(variant)
  const techniqueOrder = await getVariantPlayOrder(puzzle)

  const previous = await runEngine({
    type: 'variant', operation: 'trace', position,
    techniqueOrder: techniqueOrder.filter(id => id !== technique),
  })
  assert.equal(previous.rating.status, 'stalled')
  assert.equal(previous.steps.length, 74)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  assert.equal(trace.rating.counts[technique], 30)
  const stepIndex = trace.steps.findIndex(step => step.technique === technique)
  assert.equal(stepIndex, 64)
  let played = game
  for (const [i, step] of trace.steps.slice(0, stepIndex).entries()) {
    const values = valuesOf(played)
    let masks = variantLogicalMasks(puzzle, values, played.position.eliminations)
    if (i === 49) {
      const presentation = variantHouseMasks(puzzle, values, played.position.eliminations)
      const shown = await puzzleHints(played, 'all', step.technique)
      assert.ok(shown.choices.some(hint => JSON.stringify(hint.actions) === JSON.stringify(step.actions)))
      assert.ok(step.actions.some(action => 'eliminate' in action &&
        !(presentation[action.eliminate.cell] & 1 << (action.eliminate.digit - 1))))
      masks = shown.candidates
    }
    const next = applyDeduction(played, step.actions, masks)
    assert.notEqual(next, played)
    played = next
  }
  const deduction = trace.steps[stepIndex]
  assert.equal(deduction.evidence.type, 'group-order-elimination')
  assert.deepEqual(deduction.actions, [{ eliminate: { cell: 6, digit: 4 } }])
  assert.deepEqual(deduction.evidence.branches.map(branch => branch.checks.map(check => check.scope.type)),
    [[], ['pair', 'house']])
  const replay = (await runEngine({
    type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex,
  }))!
  assert.deepEqual(replay.deduction, deduction)
  assert.deepEqual(replay.before.eliminations, played.position.eliminations)

  const collection = 2151
  const selected = await puzzleHints(played, 'all', technique, collection)
  assert.ok(selected.available > 1)
  const choices = [...selected.choices]
  while (choices.length < selected.available) {
    const page = await puzzleHintPage(variant, collection, choices.length)
    assert.ok(page.choices.length)
    choices.push(...page.choices)
  }
  const choice = choices.find(hint => JSON.stringify(hint.actions) === JSON.stringify(deduction.actions))
  assert.ok(choice && 'variant' in choice.evidence)
  assert.deepEqual(choice.evidence.variant.source?.deduction, deduction)
  assert.match(choice.evidence.variant.description, /Modular line.*two possible group orders/)
  assert.match(choice.evidence.variant.reason, /total of 7.*row 1.*Both orders rule out 4/)
  const ordinary = await puzzleHints(played)
  assert.ok(ordinary.choices.length > 1)
  assert.ok(ordinary.choices.some(hint => hint.technique === technique))
  const scan = watchTechniqueScan(valuesOf(played), played.position.eliminations, variantPosition(variant, played.position))
  try {
    assert.equal(await scan.count(technique),
      new Set(choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action)))).size)
    for (const hint of choices) {
      assert.ok('variant' in hint.evidence)
      assertGroupOrderElimination(puzzle, valuesOf(played), played.position.eliminations, hint.evidence.variant.source!.deduction)
    }
  } finally {
    scan.close()
    await runEngine({ type: 'release-hints', collection })
  }
  const next = applyDeduction(played, choice.actions, selected.candidates)
  assert.notEqual(next, played)
  assert.deepEqual(replay.after.eliminations, next.position.eliminations)
  assert.deepEqual(redo(undo(next)).position, next.position)
})

test('both-order practice has checked proofs and requires its pair clues', async () => {
  const technique = 'group-order-elimination'
  const catalog = await runEngine({ type: 'techniques', variant: true })
  const entry = catalog.techniques.find(item => item.id === technique)!
  assert.equal(entry.cost, 76)
  assert.equal(entry.difficulty, 'hard')
  assert.equal(entry.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique })
  assert.equal(examples.length, 3)
  for (const { position, deduction, suggestion } of examples) {
    assertGroupOrderElimination(position.puzzle, position.puzzle.givens, position.eliminations, deduction)
    assert.deepEqual(await runEngine({
      type: 'variant', operation: 'check-practice-move', technique, action: suggestion, position,
    }), deduction)
    const pure = { ...position.puzzle,
      rules: position.puzzle.rules!.filter(rule => rule.type === 'modular' || rule.type === 'entropic') }
    assert.deepEqual(await runEngine({
      type: 'variant', operation: 'hints', position: { ...position, puzzle: pure }, techniqueOrder: [technique],
    }), [])
  }
})

test('selected Modular proofs survive every page and Finder without changing exact validation', async () => {
  const rules = [...newman.puzzle.rules!]
  for (let a = 0; a < 81 && rules.length < 108; a++)
    for (let b = 0; b < 81 && rules.length < 108; b++) {
      if (
        newman.puzzle.givens[a] !== '0' &&
        newman.puzzle.givens[b] === '0' &&
        Number(newman.solution[a]) % 3 !== Number(newman.solution[b]) % 3
      )
        rules.push({ type: 'modular', cells: [a, b] })
    }
  const puzzle = { ...newman.puzzle, rules },
    { game } = await prepareImportedPuzzle(share(puzzle)),
    position = variantPosition(game.variant!),
    techniqueOrder = ['modular']
  const selected = await runEngine({
    type: 'variant',
    operation: 'hints',
    position,
    techniqueOrder,
    limit: 0xffff_ffff,
  })
  assert.ok(selected.length > 32)
  selected.forEach((proof) => assertModularProof(puzzle, proof))
  const full = await puzzleHints(game, 'all', 'modular'),
    first = await puzzleHints(game, 'all', 'modular', 558),
    all = [...first.choices]
  while (all.length < first.available) {
    const page = await puzzleHintPage(game.variant, 558, all.length)
    assert.ok(page.choices.length)
    all.push(...page.choices)
  }
  assert.deepEqual(all, full.choices)
  assert.equal(all.length, selected.length)
  const scan = watchTechniqueScan(valuesOf(game), undefined, position)
  try {
    assert.equal(
      await scan.count('modular'),
      new Set(selected.flatMap((proof) => proof.actions.map((action) => JSON.stringify(action))))
        .size
    )
  } finally {
    scan.close()
    await runEngine({ type: 'release-hints', collection: 558 })
  }
})

test('three practice positions, checked moves and fresh drills preserve independent group proofs and calibrated cost', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }),
    technique = catalog.techniques.find((t) => t.id === 'modular')!
  assert.equal(technique.cost, 27)
  assert.equal(technique.difficulty, 'medium')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({
    type: 'practice-examples',
    variant: true,
    technique: 'modular',
  })
  assert.equal(examples.length, 3)
  for (const exercise of examples) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assertModularProof(exercise.position.puzzle, exercise.deduction)
    assert.deepEqual(
      await runEngine({
        type: 'variant',
        operation: 'check-practice-move',
        position: exercise.position,
        technique: 'modular',
        action: exercise.suggestion,
      }),
      exercise.deduction
    )
    const c =
      'place' in exercise.suggestion ? exercise.suggestion.place : exercise.suggestion.eliminate
    assert.equal(
      await runEngine({
        type: 'variant',
        operation: 'check-practice-move',
        position: exercise.position,
        technique: 'modular',
        action: { eliminate: { cell: c.cell, digit: Number(counted.solution![c.cell]) } },
      }),
      null
    )
  }
  const fresh = await runEngine({
    type: 'generate-practice-example',
    variant: true,
    technique: 'modular',
    seed: 227,
    exclude: examples[0].position.puzzle.givens,
  })
  assert.equal(countLineSolutions(fresh.position.puzzle).count, 1)
  assertModularProof(fresh.position.puzzle, fresh.deduction)
})

test('complete mixed rules survive actual storage reload, progress history and sharing data', async () => {
  const source = load('coach').examples.find((s: { url: string }) => s.url.endsWith('Hu9m')),
    { game } = await prepareImportedPuzzle(source.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const,
    prior = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const module = '../src/sudoku/storage.ts?modular-save',
      { roomStore } = (await import(module)) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, (saved) => enter(saved, [0], 'value', 8))
    const reload = '../src/sudoku/storage.ts?modular-reload',
      restored = ((await import(reload)) as typeof import('../src/sudoku/storage.ts')).roomStore
        .getSnapshot()
        .games.find((g) => g.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], '8')
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual(
      (await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle,
      source.puzzle
    )
  } finally {
    keys.forEach((key, i) => {
      if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
})

test('generation preserves original paths, exact counts, preferred technique, score targets and family dependence', async () => {
  const template = { ...newman.puzzle, givens: '0'.repeat(81) }
  for (const seed of [17, 43, 227]) {
    const request = {
      type: 'generate-variant',
      seed,
      maxAttempts: 20,
      maxNodes: 50_000,
      template,
      givens: 30,
      variantClues: 12,
      requiredRule: 'modular',
      technique: { id: 'modular', mode: 'first' },
      techniqueOrder: ['modular', 'entropic', 'full-house', 'naked-single', 'hidden-single'],
    } as const
    const result = await runEngine(request)
    assert.equal(result.givens, 30)
    assert.equal(result.variantClues, 12)
    assert.deepEqual(result.puzzle.rules, template.rules)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: result.puzzle.rules!.filter(rule => rule.type !== 'modular') }).count, 2)
    const trace = await runEngine({
      type: 'variant',
      operation: 'trace',
      position: { puzzle: result.puzzle },
      techniqueOrder: request.techniqueOrder,
    })
    assert.equal(trace.steps[0].technique, 'modular')
    assertModularProof(result.puzzle, trace.steps[0])
    assert.deepEqual(trace.rating, result.rating)
    assert.deepEqual(
      (await runEngine({ ...request, score: [result.rating.points, result.rating.points] })).puzzle,
      result.puzzle
    )
    await assert.rejects(
      runEngine({ ...request, maxAttempts: 1, score: [0, 0] }),
      (error) => error instanceof Error && 'code' in error && error.code === 'invalid-rating-target'
    )
    assert.equal(
      (await prepareImportedPuzzle(share(result.puzzle))).game.variant!.solution,
      result.solution
    )
  }
  await assert.rejects(
    runEngine({
      type: 'generate-variant',
      seed: 17,
      maxAttempts: 1,
      maxNodes: 20_000,
      template: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'modular', cells: [40] }] },
      givens: 30,
      requiredRule: 'modular',
    }),
    (error) => error instanceof Error && 'code' in error && error.code === 'search-limit'
  )
})


test('all eight transformations preserve each complete source through exact Wasm analysis and solving', async () => {
  for (const source of [newman, ...load('coach').examples.filter((s: { puzzle?: VariantPuzzle }) => s.puzzle)])
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry), solution = transformedBoard(source.solution, symmetry)
      assertVariantCompletion(puzzle, solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle }, techniqueOrder: [] }), 'unique')
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle }, techniqueOrder: [] }), solution)
    }
})

test('switching digit partitions cannot reuse the other family’s compiled candidates', async () => {
  const givens = [...'0'.repeat(81)]; givens[0] = '1'
  for (const type of ['modular', 'entropic', 'modular'] as const) {
    const puzzle: VariantPuzzle = { version: 1, givens: givens.join(''), rules: [{ type, cells: [0, 40] }] }
    const masks = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    for (let digit = 1; digit <= 9; digit++)
      assert.equal(Boolean(masks[40] & (1 << (digit - 1))), type === 'modular' ? digit % 3 !== 1 : digit >= 4)
  }
})

test('custom and reversed orders preserve exactly the selected techniques and explain every Modular action', async () => {
  const position = { puzzle: newman.puzzle }, catalog = await runEngine({ type: 'techniques', variant: true })
  for (const techniqueOrder of [['modular'], [...catalog.defaultOrder].reverse(), catalog.defaultOrder.filter(id => id !== 'modular')]) {
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
    assert.deepEqual(trace.rating.techniqueOrder, techniqueOrder)
    for (const proof of trace.steps) {
      assert.ok(techniqueOrder.includes(proof.technique))
      if (proof.technique === 'modular') assertModularProof(newman.puzzle, proof)
      for (const action of proof.actions) {
        const candidate = 'place' in action ? action.place : action.eliminate
        assert.equal(Number(newman.solution[candidate.cell]) === candidate.digit, 'place' in action)
      }
    }
  }
})


test('exclusive opening checks other available techniques rather than treating a preferred first move as exclusive', async () => {
  const request = { type: 'generate-variant', seed: 17, maxAttempts: 1, maxNodes: 50_000,
    template: { ...newman.puzzle, givens: '0'.repeat(81) }, givens: 30, variantClues: 12,
    requiredRule: 'modular', techniqueOrder: ['modular', 'entropic', 'full-house', 'naked-single', 'hidden-single'] } as const
  const result = await runEngine({ ...request, technique: { id: 'modular', mode: 'first' } })
  const opening = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle: result.puzzle },
    techniqueOrder: request.techniqueOrder, limit: 0xffff_ffff })
  assert.ok(opening.some(proof => proof.technique === 'modular'))
  assert.ok(opening.some(proof => proof.technique !== 'modular'))
  await assert.rejects(runEngine({ ...request, technique: { id: 'modular', mode: 'exclusive-opening' } }),
    error => error instanceof Error && 'code' in error && error.code === 'search-limit')
})
