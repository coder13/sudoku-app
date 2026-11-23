import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import type { Game } from '../src/sudoku/game.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantIdForPuzzle, variantLogicalMasks } from '../src/sudoku/variants.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertGroupLineProof } from './helpers/group-line-truth.ts'
import { assertModularProof } from './helpers/modular-truth.ts'
import { assertSumPairProof } from './helpers/adjacent-total-truth.ts'
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
  ['Hu9m', 2126, 160, 2566, 160, true, true, 'easy'],
  ['HCHW', 1604, 75, 4665, 202, false, true, 'medium'],
] as const

test('both Modular group orders rule out a candidate with a replayable hint proof', async () => {
  const technique = 'group-order-elimination'
  const [exercise] = await runEngine({ type: 'practice-examples', variant: true, technique })
  const { position, deduction } = exercise
  const puzzle = position.puzzle
  const source = load('coach').examples.find(({ url }: { url: string }) => url.endsWith('/HCHW'))
  const { game } = await prepareImportedPuzzle(source.code)
  assert.ok((await getVariantPlayOrder(game.variant!.puzzle)).includes(technique))
  // Apply this rule on the untouched practice position so earlier techniques do not
  // consume the candidate before the independent two-order proof is checked.
  const techniqueOrder = [technique]
  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder })
  const stepIndex = trace.steps.findIndex(step => step.technique === technique)
  assert.ok(stepIndex >= 0)
  assert.deepEqual(trace.steps[stepIndex], deduction)
  assert.equal(deduction.evidence.type, 'group-order-elimination')
  assert.equal(deduction.evidence.branches.length, 2)
  assert.ok(deduction.evidence.branches.some(({ checks }) => checks.some(check => check.scope.type === 'pair')))
  assert.ok(deduction.evidence.branches.some(({ checks }) => checks.some(check => check.scope.type === 'house')))
  const replay = await runEngine({ type: 'variant', operation: 'replay-step', position, techniqueOrder, stepIndex })
  assert.deepEqual(replay?.deduction, deduction)
  const choice = variantHintChoice(deduction, puzzle)
  assert.ok('variant' in choice.evidence)
  assert.match(choice.evidence.variant.description, /Modular line.*two possible group orders/)
  assert.match(choice.evidence.variant.reason, /Both orders rule out/)
  assert.match(choice.evidence.variant.reason, /row 1|column|box/)
})

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
      const hasGroupOrderElimination = trace.steps.some(step => step.technique === 'group-order-elimination')
      assert.equal(trace.rating.scoringVersion, hasGroupOrderElimination ? 23 : 22)
      if (complete) assert.deepEqual(trace.rating.status, { solved: difficulty })
      else assert.equal(trace.rating.status, 'stalled')
      let played = game
      for (const proof of trace.steps) {
        for (const action of proof.actions) {
          const c = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
        }
        if (proof.technique === 'modular') assertModularProof(puzzle, proof)
        if (proof.evidence.type === 'sum-pair') assertSumPairProof(puzzle, proof)
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
    assert.ok('rating' in path)
    assert.equal(path.steps.length, appSteps)
    if (appComplete) assert.equal(path.board, source.solution)
    else {
      assert.equal(path.rating.status, 'stalled')
      assert.notEqual(path.board, source.solution)
    }

    if (id === 'HCHW') {
      const techniqueOrder = await getVariantPlayOrder()
      const previous = await runEngine({
        type: 'variant', operation: 'trace', position,
        techniqueOrder: techniqueOrder.filter(technique => technique !== 'modular'),
      })
      assert.equal(previous.steps.length, 25)
      const { entries, eliminations } = previous.end
      assert.equal(entries, '0'.repeat(81))
      const stalled = { ...game, position: { ...game.position, entries, eliminations: [...eliminations] } }
      const choices = await puzzleHints(stalled, 'all', 'modular')
      const combined = choices.choices.find(hint => 'variant' in hint.evidence &&
        hint.evidence.variant.source?.deduction.evidence.type === 'constraint' &&
        hint.evidence.variant.source.deduction.evidence.rules.join(',') === '15,5')
      assert.ok(combined && 'variant' in combined.evidence && combined.evidence.variant.source)
      const { description, reason, source: { deduction } } = combined.evidence.variant
      assert.match(description, /R6C2 and R5C2 add to 7/i)
      assert.match(reason, /\{2, 5, 8\}.*remaining position/)
      assertModularProof(puzzle, deduction)
      assert.equal(combined.actions.length, 19)
      assert.ok(choices.candidates)
      const played = applyDeduction(stalled, combined.actions, choices.candidates)
      assert.notEqual(played, stalled)
      const scan = watchTechniqueScan(valuesOf(stalled), eliminations, previous.end)
      const targets = new Set(choices.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      try { assert.equal(await scan.count('modular'), targets.size) } finally { scan.close() }
      const continuation = await runEngine({
        type: 'variant', operation: 'trace', position: variantPosition(game.variant!, played.position), techniqueOrder,
      })
      assert.ok(continuation.end.eliminations[47] & (1 << 7), 'the 13 sum also removes 8 in R6C3')
    }
  })
}

test('the published HCHW stall offers two explained Modular and row hints in Play and Finder', async () => {
  const { code, solution } = load('coach').examples.find(({ url }: { url: string }) => url.endsWith('/HCHW'))
  const { game } = await prepareImportedPuzzle(code)
  const { eliminations } = load('hchw-stall')
  const stalled = { ...game, position: { ...game.position, eliminations } }
  const { choices, candidates } = await puzzleHints(stalled, 'all', 'modular')
  const expected = [
    { cells: [4, 7], row: 0, rule: 19, digits: [1, 2, 3] },
    { cells: [29, 32], row: 3, rule: 17, digits: [4, 5, 6] },
  ]
  const houseChoices = choices.filter(hint => 'variant' in hint.evidence &&
    hint.evidence.variant.source?.deduction.evidence.type === 'group-line-house')
  assert.equal(houseChoices.length, expected.length)
  assert.ok(candidates)
  const position = variantPosition(game.variant!, stalled.position)
  const scan = watchTechniqueScan(valuesOf(stalled), eliminations, position)
  try {
    const targets = new Set(choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.equal(await scan.count('modular'), targets.size)
  } finally { scan.close() }
  for (const [i, { cells, row, rule, digits }] of expected.entries()) {
    const hint = houseChoices[i]
    assert.ok('variant' in hint.evidence && hint.evidence.variant.source)
    const { description, reason, source: { deduction } } = hint.evidence.variant
    assertModularProof(position.puzzle, deduction)
    assert.deepEqual(deduction.evidence, {
      type: 'group-line-house', rule, house: { row }, cells,
      domains: cells.map(cell => 511 ^ eliminations[cell]),
    })
    assert.match(description, new RegExp(`same remainder group and different digits in row ${row + 1}`))
    assert.match(reason, /only candidate in that group/)
    assert.deepEqual(hint.actions, digits.map(digit => ({ eliminate: { cell: cells[1], digit } })))
    assert.ok(digits.every(digit => Number(solution[cells[1]]) !== digit))
    const played = applyDeduction(stalled, hint.actions, candidates)
    assert.equal(valuesOf(played), valuesOf(stalled))
    assert.notEqual(played, stalled)
    assert.deepEqual(undo(played).position, stalled.position)
    assert.deepEqual(redo(undo(played)).position, played.position)
  }
})

test('HCHW shows how the line and the off-line sum rule out 5 in R1C8', async () => {
  const { code, solution } = load('coach').examples.find(({ url }: { url: string }) => url.endsWith('/HCHW'))
  const { game } = await prepareImportedPuzzle(code)
  const { eliminations } = load('hchw-sum-house')
  const stalled = { ...game, position: { ...game.position, eliminations } }
  const { choices, candidates } = await puzzleHints(stalled, 'all', 'modular')
  const actions = [{ eliminate: { cell: 7, digit: 5 } }]
  const hint = choices.find(hint => 'variant' in hint.evidence &&
    hint.evidence.variant.source?.deduction.evidence.type === 'group-line-sum-house' &&
    hint.evidence.variant.source.deduction.evidence.cells.join(',') === '7,4,3')
  assert.ok(hint && 'variant' in hint.evidence && hint.evidence.variant.source)
  assert.deepEqual(hint.actions, actions)
  assert.notEqual(solution[7], '5')
  const { description, reason, source: { deduction } } = hint.evidence.variant
  assert.match(description, /R1C5 and R1C4 add to 7/i)
  assert.match(reason, /R1C8 were 5.*Only 2.*R1C4 would also be 5.*5 in row 1/i)
  assert.deepEqual(deduction.evidence, {
    type: 'group-line-sum-house', rules: [19, 10], house: { row: 0 },
    cells: [7, 4, 3], domains: [504, 7, 56], total: 7,
  })
  assertModularProof(game.variant!.puzzle, deduction)

  const columnHint = choices.find(hint => 'variant' in hint.evidence &&
    hint.evidence.variant.source?.deduction.evidence.type === 'group-line-sum-house' &&
    hint.evidence.variant.source.deduction.evidence.cells.join(',') === '16,43,52')
  assert.ok(columnHint && 'variant' in columnHint.evidence && columnHint.evidence.variant.source)
  assert.deepEqual(columnHint.actions, [5, 8].map(digit => ({ eliminate: { cell: 16, digit } })))
  assert.match(columnHint.evidence.variant.reason, /It cannot use 5, which would repeat in column 8.*Only 8.*R6C8 would also be 5.*5 in column 8/i)
  assertModularProof(game.variant!.puzzle, columnHint.evidence.variant.source.deduction)

  const position = variantPosition(game.variant!, stalled.position)
  const scan = watchTechniqueScan(valuesOf(stalled), eliminations, position)
  try {
    const targets = new Set(choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.equal(await scan.count('modular'), targets.size)
  } finally { scan.close() }
  assert.ok(candidates)
  const played = applyDeduction(stalled, actions, candidates)
  assert.ok((played.position.eliminations?.[7] ?? 0) & (1 << 4))
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
})

test('HCHW surfaces both four-cell Modular hints, including the column and box proof', async () => {
  const archived: { url: string; entries: string; before: number[]; after: number[] } =
    JSON.parse(readFileSync(new URL('./fixtures/overlay-hchw-linked.json', import.meta.url), 'utf8'))
  const { code, solution } = load('coach').examples.find(({ url }: { url: string }) => url === archived.url)
  const { game } = await prepareImportedPuzzle(code)
  const stalled = { ...game, position: { ...game.position, entries: archived.entries, eliminations: archived.before } }
  const { candidates, choices } = await puzzleHints(stalled, 'all', 'modular')
  assert.ok(candidates)
  const position = variantPosition(game.variant!, stalled.position)
  let played: Game = stalled
  for (const [target, partner, needsBox] of [[1, 28, false], [10, 27, true]] as const) {
    const hint = choices.find(hint => 'variant' in hint.evidence &&
      hint.evidence.variant.source?.deduction.evidence.type === 'group-line-disjoint-sum' &&
      hint.evidence.variant.source.deduction.evidence.cells.join(',') === [target, partner, 46, 37].join(','))
    assert.ok(hint && 'variant' in hint.evidence && hint.evidence.variant.source)
    const { reason, source: { deduction } } = hint.evidence.variant
    assert.match(reason, /4 repeats in column 2/i)
    assert.match(reason, needsBox ? /1 repeats in box 4/i : /1 repeats in column 2/i)
    assert.deepEqual(hint.actions, [4, 6].map(digit => ({ eliminate: { cell: target, digit } })))
    assert.ok(![4, 6].includes(Number(solution[target])))
    assertModularProof(position.puzzle, deduction)
    played = applyDeduction(played, hint.actions, candidates)
  }

  const scan = watchTechniqueScan(valuesOf(stalled), archived.before, position)
  try {
    const targets = new Set(choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.equal(await scan.count('modular'), targets.size)
  } finally { scan.close() }
  assert.deepEqual(undo(undo(played)).position, stalled.position)
  assert.deepEqual(redo(redo(undo(undo(played)))).position, played.position)
  const trace = await runEngine({
    type: 'variant', operation: 'trace', position: variantPosition(game.variant!, played.position), techniqueOrder: ['dynamic-forcing-net'],
  })
  assert.deepEqual(trace.end.eliminations, archived.after)
})

test('Play ranks the HCHW line-and-box hint above the forcing proof', async () => {
  const archived: { url: string; entries: string; before: number[] } =
    JSON.parse(readFileSync(new URL('./fixtures/overlay-hchw-linked.json', import.meta.url), 'utf8'))
  const { code, solution } = load('coach').examples.find(({ url }: { url: string }) => url === archived.url)
  const { game } = await prepareImportedPuzzle(code)
  const eliminations = archived.before.map((mask, cell) => [1, 10].includes(cell) ? mask | (1 << 3) | (1 << 5) : mask)
  const stalled = { ...game, position: { ...game.position, entries: archived.entries, eliminations } }
  const { candidates, choices } = await puzzleHints(stalled, 'all', 'modular')
  assert.ok(candidates)
  const hint = choices.find(hint => 'variant' in hint.evidence &&
    hint.evidence.variant.source?.deduction.evidence.type === 'group-line-house-triplet' &&
    hint.evidence.variant.source.deduction.evidence.cells.join(',') === '19,28,27,37')
  assert.ok(hint && 'variant' in hint.evidence && hint.evidence.variant.source)
  assert.deepEqual(hint.actions, [5, 8].map(digit => ({ eliminate: { cell: 19, digit } })))
  assert.ok(![5, 8].includes(Number(solution[19])))
  const { reason, source: { deduction } } = hint.evidence.variant
  assert.match(reason, /r3c2 were 5 or 8/i)
  assert.match(reason, /use 1 and 3.*r5c2 with no candidate in box 4/i)
  assertModularProof(game.variant!.puzzle, deduction)
  const ranked = (await puzzleHints(stalled)).choices
  const chain = ranked[0]
  assert.ok(chain && 'variant' in chain.evidence)
  assert.equal(chain.evidence.variant.source?.deduction.evidence.type, 'group-line-sum-chain')
  const lineAndBoxIndex = ranked.findIndex(choice =>
    JSON.stringify(choice.actions) === JSON.stringify(hint.actions))
  const forcingIndex = ranked.findIndex(choice =>
    choice.technique === 'dynamic-forcing-net' &&
    JSON.stringify(choice.actions) === JSON.stringify([{ eliminate: { cell: 19, digit: 8 } }]))
  assert.ok(lineAndBoxIndex > 0)
  assert.ok(forcingIndex > lineAndBoxIndex)
  const position = variantPosition(game.variant!, stalled.position)
  const finder = watchTechniqueScan(valuesOf(stalled), eliminations, position)
  try {
    const targets = new Set(choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.equal(await finder.count('modular'), targets.size)
  } finally { finder.close() }
  const played = applyDeduction(stalled, hint.actions, candidates)
  assert.equal((played.position.eliminations?.[19] ?? 0) & (16 | 128), 16 | 128)
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)

  const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: await getVariantPlayOrder() })
  assert.equal(trace.steps[0].technique, 'modular')
  assert.deepEqual(trace.steps[0].actions, hint.actions)
  assert.ok(!trace.steps.some(step => step.technique === 'dynamic-forcing-net' &&
    step.actions.some(action => 'eliminate' in action && action.eliminate.cell === 19 && action.eliminate.digit === 8)))
})

test('HCHW offers the linked row sums and their reserved digits in Play and Finder', async () => {
  const { url, entries, after }: { url: string; entries: string; after: number[] } =
    JSON.parse(readFileSync(new URL('./fixtures/overlay-hchw-linked.json', import.meta.url), 'utf8'))
  const { code, solution } = load('coach').examples.find((source: { url: string }) => source.url === url)
  const { game } = await prepareImportedPuzzle(code)
  const eliminations = after.map((mask, cell) => cell === 19 ? mask | (1 << 4) : mask)
  const stalled = { ...game, position: { ...game.position, entries, eliminations } }
  const { choices, candidates } = await puzzleHints(stalled)
  const hint = choices[0]
  assert.ok(candidates && hint && 'variant' in hint.evidence && hint.evidence.variant.source)
  const { description, reason, source: { deduction } } = hint.evidence.variant
  assert.equal(hint.technique, 'modular')
  assert.deepEqual(deduction.evidence, {
    type: 'group-line-sum-chain', rules: [19, 10, 9], cells: [4, 3, 2, 7],
    house: { row: 0 }, totals: [7, 13], domains: [7, 56, 448, 488],
    supported: [5, 40, 320, 40], locked: 40,
  })
  assert.match(description, /R1C3 6 more than R1C5/i)
  assert.match(reason, /R1C5 were 2.*put 5 in R1C4 and 8 in R1C3/i)
  assert.match(reason, /always use 4 and 6.*other cells in row 1/i)

  const position = variantPosition(game.variant!, stalled.position)
  assertModularProof(position.puzzle, deduction)
  const expected = [[0, 4, 6], [2, 8], [3, 5], [4, 2], [5, 4, 6], [6, 4, 6], [7, 7, 8, 9], [8, 4, 6]]
    .flatMap(([cell, ...digits]) => digits.map(digit => ({ eliminate: { cell, digit } })))
  assert.deepEqual(hint.actions, expected)
  assert.ok(expected.every(({ eliminate: { cell, digit } }) => Number(solution[cell]) !== digit))

  const scan = watchTechniqueScan(valuesOf(stalled), eliminations, position)
  try { assert.equal(await scan.count('modular'), expected.length + 3) } finally { scan.close() }
  const played = applyDeduction(stalled, hint.actions, candidates)
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
  const trace = await runEngine({
    type: 'variant', operation: 'trace', position: variantPosition(game.variant!, played.position),
    techniqueOrder: await getVariantPlayOrder(),
  })
  const placements = trace.steps.flatMap(step => step.actions)
    .flatMap(action => 'place' in action ? [action.place] : [])
  assert.equal(placements.length, 81)
  assert.ok(placements.every(({ cell, digit }) => Number(solution[cell]) === digit))
  assert.deepEqual(trace.rating.status, { solved: 'medium' })
})

test('HCHW Play and Finder combine two sums across box 2 and row 3', async () => {
  const { url, entries, eliminations }: { url: string; entries: string; eliminations: number[] } = load('hchw-cross-house')
  const { code, solution } = load('coach').examples.find((source: { url: string }) => source.url === url)
  const { game } = await prepareImportedPuzzle(code)
  const stalled = { ...game, position: { ...game.position, entries, eliminations } }
  const { choices, candidates } = await puzzleHints(stalled)
  assert.deepEqual(choices.slice(0, 3).map(choice => choice.technique), ['adjacent-total', 'adjacent-total', 'modular'])
  const hint = choices.find(choice => 'variant' in choice.evidence &&
    choice.evidence.variant.source?.deduction.evidence.type === 'group-line-sum-chain')
  assert.ok(candidates && hint && 'variant' in hint.evidence && hint.evidence.variant.source)
  const { description, reason, source: { deduction } } = hint.evidence.variant
  assert.equal(hint.technique, 'modular')
  assert.deepEqual(deduction.evidence, {
    type: 'group-line-sum-chain', rules: [18, 8, 7], cells: [14, 23, 22, 25],
    houses: [{ row: 2 }, { region: 1 }], totals: [13, 7], domains: [320, 40, 5, 365],
    supported: [320, 40, 5, 360], locked: 0,
  })
  assert.match(description, /R2C6 and R3C6 add to 13.*R3C6 and R3C5 add to 7/i)
  assert.match(reason, /R3C8 were 1.*R2C6 would have to be 7.*repeats 1 in row 3/i)
  assert.match(reason, /R3C8 were 3.*R2C6 would have to be 9.*repeats 3 in row 3/i)

  const position = variantPosition(game.variant!, stalled.position)
  const actions = [1, 3].map(digit => ({ eliminate: { cell: 25, digit } }))
  assert.deepEqual(hint.actions, actions)
  assertModularProof(position.puzzle, deduction)
  assert.ok(actions.every(({ eliminate: { cell, digit } }) => Number(solution[cell]) !== digit))
  const scan = watchTechniqueScan(valuesOf(stalled), eliminations, position)
  try { assert.equal(await scan.count('modular'), 6) } finally { scan.close() }
  const played = applyDeduction(stalled, hint.actions, candidates)
  assert.equal(played.position.eliminations![25], eliminations[25] | 5)
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
})

test('HCHW Play and Finder explain eight removals from two pairs of separate sums', async () => {
  const { url, entries, eliminations }: { url: string; entries: string; eliminations: number[] } = load('hchw-separate-sums')
  const { code, solution } = load('coach').examples.find((source: { url: string }) => source.url === url)
  const { game } = await prepareImportedPuzzle(code)
  const stalled = { ...game, position: { ...game.position, entries, eliminations } }
  const ranked = await puzzleHints(stalled)
  const choices = ranked.choices.filter(choice => choice.technique === 'adjacent-total')
  const { candidates } = ranked
  assert.ok(candidates)
  assert.equal(choices.length, 2)
  assert.deepEqual(choices, ranked.choices.slice(0, 2))
  const position = variantPosition(game.variant!, stalled.position)
  const expected = [
    { rules: [8, 9], cells: [9, 10], digits: [7, 9] },
    { rules: [6, 10], cells: [30, 39], digits: [4, 6] },
  ]
  for (const [i, hint] of choices.entries()) {
    assert.ok('variant' in hint.evidence && hint.evidence.variant.source)
    const { deduction } = hint.evidence.variant.source
    const { rules, cells, digits } = expected[i]
    assert.ok(deduction.evidence.type === 'sum-pair')
    assert.deepEqual(deduction.evidence.rules, rules)
    assert.deepEqual(hint.actions, cells.flatMap(cell => digits.map(digit => ({ eliminate: { cell, digit } }))))
    assertSumPairProof(position.puzzle, deduction)
    assert.ok(cells.every(cell => !digits.includes(Number(solution[cell]))))
  }

  const [, hint] = choices
  assert.ok('variant' in hint.evidence)
  assert.match(hint.evidence.variant.reason, /both be 1.*repeats 1 in column 5/i)
  assert.match(hint.evidence.variant.reason, /both be 3.*repeats 3 in column 5/i)
  assert.match(hint.evidence.variant.reason, /R4C4 shares row 4 with R4C5 and column 4 with R1C4.*Remove 4 and 6 from R4C4/i)
  const scan = watchTechniqueScan(valuesOf(stalled), eliminations, position)
  try { assert.equal(await scan.count('adjacent-total'), 8) } finally { scan.close() }
  const played = applyDeduction(stalled, hint.actions, candidates)
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
})

test('HCHW explains the box 8 group and sum across both line phases', async () => {
  const { url, phase }: { url: string; phase: { entries: string; eliminations: number[] } } = load('hchw-phase-and-chain')
  const { code, solution } = load('coach').examples.find((source: { url: string }) => source.url === url)
  const { game } = await prepareImportedPuzzle(code)
  const stalled = { ...game, position: { ...game.position, ...phase } }
  const ranked = await puzzleHints(stalled)
  const hint = ranked.choices.find(choice => 'variant' in choice.evidence &&
    choice.evidence.variant.source?.deduction.evidence.type === 'group-line-phase-sum')
  assert.ok(ranked.candidates && hint && 'variant' in hint.evidence && hint.evidence.variant.source)
  const { description, reason, source: { deduction } } = hint.evidence.variant
  assert.match(description, /R8C7 uses the group.*R8C6 and R7C6 add to 13/i)
  assert.match(reason, /R8C6 were 4.*repeating 9 in box 8/i)
  assert.match(reason, /R8C6 were 6.*repeating 7 in box 8/i)
  const position = variantPosition(game.variant!, stalled.position)
  assertModularProof(position.puzzle, deduction)
  assert.deepEqual(hint.actions, [[59, 7, 9], [68, 4, 6]]
    .flatMap(([cell, ...digits]) => digits.map(digit => ({ eliminate: { cell, digit } }))))
  assert.ok(hint.actions.every(action => 'eliminate' in action && Number(solution[action.eliminate.cell]) !== action.eliminate.digit))
  const selected = await puzzleHints(stalled, 'all', 'modular')
  const targets = new Set(selected.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
  const scan = watchTechniqueScan(valuesOf(stalled), phase.eliminations, position)
  try { assert.equal(await scan.count('modular'), targets.size) } finally { scan.close() }
  const played = applyDeduction(stalled, hint.actions, ranked.candidates)
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
})

test('HCHW explains why R2C2 cannot be 3 and finishes the imported puzzle', async () => {
  const { url, chain }: { url: string; chain: { entries: string; eliminations: number[] } } = load('hchw-phase-and-chain')
  const { code, solution } = load('coach').examples.find((source: { url: string }) => source.url === url)
  const { game } = await prepareImportedPuzzle(code)
  const stalled = { ...game, position: { ...game.position, ...chain } }
  const { choices, candidates } = await puzzleHints(stalled)
  const actions = [{ eliminate: { cell: 10, digit: 3 } }]
  const hint = choices.find(hint => 'variant' in hint.evidence &&
    hint.evidence.variant.source?.deduction.evidence.type === 'group-sum-implication' &&
    JSON.stringify(hint.actions) === JSON.stringify(actions))
  assert.ok(candidates && hint && 'variant' in hint.evidence && hint.evidence.variant.source)
  const { description, reason, source: { deduction } } = hint.evidence.variant
  assert.match(description, /If R2C2 were 3.*force a repeat in row 2/i)
  assert.match(reason, /13 sum with R1C3 makes R1C4 4/i)
  assert.match(reason, /R2C7 3.*repeats 3 in row 2/i)
  const position = variantPosition(game.variant!, stalled.position)
  assertModularProof(position.puzzle, deduction)
  const selected = await puzzleHints(stalled, 'all', 'modular')
  const targets = new Set(selected.choices.flatMap(choice => choice.actions.map(action => JSON.stringify(action))))
  const scan = watchTechniqueScan(valuesOf(stalled), chain.eliminations, position)
  try { assert.equal(await scan.count('modular'), targets.size) } finally { scan.close() }

  const played = applyDeduction(stalled, hint.actions, candidates)
  assert.deepEqual(undo(played).position, stalled.position)
  assert.deepEqual(redo(undo(played)).position, played.position)
  const continuation = await puzzleSolution(played)
  assert.equal(continuation.board, solution)
})

test('a sum chain permits equal endpoints when they share no house', async () => {
  const puzzle: VariantPuzzle = {
    version: 1, givens: '0'.repeat(81), rules: [
      { type: 'modular', cells: [2, 11, 21, 13] },
      { type: 'adjacent-total', cells: [2, 3], sum: 5 },
      { type: 'adjacent-total', cells: [3, 12], sum: 5 },
    ],
  }
  const eliminations = Array(81).fill(0)
  for (const [cell, allowed] of [[2, 11], [3, 13], [12, 11], [13, 91]]) eliminations[cell] = 511 ^ allowed
  const proofs = await runEngine({
    type: 'variant', operation: 'hints', position: { puzzle, eliminations },
    techniqueOrder: ['modular'], limit: 0xffff_ffff,
  })
  const proof = proofs.find(proof => proof.evidence.type === 'group-line-sum-chain')
  assert.ok(proof?.evidence.type === 'group-line-sum-chain')
  assert.deepEqual(proof.evidence.houses, [{ region: 1 }, { row: 1 }])
  assert.deepEqual(proof.evidence.supported, [11, 13, 11, 80])
  assert.deepEqual(proof.actions, [1, 2, 4].map(digit => ({ eliminate: { cell: 13, digit } })))
  assertModularProof(puzzle, proof)
  const { evidence } = variantHintChoice(proof, puzzle)
  assert.ok('variant' in evidence)
  assert.match(evidence.variant.description, /forces R1C3 and R2C4 to use the same digit/i)
  assert.match(evidence.variant.reason, /R2C5 were 1.*R1C3 would have to be 1 or 4/i)
  assert.match(evidence.variant.reason, /With 1 in R1C3.*1 in R2C4.*repeats 1 in box 2.*With 4 in R1C3.*1 in R1C4.*repeats 1 in box 2/i)
})

test('Entropic sum chains use positive V and X marks even when both come from one rule', async () => {
  const puzzle: VariantPuzzle = {
    version: 1, givens: '0'.repeat(81), rules: [
      { type: 'entropic', cells: [0, 9, 10, 3] },
      { type: 'xv', five: { pairs: [[1, 0]] }, ten: { pairs: [[2, 1]] } },
    ],
  }
  const eliminations = Array(81).fill(0)
  for (const [cell, ...digits] of [[0, 1, 2, 3, 4], [1, 1, 2, 3, 4], [2, 6, 7, 8, 9], [3, 2, 3, 5]]) {
    eliminations[cell] = 511 ^ digits.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
  }
  const hints = async (definition: VariantPuzzle) => (await runEngine({
    type: 'variant', operation: 'hints', position: { puzzle: definition, eliminations },
    techniqueOrder: ['entropic'], limit: 0xffff_ffff,
  })).filter(proof => proof.evidence.type === 'group-line-sum-chain')
  const [proof] = await hints(puzzle)
  assert.ok(proof?.evidence.type === 'group-line-sum-chain')
  assert.deepEqual(proof.evidence.rules, [0, 1, 1])
  assert.deepEqual(proof.evidence.totals, [5, 10])
  assert.deepEqual(proof.evidence.supported, [9, 9, 288, 22])
  assert.equal(proof.evidence.locked, 9)
  assertGroupLineProof(puzzle, proof, 'entropic')
  const withoutX: VariantPuzzle = { ...puzzle, rules: [
    puzzle.rules![0], { type: 'xv', five: { pairs: [[1, 0]] }, ten: { pairs: [], negative: true } },
  ] }
  assert.deepEqual(await hints(withoutX), [])
})

test('Entropic groups can cut off a box cell with two candidates', async () => {
  const position: { puzzle: VariantPuzzle; eliminations: number[] } = {
    puzzle: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'entropic', cells: [19, 28, 27] }] },
    eliminations: Array(81).fill(0),
  }
  const allow = (cell: number, digits: number[]) => {
    position.eliminations[cell] = 511 ^ digits.reduce((mask, digit) => mask | 1 << (digit - 1), 0)
  }
  allow(19, [3, 5, 6, 7])
  allow(28, [2, 5, 8])
  allow(27, [2, 5, 8])
  allow(37, [2, 8])
  const hints = async () => (await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: ['entropic'], limit: 0xffff_ffff,
  })).filter(proof => proof.evidence.type === 'group-line-house-triplet')
  const [proof] = await hints()
  assert.ok(proof)
  assert.deepEqual(proof.actions, [5, 6].map(digit => ({ eliminate: { cell: 19, digit } })))
  assertGroupLineProof(position.puzzle, proof, 'entropic')
  // A third candidate lets the other cell stay distinct from both line cells.
  allow(37, [2, 4, 8])
  assert.deepEqual(await hints(), [])
})

test('disjoint line and sum clues work with an Entropic Line and a positive V', async () => {
  const position: { puzzle: VariantPuzzle; eliminations: number[] } = {
    puzzle: { version: 1, givens: '0'.repeat(81), rules: [
      { type: 'entropic', cells: [1, 10, 19, 28] },
      { type: 'xv', five: { pairs: [[37, 46]] } },
    ] },
    eliminations: Array(81).fill(0),
  }
  const allow = (cell: number, digits: number[]) => {
    position.eliminations[cell] = 511 ^ digits.reduce((mask, digit) => mask | 1 << (digit - 1), 0)
  }
  allow(1, [2, 4])
  allow(28, [1, 5])
  allow(37, [1, 3])
  allow(46, [2, 4])
  const hints = async () => (await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: ['entropic'], limit: 0xffff_ffff,
  })).filter(proof => proof.evidence.type === 'group-line-disjoint-sum')
  const matches = (proof: Awaited<ReturnType<typeof hints>>[number]) =>
    proof.actions.some(action => 'eliminate' in action && action.eliminate.cell === 1 && action.eliminate.digit === 2)
  const proof = (await hints()).find(matches)
  assert.ok(proof)
  assertGroupLineProof(position.puzzle, proof, 'entropic')

  // An extra low candidate gives the line partner a way to keep 2 at R1C2.
  allow(28, [1, 3, 5])
  assert.ok(!(await hints()).some(matches))
  // Move the V where neither of its endpoints shares a house with the line.
  position.puzzle.rules = [position.puzzle.rules![0], { type: 'xv', five: { pairs: [[43, 52]] } }]
  assert.deepEqual(await hints(), [])
})

test('a positive V combines with an Entropic Line and a shared house', async () => {
  const position: { puzzle: VariantPuzzle; eliminations: number[] } = {
    puzzle: { version: 1, givens: '0'.repeat(81), rules: [
      { type: 'xv', five: { pairs: [[3, 4]], negative: false } },
      { type: 'entropic', cells: [4, 13, 14, 7] },
    ] },
    eliminations: Array(81).fill(0),
  }
  const allow = (cell: number, digits: number[]) => {
    position.eliminations[cell] = 511 ^ digits.reduce((mask, digit) => mask | 1 << (digit - 1), 0)
  }
  allow(3, [1, 3])
  allow(4, [2, 4])
  allow(7, [1, 3, 5])
  const hints = async () => (await runEngine({
    type: 'variant', operation: 'hints', position, techniqueOrder: ['entropic'], limit: 0xffff_ffff,
  })).filter(proof => proof.evidence.type === 'group-line-sum-house')
  const [proof, ...others] = await hints()
  assert.ok(proof)
  assert.equal(others.length, 0)
  assert.deepEqual(proof.actions, [{ eliminate: { cell: 7, digit: 3 } }])
  assertGroupLineProof(position.puzzle, proof, 'entropic')

  // The other low digit can complete the V without repeating 3.
  allow(4, [1, 2, 4])
  allow(3, [1, 3, 4])
  assert.deepEqual(await hints(), [])
  // The original domains also permit 3 when the sum partner shares no house.
  allow(3, [1, 3])
  allow(4, [2, 4])
  allow(40, [1, 3, 5])
  position.puzzle.rules = [position.puzzle.rules![0], { type: 'entropic', cells: [4, 13, 14, 40] }]
  assert.deepEqual(await hints(), [])
})

test('a repeated group can exclude a digit across a shared house on either kind of line', async () => {
  for (const [type, digits] of [
    ['modular', [1, 2, 3]],
    ['entropic', [1, 4, 7]],
  ] as const) {
    const eliminationMask = 511 ^ digits.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
    const position: { puzzle: VariantPuzzle; eliminations: number[] } = {
      puzzle: { version: 1, givens: '0'.repeat(81), rules: [{ type, cells: [0, 10, 11, 3] }] },
      eliminations: Array(81).fill(0),
    }
    position.eliminations[0] = eliminationMask
    const hints = (techniqueOrder: string[] = [type]) => runEngine({
      type: 'variant', operation: 'hints', position, techniqueOrder, limit: 0xffff_ffff,
    })
    const [proof, ...others] = await hints()
    assert.ok(proof)
    assert.equal(others.length, 0)
    assert.deepEqual(proof.evidence, {
      type: 'group-line-house', rule: 0, house: { row: 0 }, cells: [0, 3], domains: [511 ^ eliminationMask, 511],
    })
    assert.deepEqual(proof.actions, digits.map(digit => ({ eliminate: { cell: 3, digit } })))
    assertGroupLineProof(position.puzzle, proof, type)
    assert.deepEqual(await hints([]), [])

    // Add another possible digit to the first cell's group containing 1.
    position.eliminations[0] &= ~(1 << (type === 'modular' ? 3 : 1))
    const [restored] = await hints()
    assert.deepEqual(restored.actions, digits.slice(1).map(digit => ({ eliminate: { cell: 3, digit } })))

    // Two cells in the same group can repeat when they share no house.
    position.puzzle.rules = [{ type, cells: [0, 10, 11, 40] }]
    assert.deepEqual(await hints(), [])
    // A shared house cannot supply a group equality when phases differ.
    position.puzzle.rules = [{ type, cells: [0, 10, 3] }]
    assert.deepEqual(await hints(), [])

    // The same proof works across a declared diagonal. The two cells do not
    // share a row, column, or box.
    position.eliminations[0] = eliminationMask
    position.puzzle.rules = [{ type, cells: [0, 10, 20, 30] }, { type: 'diagonal', diagonal: 'main' }]
    const [diagonal] = await hints()
    assertGroupLineProof(position.puzzle, diagonal, type)
    assert.deepEqual(diagonal.evidence, {
      type: 'group-line-house', rule: 0, house: { diagonal: 'main' }, cells: [0, 30], domains: [511 ^ eliminationMask, 511],
    })
    assert.deepEqual(diagonal.actions, digits.map(digit => ({ eliminate: { cell: 30, digit } })))
    position.puzzle.rules = [{ type, cells: [0, 10, 20, 30] }]
    assert.deepEqual(await hints(), [])
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
