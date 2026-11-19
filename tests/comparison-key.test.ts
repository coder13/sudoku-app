import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { comparisonKey } from './helpers/comparison-key.ts'

const givens = '004000000000000000000000000000300000000000000000000000000000000000000000000600000'
const original: VariantPuzzle = { version: 1, givens, rules: [{ type: 'inequality', less: 10, greater: 24 }, { type: 'inequality', less: 24, greater: 52 }] }

test('independent comparison identity joins implied order while preserving sign direction', () => {
  const equivalent: VariantPuzzle = { ...original, rules: [{ type: 'thermometer', cells: [10, 24, 52] }, { type: 'inequality', less: 10, greater: 52 }] }
  assert.equal(comparisonKey(equivalent), comparisonKey(original))
  assert.notEqual(comparisonKey({ ...original, rules: [{ type: 'inequality', less: 24, greater: 10 }, { type: 'inequality', less: 24, greater: 52 }] }), comparisonKey(original))
  const complemented: VariantPuzzle = { ...original, givens: [...givens].map(digit => digit === '0' ? digit : String(10 - Number(digit))).join(''),
    rules: [{ type: 'inequality', less: 24, greater: 10 }, { type: 'inequality', less: 52, greater: 24 }] }
  assert.equal(comparisonKey(complemented), comparisonKey(original))
})

test('the comparison oracle rejects cycles, mixed rules and unsupported region layouts', () => {
  assert.throws(() => comparisonKey({ ...original, rules: [...original.rules!, { type: 'inequality', less: 52, greater: 10 }] }), /cycle/)
  assert.throws(() => comparisonKey({ ...original, rules: [...original.rules!, { type: 'anti-king' }] }), /pure comparison/)
  assert.throws(() => comparisonKey({ ...original, regions: { type: 'jigsaw', regions: [] } }), /standard-box/)
})
