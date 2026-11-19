import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const published = JSON.parse(readFileSync(new URL('./fixtures/region-sum-newman.json', import.meta.url), 'utf8'))
const coach = JSON.parse(readFileSync(new URL('./fixtures/region-sum-coach.json', import.meta.url), 'utf8')).examples

test('all complete published Region Sum sources have their independently unique printed completion', () => {
  for (const source of [published, ...coach]) {
    assertVariantCompletion(source.puzzle, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1, source.title)
    assert.equal(counted.solution, source.solution, source.title)
  }
})

test('combining visits to a region and separate-visit totals are different mathematical rules', () => {
  // In the printed completion: R1C2=2, R1C3=3,
  // R3C2=1, R2C6=3 and R3C4=5. Every other Sudoku rule holds.
  for (const [cells, permitsGrouped] of [[[1, 21, 2], true], [[2, 14, 1, 19], false]] as const) {
    for (const groupByRegion of [false, true]) {
      const puzzle: VariantPuzzle = { version: 1, givens: published.solution,
        rules: [{ type: 'region-sum', cells, groupByRegion }] }
      const valid = groupByRegion === permitsGrouped
      assert.equal(countLineSolutions(puzzle).count, valid ? 1 : 0)
      if (valid) assertVariantCompletion(puzzle, published.solution)
      else assert.throws(() => assertVariantCompletion(puzzle, published.solution))
    }
  }
})

test('Region Sum boundaries follow declared Jigsaw regions rather than standard boxes', () => {
  // 2 + 7 in row 1 equals 9 in row 2. The box sums would be 2 and 16.
  const puzzle: VariantPuzzle = { version: 1, givens: published.solution,
    regions: { type: 'jigsaw', regions: Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) => row * 9 + col)) },
    rules: [{ type: 'region-sum', cells: [1, 4, 13] }] }
  assertVariantCompletion(puzzle, published.solution)
  assert.equal(countLineSolutions(puzzle).count, 1)
  assert.equal(countLineSolutions({ ...puzzle, regions: undefined }).count, 0)
  assert.throws(() => assertVariantCompletion({ ...puzzle, regions: undefined }, published.solution))
})
