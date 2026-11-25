import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-unknown-cage-totals.json', import.meta.url), 'utf8')) as {
  issue: number; code: string; solution: string
}

test('#433 imports all unsummed cages, consecutive cage links, and parity clues', async () => {
  const imported = await detectPuzzle(source.code)
  const rules = imported.variant?.puzzle.rules
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.authoredSolution, source.solution)
  assert.equal(imported.authoredSolutionOnly, true)
  const unknownSums = rules?.find(rule => rule.type === 'unknown-cage-sums')
  assert.deepEqual(unknownSums, {
    type: 'unknown-cage-sums',
    cages: [
      [0, 1, 2, 3, 9, 18, 27], [53, 62, 71, 77, 78, 79, 80], [38, 39, 40, 41, 42],
      [7, 16, 25, 34], [8, 17, 26, 35, 43, 44], [36, 37, 45, 54, 63, 72], [46, 55, 64, 73],
      [10, 11, 12, 19, 28], [52, 61, 68, 69, 70], [47, 48, 49, 50, 56, 65, 74],
      [6, 15, 24, 30, 31, 32, 33], [66, 67, 75, 76], [4, 5, 13, 14], [20, 21, 22, 23, 29],
      [51, 57, 58, 59, 60],
    ],
    consecutivePairs: [[2, 4], [2, 5], [3, 4], [3, 10], [5, 6], [7, 13], [8, 14], [11, 14], [12, 13]],
  })
  assert.deepEqual(rules?.filter(rule => rule.type === 'parity'), [
    { type: 'parity', cells: [80, 33, 75, 67, 39, 51, 78, 68], parity: 'odd' },
    { type: 'parity', cells: [30, 66, 76], parity: 'even' },
  ])
  assert.equal(source.solution.length, 81)
})
