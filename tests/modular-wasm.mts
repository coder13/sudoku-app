import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import type { Game } from '../src/sudoku/game.ts'
import { applyDeduction, enter, isSolved, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { assertGroupLineProof } from './helpers/group-line-truth.ts'
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
  ['HCHW', 760, 33, 3140, 38, false, false, 'medium'],
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
      [await getVariantPlayOrder(), appPoints, appSteps, appComplete],
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
      if (complete) assert.deepEqual(trace.rating.status, { solved: difficulty })
      else assert.equal(trace.rating.status, 'stalled')
      let played = game
      for (const proof of trace.steps) {
        for (const action of proof.actions) {
          const c = 'place' in action ? action.place : action.eliminate
          assert.equal(Number(source.solution[c.cell]) === c.digit, 'place' in action)
        }
        if (proof.technique === 'modular') assertModularProof(puzzle, proof)
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
