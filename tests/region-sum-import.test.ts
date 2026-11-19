import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo, type Game } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { regionSumState } from '../src/sudoku/region-sum.ts'
import { isPlayablePuzzle, variantIdForPuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const published = JSON.parse(readFileSync(new URL('./fixtures/region-sum-newman.json', import.meta.url), 'utf8'))
const sources = JSON.parse(readFileSync(new URL('./fixtures/region-sum-coach.json', import.meta.url), 'utf8')).examples
const empty = '0'.repeat(81), bit = (digit: number) => 1 << (digit - 1)
function valuesAt(cells: readonly number[], digits: readonly number[]) {
  const values = [...empty]; cells.forEach((cell, i) => { values[cell] = String(digits[i]) }); return values.join('')
}

test('all original Coach Region Sum exports preserve their full lines and every companion rule', async () => {
  assert.equal(variantIdForPuzzle(published.puzzle), 'region-sum')
  assert.ok(isPlayablePuzzle('region-sum', published.puzzle))
  for (const source of sources) {
    const imported = await detectPuzzle(source.code)
    assert.deepEqual(imported.variant?.puzzle, source.puzzle, source.title)
    assert.equal(conflictsOf(source.solution, source.puzzle).size, 0)
    assert.match(variantRuleDescriptions(source.puzzle).join(' '), /Region borders/)
  }
})

test('connected Coach paths retain insertion order and closed paths cut at a region boundary', async () => {
  const paths = [[25, 34, 33], [33, 24, 25]]
  const imported = await detectPuzzle(coachCode({ givenDigits: published.solution, givenConstraints: [
    { type: 'regionSumLine', settings: {}, segments: paths.map(cells => ({ cells, parameters: {} })) },
  ] }))
  assert.deepEqual(imported.variant?.puzzle.rules, [{ type: 'region-sum', cells: [34, 33, 24, 25], groupByRegion: false, segments: paths }])
  assert.equal(conflictsOf(published.solution, imported.variant?.puzzle).size, 0)
  const joined = await detectPuzzle(coachCode({ givenConstraints: [{ type: 'regionSumLine', settings: {}, segments: [
    { cells: [0, 1, 3], parameters: {} }, { cells: [1, 4], parameters: {} },
  ] }] }))
  assert.deepEqual(joined.variant?.puzzle.rules, [{ type: 'region-sum', cells: [0, 1, 3, 4], groupByRegion: false, segments: [[0, 1, 3], [1, 4]] }])
})

test('unsupported semantics, invalid geometry and single-part Region Sum definitions are rejected', async () => {
  for (const rule of [
    { cells: [0, 1] }, { cells: [0, 3, 0] }, { cells: [0, 81] }, { cells: [0, 3], groupByRegion: 'true' },
    { cells: [0, 3], segments: [] }, { cells: [0, 3], segments: [[0]] }, { cells: [0, 3], segments: [[0, 4]] },
    { cells: [0, 3], minimum: 3 },
  ]) assert.equal(isPlayablePuzzle('region-sum', { version: 1, givens: empty, rules: [{ type: 'region-sum', ...rule }] }), false)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'regionSumLine', settings: { combineRegions: true }, segments: [{ cells: [0, 3], parameters: {} }] }] })), /unsupported settings/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'regionSumLine', settings: {}, segments: [{ cells: [0, 3], parameters: { total: 5 } }] }] })), /invalid Region Sum segment/)
  await assert.rejects(detectPuzzle(coachCode({ givenConstraints: [{ type: 'thermometer', settings: { strict: false }, segments: [{ cells: [0, 3], parameters: {} }] }] })), /unsupported settings/)
})

test('explicit drawing paths retain their declared equal-total groups in the rule explanation', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'region-sum', cells: [0, 1, 3], segments: [[0, 3, 1]] },
  ] }
  assert.ok(isPlayablePuzzle('region-sum', puzzle))
  assert.match(variantRuleDescriptions(puzzle).join(' '), /R1C1 \+ R1C2 = R1C4/)
})

test('placed-digit support matches complete equal-sum assignments for every partial four-cell position', () => {
  const cells = [0, 1, 30, 31]
  const complete: number[][] = []
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) for (let d = 1; d <= 9; d++) {
    if (a + b === c + d) complete.push([a, b, c, d])
  }
  for (const rule of [
    { type: 'region-sum' as const, cells },
    { type: 'region-sum' as const, cells: [0, 30, 1, 31], groupByRegion: true },
  ]) {
    const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [rule] }
    for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) for (let c = 0; c <= 9; c++) for (let d = 0; d <= 9; d++) {
      const partial = [a, b, c, d]
      const matches = complete.filter(tuple => partial.every((digit, i) => !digit || tuple[i] === digit))
      const expected = cells.map((_, i) => matches.reduce((mask, tuple) => mask | bit(tuple[i]), 0))
      const state = regionSumState(puzzle, valuesAt(cells, partial))!
      assert.deepEqual(cells.map(cell => state.allowed[cell]), expected, JSON.stringify({ rule, partial }))
      assert.deepEqual([...state.conflicts].sort((a, b) => a - b), matches.length ? [] : cells.filter((_, i) => partial[i]).sort((a, b) => a - b))
      assert.equal(state.allowed[80], 511)
    }
  }
  assert.equal(regionSumState(undefined, empty), undefined)
})

test('both Pencil modes and bulk entry compose Region Sum, Between and Global Entropy with reversible history', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [
    { type: 'region-sum', cells: [0, 1, 30, 31] },
    { type: 'between', cells: [13, 31, 80] },
    { type: 'global-entropy' },
  ] }
  const game = { ...makeGame('region-sum-notes', 'Region Sum', empty, 'imported'), variant: { id: 'mixed' as const, puzzle, solution: published.solution } }
  game.position.center = game.position.corner = Array<number>(81).fill(511)
  const values = valuesAt([0, 1, 30, 13, 80, 21, 22], [3, 4, 5, 1, 4, 4, 8])
  const bulk = fillEntries(game, values)
  for (const mode of ['center', 'corner'] as const) assert.equal(bulk.position[mode][31], bit(2))
  assert.deepEqual(undo(bulk).position, game.position)
  assert.deepEqual(redo(undo(bulk)).position, bulk.position)
  let sequential: Game = game
  for (const cell of [0, 1, 30, 13, 80, 21, 22]) sequential = enter(sequential, [cell], 'value', Number(values[cell]))
  for (const mode of ['center', 'corner'] as const) assert.equal(sequential.position[mode][31], bit(2))
  const wrong = enter(sequential, [31], 'value', 9)
  const conflicts = conflictsOf(valuesAt([0, 1, 30, 31], [3, 4, 5, 9]), { ...puzzle, rules: [puzzle.rules![0]] })
  for (const cell of [0, 1, 30, 31]) assert.ok(conflicts.has(cell))
  assert.deepEqual(undo(wrong).position, sequential.position)
})
