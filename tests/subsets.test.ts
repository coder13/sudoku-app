import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareSubsetCandidates } from '../src/sudoku/subsets.ts'

const mask = (...digits: number[]) => digits.reduce((bits, digit) => bits | (1 << (digit - 1)), 0)

test('one selected cell marks matching candidates in its row, column, and box', () => {
  const masks = Array<number>(81).fill(0)
  masks[10] = mask(1, 6)
  masks[14] = mask(1, 8)
  masks[46] = mask(6, 7)
  masks[20] = mask(1, 2, 6)
  masks[11] = mask(2)
  masks[23] = mask(1, 6)

  const { digits, matches } = compareSubsetCandidates([10], masks)
  assert.deepEqual(digits, [1, 6])
  assert.deepEqual(matches, new Map([[10, [1, 6]], [14, [1]], [46, [6]], [20, [1, 6]]]))
})

test('multiple selected cells mark their common candidates in the selection', () => {
  const masks = Array<number>(81).fill(0)
  masks[10] = mask(1, 6)
  masks[14] = mask(1, 8)
  masks[23] = mask(1, 6, 8)
  masks[46] = mask(1, 7)

  assert.deepEqual(compareSubsetCandidates([10, 14, 23], masks), {
    digits: [1],
    matches: new Map([[10, [1]], [14, [1]], [23, [1]]]),
  })
})

test('an empty selection or a selection without common candidates marks no digits', () => {
  const masks = [mask(1), mask(2), 0]
  for (const cells of [[], [0, 1], [0, 2], [2]]) {
    assert.deepEqual(compareSubsetCandidates(cells, masks), { digits: [], matches: new Map() })
  }
})

test('one selected cell follows the box orientation of a 6 × 6 grid', () => {
  const masks = Array<number>(36).fill(mask(1))
  const tall = compareSubsetCandidates([1], masks, { size: 6, boxRows: 3, boxColumns: 2 })
  const wide = compareSubsetCandidates([1], masks, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.equal(tall.matches.has(12), true)
  assert.equal(wide.matches.has(12), false)
  assert.equal(tall.matches.has(8), false)
  assert.equal(wide.matches.has(8), true)
})

test('one selected cell uses its jigsaw region instead of a square box', () => {
  const masks = Array<number>(81).fill(mask(1))
  const regions = Array.from({ length: 9 }, (_, region) =>
    Array.from({ length: 9 }, (_, row) => row * 9 + (region + row) % 9))
  const { matches } = compareSubsetCandidates([0], masks, undefined, { regions: { type: 'jigsaw', regions }, rules: [] })
  assert.equal(matches.has(20), true)
  assert.equal(matches.has(11), false)
  assert.equal(matches.has(80), true)
})
