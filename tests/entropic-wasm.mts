import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertEntropicProof } from './helpers/entropic-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/entropic-${name}.json`, import.meta.url), 'utf8'))
const clover = load('clover') as { puzzle: VariantPuzzle; solution: string }
const share = (puzzle: VariantPuzzle) =>
  '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))
const expected = [
  ['clover', 626, 73, 1036, 73, true, true],
  ['EoGB', 452, 69, 982, 69, true, true],
  ['BSEJ', 89, 5, 1573, 92, false, true],
  ['Hyk5', 180, 9, 4444, 35, false, false],
  ['Hafj', 107, 5, 882, 23, false, false],
  ['Ksy3', 2340, 159, 2680, 159, true, true],
] as const
for (const [
  id,
  nativePoints,
  nativeSteps,
  appPoints,
  appSteps,
  nativeComplete,
  appComplete,
] of expected) {
  test(`complete source ${id} retains its independently checked full or partial logical paths`, async () => {
    const source =
      id === 'clover'
        ? clover
        : load('coach').examples.find((s: { url: string }) => s.url.endsWith(id))
    const { game } = await prepareImportedPuzzle(
        id === 'clover' ? share(source.puzzle) : source.code
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
      const hasGroupProof = trace.steps.some(proof => proof.technique === 'group-line-house-support')
      assert.equal(trace.rating.scoringVersion, hasGroupProof ? 9 : 8)
      if (complete) assert.deepEqual(trace.rating.status, { solved: 'medium' })
      else assert.equal(trace.rating.status, 'stalled')
      let played = game
      for (const proof of trace.steps) {
        for (const action of proof.actions) {
          const c = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
        }
        if (proof.technique === 'entropic') assertEntropicProof(puzzle, proof)
        played = applyDeduction(played, proof.actions, variantHouseMasks(puzzle, valuesOf(played)))
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

test('the two published Entropic row-four proofs appear in hints and Finder at the old stalls', async () => {
  const technique = 'group-line-house-support'
  for (const [index, id] of ['Hyk5', 'Hafj'].entries()) {
    const source = load('coach').examples.find((item: { url: string }) => item.url.endsWith(id))
    const { game } = await prepareImportedPuzzle(source.code)
    const variant = game.variant!, { puzzle } = variant
    const position = variantPosition(variant)
    const legacy = await runEngine({
      type: 'variant', operation: 'trace', position, techniqueOrder: await getVariantPlayOrder(),
    })
    assert.equal(legacy.steps.length, index === 0 ? 12 : 5)
    assert.equal(legacy.rating.scoringVersion, 8)
    let played = game
    for (const { actions } of legacy.steps)
      played = applyDeduction(played, actions, variantHouseMasks(puzzle, valuesOf(played)))

    const collection = 2051 + index
    const selected = await puzzleHints(played, 'all', technique, collection)
    const all = [...selected.choices]
    while (all.length < selected.available) {
      const page = await puzzleHintPage(variant, collection, all.length)
      assert.ok(page.choices.length)
      all.push(...page.choices)
    }
    const current = await puzzleHints(played)
    assert.ok(current.choices.some(choice => choice.technique === technique))
    const row = all.find(choice => {
      const source = 'variant' in choice.evidence ? choice.evidence.variant.source?.deduction.evidence : undefined
      return source?.type === 'group-line-house' && 'row' in source.house && source.house.row === 3
    })
    assert.ok(row && 'variant' in row.evidence)
    assert.match(row.evidence.variant.description, /repeats three groups.*row 4/)
    assert.match(row.evidence.variant.reason, /Only these group orders fit row 4/)
    const proof = row.evidence.variant.source!.deduction.evidence
    assert.ok(proof.type === 'group-line-house')
    assert.equal(proof.lineCells.length, index === 0 ? 36 : 21)
    assert.deepEqual(proof.cases.filter(order => !order.conflict).map(order => order.groups),
      index === 0 ? [[7, 56, 448], [56, 7, 448]] : [[7, 56, 448], [448, 56, 7]])
    for (const action of row.actions) {
      assert.ok('eliminate' in action)
      assert.notEqual(Number(source.solution[action.eliminate.cell]), action.eliminate.digit)
    }
    const scan = watchTechniqueScan(valuesOf(played), played.position.eliminations, variantPosition(variant, played.position))
    try {
      assert.deepEqual((await puzzleHintPage(variant, collection, 0)).choices, selected.choices)
      assert.equal(await scan.count(technique),
        new Set(all.flatMap(item => item.actions.map(action => JSON.stringify(action)))).size)
    } finally {
      scan.close()
      await runEngine({ type: 'release-hints', collection })
    }
    const path = await puzzleSolution(game)
    assert.equal(path.rating.status, 'stalled')
    assert.equal(path.rating.scoringVersion, 9)
    const stepIndex = path.steps.findIndex(hint => hint.technique === technique)
    assert.ok(stepIndex >= 0)
    const replay = await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder: await getVariantPlayOrder(puzzle), stepIndex })
    assert.deepEqual(replay?.deduction.actions, path.steps[stepIndex].actions)
  }
})

test('selected Entropic proofs survive every page and Finder without changing exact validation', async () => {
  const rules = [...clover.puzzle.rules!]
  for (let a = 0; a < 81 && rules.length < 108; a++)
    for (let b = 0; b < 81 && rules.length < 108; b++) {
      if (
        clover.puzzle.givens[a] !== '0' &&
        clover.puzzle.givens[b] === '0' &&
        Math.floor((Number(clover.solution[a]) - 1) / 3) !==
          Math.floor((Number(clover.solution[b]) - 1) / 3)
      )
        rules.push({ type: 'entropic', cells: [a, b] })
    }
  const puzzle = { ...clover.puzzle, rules },
    { game } = await prepareImportedPuzzle(share(puzzle)),
    position = variantPosition(game.variant!),
    techniqueOrder = ['entropic']
  const selected = await runEngine({
    type: 'variant',
    operation: 'hints',
    position,
    techniqueOrder,
    limit: 0xffff_ffff,
  })
  assert.ok(selected.length > 32)
  selected.forEach((proof) => assertEntropicProof(puzzle, proof))
  const full = await puzzleHints(game, 'all', 'entropic'),
    first = await puzzleHints(game, 'all', 'entropic', 558),
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
      await scan.count('entropic'),
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
    technique = catalog.techniques.find((t) => t.id === 'entropic')!
  assert.equal(technique.cost, 27)
  assert.equal(technique.difficulty, 'medium')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({
    type: 'practice-examples',
    variant: true,
    technique: 'entropic',
  })
  assert.equal(examples.length, 3)
  for (const exercise of examples) {
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assertEntropicProof(exercise.position.puzzle, exercise.deduction)
    assert.deepEqual(
      await runEngine({
        type: 'variant',
        operation: 'check-practice-move',
        position: exercise.position,
        technique: 'entropic',
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
        technique: 'entropic',
        action: { eliminate: { cell: c.cell, digit: Number(counted.solution![c.cell]) } },
      }),
      null
    )
  }
  const fresh = await runEngine({
    type: 'generate-practice-example',
    variant: true,
    technique: 'entropic',
    seed: 227,
    exclude: examples[0].position.puzzle.givens,
  })
  assert.equal(countLineSolutions(fresh.position.puzzle).count, 1)
  assertEntropicProof(fresh.position.puzzle, fresh.deduction)
})

test('closed paths survive actual storage reload, progress history and sharing data', async () => {
  const source = load('coach').examples.find((s: { url: string }) => s.url.endsWith('Hyk5')),
    { game } = await prepareImportedPuzzle(source.code)
  const keys = ['window', 'localStorage', 'sessionStorage'] as const,
    prior = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: new MemoryStorage(), configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const module = '../src/sudoku/storage.ts?entropic-save',
      { roomStore } = (await import(module)) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, (saved) => enter(saved, [0], 'value', 8))
    const reload = '../src/sudoku/storage.ts?entropic-reload',
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
  const template = { ...clover.puzzle, givens: '0'.repeat(81) }
  for (const seed of [17, 43, 227]) {
    const request = {
      type: 'generate-variant',
      seed,
      maxAttempts: 20,
      maxNodes: 50_000,
      template,
      givens: 30,
      variantClues: 8,
      requiredRule: 'entropic',
      technique: { id: 'entropic', mode: 'first' },
      techniqueOrder: ['entropic', 'full-house', 'naked-single', 'hidden-single'],
    } as const
    const result = await runEngine(request)
    assert.equal(result.givens, 30)
    assert.equal(result.variantClues, 8)
    assert.deepEqual(result.puzzle.rules, template.rules)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    const trace = await runEngine({
      type: 'variant',
      operation: 'trace',
      position: { puzzle: result.puzzle },
      techniqueOrder: request.techniqueOrder,
    })
    assert.equal(trace.steps[0].technique, 'entropic')
    assertEntropicProof(result.puzzle, trace.steps[0])
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
      template: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'entropic', cells: [40] }] },
      givens: 30,
      requiredRule: 'entropic',
    }),
    (error) => error instanceof Error && 'code' in error && error.code === 'search-limit'
  )
})
