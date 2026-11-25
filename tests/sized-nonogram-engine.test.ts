import assert from 'node:assert/strict'
import test from 'node:test'
import { nonogramState, validNonogramRule } from '../src/sudoku/sized-nonogram.ts'

test('a full digit group can form one full-length Nonogram run', () => {
  const rule = { type: 'nonogram', axis: 'row', index: 0, digits: [1, 2, 3, 4], runs: [4] } as const
  assert.equal(validNonogramRule(rule, 4), true)
  assert.deepEqual(nonogramState([rule], '0'.repeat(16), 4)?.allowed.slice(0, 4), [0b1111, 0b1111, 0b1111, 0b1111])
})
