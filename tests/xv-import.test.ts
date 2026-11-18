import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { generationVariant, isPlayablePuzzle, variantDigitExclusions, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const empty = '0'.repeat(81)
const fixture = JSON.parse(readFileSync(new URL('./fixtures/xv-clover.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle; solution: string }
const examples = JSON.parse(readFileSync(new URL('./fixtures/xv-coach.json', import.meta.url), 'utf8')).examples as { code: string; url: string; solution: string; deferred: string[]; requiresXv?: boolean }[]

test('unmodified Coach XV exports retain every marked sum and every companion rule', async () => {
  for (const [index, source] of examples.filter(example => !example.deferred.length).entries()) {
    const imported = (await detectPuzzle(source.code)).variant!
    assert.equal(imported.id, 'mixed')
    const encoded = source.code.split('_')[2]
    const bits = [...encoded].map(digit => '0123456789abcdefghijklmnopqrstuv'.indexOf(digit).toString(2).padStart(5, '0')).join('')
    const decoded = JSON.parse(inflateSync(Uint8Array.from(bits.match(/.{8}/g)!, byte => Number.parseInt(byte, 2))).toString())
    assert.equal(imported.puzzle.givens, decoded.givenDigits ?? empty)
    const original = decoded.givenConstraints.find((rule: { type: string }) => rule.type === 'twoCellSum')
    const xv = imported.puzzle.rules!.find(rule => rule.type === 'xv')!
    assert.equal(xv.type, 'xv')
    assert.deepEqual(xv.five?.pairs ?? [], original.segments.filter((s: { parameters: { sum: number } }) => s.parameters.sum === 5).map((s: { cells: number[] }) => s.cells))
    assert.deepEqual(xv.ten?.pairs ?? [], original.segments.filter((s: { parameters: { sum: number } }) => s.parameters.sum === 10).map((s: { cells: number[] }) => s.cells))
    assert.equal(imported.puzzle.rules!.length, [2, 6, 3, 12][index])
    if (index === 3) assert.deepEqual(imported.puzzle.rules!.filter(rule => rule.type === 'whispers').map(rule => rule.minDifference), [4, 4, 4, 4, 4, 4, 5, 5, 5])
    assertVariantCompletion(imported.puzzle, source.solution)
    const counted = countLineSolutions(imported.puzzle)
    assert.equal(counted.count, 1); assert.equal(counted.solution, source.solution)
    if (source.requiresXv) assert.equal(countLineSolutions({ ...imported.puzzle, rules: imported.puzzle.rules!.filter(rule => rule.type !== 'xv') }).count, 2)
    assert.deepEqual((await detectPuzzle('#variant=' + encodeURIComponent(JSON.stringify(imported)))).variant, imported)
  }
})

test('XV keeps its wire format while Coach general totals use their own rule', async () => {
  assert.equal(isPlayablePuzzle('xv', fixture.puzzle), true)
  assert.equal(generationVariant({ id: 'xv' }), undefined)
  const general = await detectPuzzle(examples.find(example => example.deferred.length)!.code)
  assert.deepEqual(general.variant!.puzzle.rules!.at(-1), { type: 'adjacent-total', cells: [80, 79], sum: 15 })
  for (const sum of [undefined, null, 0, 2, 18, 15.5, '5']) {
    await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'twoCellSum', segments: [{ cells: [0, 1], parameters: { sum } }] }] })), /sum/)
  }
  for (const pair of [[0, 0], [8, 9], [0, 10], [-1, 0], [0, 81], [0, '1'], [0], [0, 1, 2]]) {
    assert.equal(isPlayablePuzzle('xv', { version: 1, givens: empty, rules: [{ type: 'xv', five: { pairs: [pair] } }] }), false)
  }
  for (const constraint of [
    { segments: [] }, { segments: [{ cells: [0, 1], parameters: { sum: 5, ratio: 2 } }] },
    { settings: { negativeConstraint: true }, segments: [{ cells: [0, 1], parameters: { sum: 5 } }] },
  ]) await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'twoCellSum', ...constraint }] })))
  assert.equal(isPlayablePuzzle('xv', { version: 1, givens: empty, rules: [{ type: 'xv', five: { negative: 'yes' } }] }), false)
})

test('every digit pair obeys positive sums and independent global negative flags across layers', () => {
  for (let positive = 0; positive < 4; positive++) for (let negative = 0; negative < 4; negative++) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
      { type: 'xv', five: { negative: Boolean(negative & 1) }, ten: { negative: Boolean(negative & 2) } },
      { type: 'xv', five: { pairs: positive & 1 ? [[0, 1]] : [] }, ten: { pairs: positive & 2 ? [[1, 0]] : [] } },
    ] }
    for (let left = 1; left <= 9; left++) for (let right = 1; right <= 9; right++) {
      const sum = left + right
      const permitted = positive ? (!(positive & 1) || sum === 5) && (!(positive & 2) || sum === 10)
        : (!(negative & 1) || sum !== 5) && (!(negative & 2) || sum !== 10)
      assert.equal(Boolean(variantDigitExclusions(puzzle, 0, 1, left) & 1 << (right - 1)), !permitted)
      assert.equal(Boolean(variantDigitExclusions(puzzle, 1, 0, right) & 1 << (left - 1)), !permitted)
      assert.equal(variantDigitExclusions(puzzle, 0, 80, left), 0)
      const values = [...empty]; values[0] = String(left); values[1] = String(right)
      assert.equal(conflictsOf(values.join(''), puzzle).size, permitted && left !== right ? 0 : 2)
    }
  }
})

test('XV placements clean both candidate types and preserve compatible candidates and history', () => {
  const givens = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'xv', ten: { pairs: [[1, 10]] } }] }
  for (const [cell, partner, digit, keep] of [[1, 10, 3, 1 << 6], [10, 1, 7, 1 << 2]]) {
    let game = { ...makeGame('xv-candidates', 'XV', empty, 'imported'), variant: { id: 'xv' as const, puzzle, solution: givens } }
    for (let candidate = 1; candidate <= 9; candidate++) {
      game = enter(game, [partner], 'center', candidate)
      game = enter(game, [partner], 'corner', candidate)
    }
    const placed = enter(game, [cell], 'value', digit)
    assert.equal(placed.position.center[partner], keep); assert.equal(placed.position.corner[partner], keep)
    assert.deepEqual(undo(placed).position, game.position)
    assert.deepEqual(redo(undo(placed)).position, placed.position)
    const values = [...empty]; values[cell] = String(digit)
    assert.equal(fillEntries(game, values.join('')).position.center[partner], keep)
  }
})

test('all transformations preserve positive pair endpoints and independent negative flags', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'xv', five: { pairs: [[0, 1]], negative: true }, ten: { pairs: [[1, 10]], negative: false } },
  ] }
  const maps = [(r: number, c: number) => [r, c], (r: number, c: number) => [c, r],
    (r: number, c: number) => [8 - r, c], (r: number, c: number) => [8 - c, r],
    (r: number, c: number) => [r, 8 - c], (r: number, c: number) => [c, 8 - r],
    (r: number, c: number) => [8 - r, 8 - c], (r: number, c: number) => [8 - c, 8 - r]]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const map = (cell: number) => { const [r, c] = maps[symmetry](Math.floor(cell / 9), cell % 9); return r * 9 + c }
    const transformed = reflectVariant(puzzle, symmetry)
    assert.deepEqual(transformed.rules, [{ type: 'xv', five: { pairs: [[map(0), map(1)]], negative: true }, ten: { pairs: [[map(1), map(10)]], negative: false } }])
    const descriptions = variantRuleDescriptions(transformed)
    assert.ok(descriptions.some(text => text.includes('All V clues')))
    assert.equal(descriptions.some(text => text.includes('All X clues')), false)
  }
})
