import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { isPlayablePuzzle, sumLabel, variantDigitExclusions, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const empty = '0'.repeat(81)
const source = JSON.parse(readFileSync(new URL('./fixtures/adjacent-sum-coach.json', import.meta.url), 'utf8'))
const expected: VariantPuzzle = { ...source.basePuzzle, rules: [...source.basePuzzle.rules, { type: 'adjacent-total', cells: [80, 79], sum: 15 }] }

test('the original sum-15 source retains both givens, the complete total and every Miracle rule', async () => {
  const imported = await detectPuzzle(source.source.code)
  assert.equal(imported.variant?.id, 'mixed')
  assert.deepEqual(imported.variant?.puzzle, expected)
  assertVariantCompletion(expected, source.solution)
  const counted = countLineSolutions(expected)
  assert.equal(counted.count, 1); assert.equal(counted.solution, source.solution)
  assert.equal(countLineSolutions(source.basePuzzle).count, 1)
  assert.equal(sumLabel(15), 'XV'); assert.equal(sumLabel(17), 'XVII')
  assert.match(variantRuleDescriptions(expected).join(' '), /XV means 15/)
})

test('mixed source totals preserve all marks and reject malformed or unknown semantics', async () => {
  const segments = [{ cells: [0, 1], parameters: { sum: 5 } }, { cells: [9, 10], parameters: { sum: 15 } }, { cells: [18, 19], parameters: { sum: 10 } }, { cells: [27, 28], parameters: { sum: 3 } }]
  const code = coachCode({ gridSize: 9, givenConstraints: [{ type: 'twoCellSum', segments, settings: {} }] })
  assert.deepEqual((await detectPuzzle(code)).variant?.puzzle.rules, [
    { type: 'xv', five: { pairs: [[0, 1]] }, ten: { pairs: [[18, 19]] } },
    { type: 'adjacent-total', cells: [9, 10], sum: 15 }, { type: 'adjacent-total', cells: [27, 28], sum: 3 },
  ])
  for (const sum of [undefined, null, '15', 2, 18, 15.5]) await assert.rejects(detectPuzzle(coachCode({ gridSize: 9, givenConstraints: [{ type: 'twoCellSum', segments: [{ cells: [0, 1], parameters: { sum } }], settings: {} }] })))
  for (const cells of [[0, 0], [8, 9], [0, 10], [-1, 0], [80, 81], [0, 1, 2]]) await assert.rejects(detectPuzzle(coachCode({ gridSize: 9, givenConstraints: [{ type: 'twoCellSum', segments: [{ cells, parameters: { sum: 15 } }], settings: {} }] })))
  for (const extra of [{ parameters: { sum: 15, negative: true } }, { settings: { negativeConstraint: true } }]) {
    await assert.rejects(detectPuzzle(coachCode({ gridSize: 9, givenConstraints: [{ type: 'twoCellSum', segments: [{ cells: [0, 1], parameters: extra.parameters ?? { sum: 15 } }], settings: extra.settings ?? {} }] })))
  }
})

test('all total and digit pairs agree with ordinary houses and independent negative XV flags in both directions', () => {
  for (let sum = 3; sum <= 17; sum++) for (let flags = 0; flags < 4; flags++) for (const pair of [[0, 1], [0, 9]] as const) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'xv', five: { negative: Boolean(flags & 1) }, ten: { negative: Boolean(flags & 2) } }, { type: 'adjacent-total', cells: pair, sum }] }
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
      assert.equal(Boolean(variantDigitExclusions(puzzle, pair[0], pair[1], a) & 1 << (b - 1)), a + b !== sum)
      assert.equal(Boolean(variantDigitExclusions(puzzle, pair[1], pair[0], b) & 1 << (a - 1)), a + b !== sum)
      const values = [...empty]; values[pair[0]] = String(a); values[pair[1]] = String(b)
      // Flags also constrain other unmarked edges, but both digits here are the only placements.
      assert.equal(conflictsOf(values.join(''), puzzle).size, a !== b && a + b === sum ? 0 : 2)
    }
  }
})

test('candidate cleanup preserves the required partner, unrelated cells, bulk input and history', () => {
  const control = source.authoredControl
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'adjacent-total', cells: [30, 39], sum: 15 }] }
  for (const [cell, partner] of [[30, 39], [39, 30]]) {
    let game = { ...makeGame('total-input', 'Two-cell sums', empty, 'imported'), variant: { id: 'adjacent-total' as const, puzzle, solution: control.solution } }
    for (let digit = 1; digit <= 9; digit++) { game = enter(game, [partner, 80], 'center', digit); game = enter(game, [partner, 80], 'corner', digit) }
    const placed = enter(game, [cell], 'value', Number(control.solution[cell]))
    const keep = 1 << (Number(control.solution[partner]) - 1)
    assert.equal(placed.position.center[partner], keep); assert.equal(placed.position.corner[partner], keep)
    assert.equal(placed.position.center[80], 511); assert.equal(placed.position.corner[80], 511)
    assert.deepEqual(undo(placed).position, game.position); assert.deepEqual(redo(undo(placed)).position, placed.position)
    const entries = [...empty]; entries[cell] = control.solution[cell]
    assert.equal(fillEntries(game, entries.join('')).position.center[partner], keep)
  }
})

test('all eight app transforms preserve source endpoint order and the numeric total', () => {
  const maps = [(r: number, c: number) => [r, c], (r: number, c: number) => [c, r],
    (r: number, c: number) => [8 - r, c], (r: number, c: number) => [8 - c, r],
    (r: number, c: number) => [r, 8 - c], (r: number, c: number) => [c, 8 - r],
    (r: number, c: number) => [8 - r, 8 - c], (r: number, c: number) => [8 - c, 8 - r]]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const map = (cell: number) => { const [r, c] = maps[symmetry](Math.floor(cell / 9), cell % 9); return r * 9 + c }
    const result = reflectVariant(expected, symmetry)
    assert.deepEqual(result.rules!.at(-1), { type: 'adjacent-total', cells: [map(80), map(79)], sum: 15 })
    assert.equal(isPlayablePuzzle('mixed', result), true)
  }
})
