import assert from 'node:assert/strict'
import { test } from 'node:test'
import { digitLocations, findCellSubsets, findHouseSubsets, selectedDigits, sharedSubsetHouses, subsetHouseCells } from '../src/sudoku/subsets.ts'

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

test('grid selections identify every area that contains all their cells', () => {
  assert.deepEqual(sharedSubsetHouses([]), {})
  assert.deepEqual(sharedSubsetHouses([47]), { row: { row: 5 }, column: { column: 2 }, box: { box: 3 } })
  assert.deepEqual(sharedSubsetHouses([47, 46]), { row: { row: 5 }, box: { box: 3 } })
  assert.deepEqual(sharedSubsetHouses([47, 51]), { row: { row: 5 } })
  assert.deepEqual(sharedSubsetHouses([47, 38, 20]), { column: { column: 2 } })
  assert.deepEqual(sharedSubsetHouses([47, 61]), {})
})

test('grid selections use the actual box or jigsaw region', () => {
  const six = { size: 6, boxRows: 3, boxColumns: 2 } as const
  assert.deepEqual(sharedSubsetHouses([1, 12], six), { box: { box: 0 } })
  assert.deepEqual(sharedSubsetHouses([1, 12], { size: 6, boxRows: 2, boxColumns: 3 }), {})
  const regions = Array.from({ length: 9 }, (_, region) => Array.from({ length: 9 }, (_, row) => row * 9 + (region + row) % 9))
  assert.deepEqual(sharedSubsetHouses([0, 10], undefined, { regions: { type: 'jigsaw', regions }, rules: [] }), { box: { box: 0 } })
})

test('cell search finds subsets that contain the cell and combines matches across houses', () => {
  const masks = Array<number>(81).fill(0)
  masks.splice(0, 4, mask(1, 2), mask(1, 2), mask(1, 3), mask(2, 4))
  masks[9] = mask(2, 5)
  const pair = findCellSubsets(0, masks).find(({ kind, cells }) => kind === 'naked' && cells.join() === '0,1')
  assert.deepEqual(pair, {
    kind: 'naked', cells: [0, 1], digits: [1, 2], houses: [{ row: 0 }, { box: 0 }],
    removals: [{ cell: 2, digit: 1 }, { cell: 3, digit: 2 }, { cell: 9, digit: 2 }],
  })
  assert.ok(findCellSubsets(2, masks).every(({ cells }) => cells.includes(2)))
  assert.deepEqual(findCellSubsets(4, masks), [])
})

test('cell search can find a hidden pair in the selected column', () => {
  const masks = Array<number>(81).fill(0)
  masks[0] = mask(1, 2, 3)
  masks[27] = mask(1, 2, 4)
  masks[54] = mask(3, 4)
  assert.deepEqual(findCellSubsets(27, masks), [{
    kind: 'hidden', cells: [0, 27], digits: [1, 2], houses: [{ column: 0 }],
    removals: [{ cell: 0, digit: 3 }, { cell: 27, digit: 4 }],
  }])
})
