import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { runEngine, type VariantRule, type VariantVisibility } from '../src/sudoku/engine.ts'
import { projectFogPuzzle, revealedFogCells } from '../src/sudoku/fog.ts'
import { EMPTY, enter, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { examples } = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')) as {
  examples: { url: string; code: string; solution: string }[]
}
const source = examples.find(example => example.url.endsWith('/Fnxt'))!

test('the published Fog source verifies exactly and visible markers never expose their hidden layer companions', async () => {
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  const bits = [...source.code.slice('SCv7_32_'.length)].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const json = inflateSync(Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))).toString('utf8')
  const { givenConstraints, ...fields } = JSON.parse(json) as {
    givenConstraints: { type: string; segments: { cells: number[]; parameters: object }[]; settings: object }[]
  }
  const fog = givenConstraints.filter(layer => layer.type === 'fog')
  assert.equal(fog.length, 1)
  assert.deepEqual(fog[0].segments, [{ cells: [63], parameters: {} }])
  assert.deepEqual(fog[0].settings, {})
  const imported = await detectPuzzle(source.code)
  const drawingRemoved = await detectPuzzle(coachCode({ ...fields, givenConstraints: givenConstraints.filter(layer => layer.type !== 'fog') }))
  const { variant } = imported
  assert.deepEqual(imported.fog, { initialCells: [63] })
  assert.deepEqual(variant, drawingRemoved.variant)
  assert.ok(variant)
  assert.equal(variant.puzzle.rules?.length, 17)
  assertVariantCompletion(variant.puzzle, source.solution)
  const independent = countLineSolutions(variant.puzzle)
  assert.equal(independent.count, 1)
  assert.equal(independent.solution, source.solution)

  // Split marker layers into individually visible facts. The remaining engine rules
  // keep their original definitions and can still participate in the exact solve.
  const rules = variant.puzzle.rules!.flatMap((rule): VariantRule[] => {
    if (rule.type === 'kropki' && rule.ratioTwo?.pairs) {
      return rule.ratioTwo.pairs.map(pair => ({ type: 'kropki', ratioTwo: { pairs: [pair] } }))
    }
    if (rule.type === 'xv') {
      return [
        ...(rule.five?.pairs ?? []).map(pair => ({ type: 'xv' as const, five: { pairs: [pair] } })),
        ...(rule.ten?.pairs ?? []).map(pair => ({ type: 'xv' as const, ten: { pairs: [pair] } })),
      ]
    }
    return [rule]
  })
  const puzzle = { ...variant.puzzle, rules }
  const exact = await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } })
  assert.deepEqual(exact, { status: 'unique', solution: source.solution })

  const initial: VariantVisibility = { cells: [63], rules: [0] }
  const opening = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle }, visibility: initial })
  assert.equal(opening[63], 0x155)
  assert.equal(opening[72], 0x1ff)
  const entries = '0'.repeat(63) + source.solution[63] + '0'.repeat(17)
  const position = { puzzle, entries }
  const black = rules.findIndex(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs?.[0].includes(63))
  const ten = rules.findIndex(rule => rule.type === 'xv' && rule.ten?.pairs?.[0].includes(63))
  assert.ok(black > 0 && ten > 0)
  const revealed: VariantVisibility = { cells: [54, 55, 63, 64, 72, 73], rules: [0, black, ten] }
  const visible = await runEngine({ type: 'variant', operation: 'normalize', position, visibility: revealed })
  assert.deepEqual(visible.puzzle.rules.map(rule => rule.type), ['parity', 'kropki', 'xv'])
  assert.deepEqual(visible.puzzle.rules[1], { type: 'kropki', consecutive: { pairs: [], negative: false },
    ratioTwo: { pairs: [[72, 63]], negative: false } })
  assert.deepEqual(visible.puzzle.rules[2], { type: 'xv', five: { pairs: [], negative: false },
    ten: { pairs: [[63, 64]], negative: false } })
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position, visibility: revealed })
  assert.equal(candidates[64], 1 << 8)
  assert.equal(candidates[72], 1 << 1)
  assert.equal(candidates[25], 0x1ff, 'An unrelated black dot is still hidden')
  const singles = await runEngine({ type: 'variant', operation: 'solve-singles', position, visibility: revealed })
  assert.equal(singles[64], source.solution[64])
  assert.equal(singles[72], source.solution[72])
  for (const [cell, digit] of [...singles].entries()) if (digit !== '0') assert.equal(digit, source.solution[cell])

  const beforeScan = watchTechniqueScan(entries, undefined, position, initial)
  const afterScan = watchTechniqueScan(entries, undefined, position, revealed)
  try {
    assert.equal(await beforeScan.count('kropki'), 0)
    const hints = await runEngine({ type: 'variant', operation: 'hints', position, visibility: revealed, techniqueOrder: ['kropki'] })
    const actions = new Set(hints.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
    assert.ok(actions.size > 0)
    assert.equal(await afterScan.count('kropki'), actions.size)
    assert.equal(await beforeScan.count('kropki'), 0, 'A reveal must not change counts for the earlier view')
  } finally {
    beforeScan.close()
    afterScan.close()
  }
})

test('a Coach code retains the initial Fog layer and every companion rule while Play support is pending', async ({ mock }) => {
  mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/v1/import/sudoku-coach/Fnxt')
    return Response.json({ code: source.code, coach: { hasAuthorInstructions: false, title: 'Skipping through the fog' } })
  })
  const imported = await detectPuzzle(source.url)
  assert.deepEqual(imported.fog, { initialCells: [63] })
  assert.equal(imported.title, 'Skipping through the fog')
  assert.equal(imported.variant?.puzzle.rules?.length, 17)
  await assert.rejects(prepareImportedPuzzle(source.url), /Fog of War puzzles are not playable here yet/)
  await assert.rejects(prepareImportedPuzzle(source.code), /Fog of War puzzles are not playable here yet/)
})

test('the authored reveal and current entries determine each projection, including after undo and redo', async () => {
  const { fog, variant } = await detectPuzzle(source.code)
  assert.ok(fog && variant)
  const { puzzle } = variant
  const game = makeGame('fog', 'Published Fog puzzle', EMPTY, 'imported')
  const project = (position: typeof game) => {
    const cells = revealedFogCells(fog, position.position.entries, source.solution)
    const shown = projectFogPuzzle(puzzle, cells)
    assertVariantCompletion(shown, source.solution)
    return { cells: [...cells].sort((a, b) => a - b), puzzle: shown, entries: position.position.entries }
  }
  const opening = project(game)
  assert.deepEqual(opening.cells, [63])
  assert.deepEqual(opening.puzzle.rules, [{ type: 'parity', cells: [63], parity: 'odd' }])
  assert.deepEqual(project(enter(game, [63], 'value', 3)).cells, opening.cells)
  const placed = enter(game, [63], 'value', 1)
  const revealed = project(placed)
  assert.deepEqual(revealed.cells, [54, 55, 63, 64, 72, 73])
  assert.deepEqual(revealed.puzzle.rules, [
    { type: 'parity', cells: [63], parity: 'odd' },
    { type: 'whispers', cells: [63, 64], minDifference: 5 },
    { type: 'kropki', ratioTwo: { pairs: [[72, 63]] } },
    { type: 'xv', ten: { pairs: [[63, 64]] } },
    { type: 'entropic', cells: [54, 55] },
  ])
  assert.deepEqual(project(undo(placed)), opening)
  assert.deepEqual(project(redo(undo(placed))), revealed)

  const candidates = await runEngine({ type: 'variant', operation: 'candidates',
    position: { puzzle: revealed.puzzle, entries: revealed.entries } })
  assert.equal(candidates[64], 1 << 8)
  assert.equal(candidates[72], 1 << 1)
  assert.equal(candidates[25], 0x1ff)

  const opened = enter(enter(placed, [64], 'value', 9), [72], 'value', 2)
  const next = project(opened)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: next.puzzle, entries: next.entries } })
  assert.ok(trace.steps.length > 0)
  assert.ok(trace.steps.every(step => step.actions.every(action => !('place' in action))))
  const complete = revealedFogCells(fog, source.solution, source.solution)
  assert.equal(complete.size, 81)
  assert.equal(projectFogPuzzle(puzzle, complete), puzzle)
})

test('projected layers hide givens, cut paths at hidden cells, and delay negative marks', async () => {
  const importFog = (...layers: unknown[]) => detectPuzzle(coachCode({ givenConstraints: layers }))
  const mask = (cells: number[]) => ({ type: 'fog', segments: [{ cells, parameters: {} }] })
  for (const layer of [
    mask([]), mask([0, 0]), mask([81]), mask([-1]), mask([2.5]),
    { ...mask([0]), settings: { radius: 2 } },
    { ...mask([0]), segments: [{ cells: [0] }, { cells: [1] }] },
    { ...mask([0]), segments: [{ cells: [0], parameters: { custom: true } }] },
  ]) {
    await assert.rejects(importFog(layer), /invalid or unsupported reveal settings/)
  }
  assert.deepEqual((await importFog(mask([80, 0]), mask([10, 80]))).fog, { initialCells: [0, 10, 80] })
  await assert.rejects(importFog(mask([0]), { type: 'terrain', segments: [{ cells: [0] }] }), /not supported yet \(terrain\)/)

  const puzzle = { version: 1, givens: '1' + '0'.repeat(79) + '2', rules: [
    { type: 'parity', cells: [0, 80], parity: 'odd' },
    { type: 'whispers', cells: [0, 1, 2, 3, 4], minDifference: 5 },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 6 }, { cells: [79, 80], sum: 5 }] },
    { type: 'kropki', ratioTwo: { pairs: [[0, 1], [79, 80]], negative: true } },
    { type: 'xv', ten: { pairs: [[0, 1]], negative: true } },
    { type: 'adjacent-total', cells: [78, 79], sum: 5 },
  ] } as const
  const early = projectFogPuzzle(puzzle, new Set([0, 1, 3, 4]))
  assert.equal(early.givens, '1' + '0'.repeat(80))
  assert.deepEqual(early.rules, [
    { type: 'parity', cells: [0], parity: 'odd' },
    { type: 'whispers', cells: [0, 1], minDifference: 5 },
    { type: 'whispers', cells: [3, 4], minDifference: 5 },
    { type: 'killer-cages', cages: [{ cells: [0, 1], sum: 6 }] },
    { type: 'kropki', ratioTwo: { pairs: [[0, 1]] } },
    { type: 'xv', ten: { pairs: [[0, 1]] } },
  ])
  const later = projectFogPuzzle(puzzle, new Set([0, 1, 2, 3, 4, 78, 79, 80]))
  assert.equal(later.givens, puzzle.givens)
  assert.deepEqual(later.rules, puzzle.rules)
})
