import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { VariantRule } from '../src/sudoku/engine.ts'
import { sharedPalindromeEdges } from '../src/sudoku/line-geometry.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'

const edges = (palindrome: readonly number[], other: readonly number[]) => sharedPalindromeEdges([
  { type: 'palindrome', cells: palindrome }, { type: 'whispers', cells: other, minDifference: 5 },
]).get(0) ?? []

test('shared strokes respect vertical, horizontal, diagonal and oblique overlaps in either direction', () => {
  for (const [line, shared, expected] of [
    [[0, 8], [2, 3], [[2, 3]]],
    [[0, 72], [18, 27], [[18, 27]]],
    [[0, 40], [20, 30], [[20, 30]]],
    [[8, 40], [24, 32], [[24, 32]]],
    [[0, 42], [21, 42], [[21, 42]]],
  ] as const) {
    assert.deepEqual(edges(line, shared), expected)
    assert.deepEqual(edges([...line].reverse(), [...shared].reverse()), expected)
  }
})

test('a shared point or crossing does not create an overlapping stroke', () => {
  assert.deepEqual(edges([0, 20], [20, 22]), [])
  assert.deepEqual(edges([0, 80], [8, 72]), [])
  assert.deepEqual(edges([0, 0], [0, 10]), [])
})

test('all grid symmetries preserve shared strokes without duplicate overlays from revisits', () => {
  const rules: VariantRule[] = [
    { type: 'palindrome', cells: [0, 40], segments: [[0, 40, 0]] },
    { type: 'thermometer', cells: [20, 30] },
  ]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const changed = reflectVariant({ version: 1, givens: '0'.repeat(81), rules }, symmetry)
    const short = changed.rules![1]; assert.equal(short.type, 'thermometer')
    assert.deepEqual(sharedPalindromeEdges(changed.rules!).get(0), [[...short.cells].sort((a, b) => a - b)])
  }
})
