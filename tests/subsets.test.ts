import assert from 'node:assert/strict'
import { test } from 'node:test'
import { digitLocations, findHouseSubsets, selectedDigits, subsetHouseCells } from '../src/sudoku/subsets.ts'

const row = subsetHouseCells({ row: 0 })
const mask = (...digits: number[]) => digits.reduce((bits, digit) => bits | (1 << (digit - 1)), 0)

test('hidden subset uses the digit locations in the selected house', () => {
  const masks = Array<number>(81).fill(0)
  masks.splice(0, 4, mask(1, 2, 3), mask(1, 2, 4), mask(3, 4), mask(3, 4))
  masks[9] = mask(1, 2)
  assert.deepEqual(digitLocations(row, masks, 2), [0, 1])
  assert.deepEqual(findHouseSubsets(row, masks, 'hidden'), [{
    cells: [0, 1], digits: [1, 2], removals: [{ cell: 0, digit: 3 }, { cell: 1, digit: 4 }],
  }])
})

test('naked subset uses the union of the selected cells and removes digits elsewhere in that house', () => {
  const masks = Array<number>(81).fill(0)
  masks.splice(0, 5, mask(2, 4), mask(4, 7), mask(2, 7), mask(1, 2, 3, 7), mask(1, 3))
  masks[9] = mask(2, 7)
  assert.deepEqual(selectedDigits([0, 1, 2], masks), [2, 4, 7])
  const triple = findHouseSubsets(row, masks, 'naked').find(({ cells }) => cells.join() === '0,1,2')
  assert.deepEqual(triple?.removals, [{ cell: 3, digit: 2 }, { cell: 3, digit: 7 }])
  assert.deepEqual(findHouseSubsets(row.slice(0, 3), masks, 'naked'), [])
})

test('a 6 × 6 box follows the selected box orientation', () => {
  assert.deepEqual(subsetHouseCells({ box: 3 }, { size: 6, boxRows: 3, boxColumns: 2 }), [18, 19, 24, 25, 30, 31])
})
