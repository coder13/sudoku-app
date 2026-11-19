import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'
import { entropyKey, entropyRenamings, relabelEntropy } from './helpers/entropy-key.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
const { puzzle } = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-newman.json', import.meta.url), 'utf8')) as { puzzle: VariantPuzzle }

test('the independent Global Entropy identity agrees with literal enumeration of every permitted digit bijection and square transform', () => {
  const mappings = entropyRenamings()
  assert.equal(mappings.length, 1296)
  assert.equal(new Set(mappings.map(mapping => mapping.join(','))).size, 1296)
  let expected = '9'.repeat(81)
  for (let symmetry = 0; symmetry < 8; symmetry++) for (const mapping of mappings) {
    const candidate = relabelEntropy(transformedBoard(puzzle.givens, symmetry), mapping)
    if (candidate < expected) expected = candidate
  }
  assert.equal(entropyKey(puzzle), expected)
  for (const mapping of mappings) assert.equal(entropyKey({ ...puzzle, givens: relabelEntropy(puzzle.givens, mapping) }), expected)
})

test('pure Global Entropy identity retains cross-range changes and refuses mixed numeric constraints', () => {
  const identity = Array.from({ length: 10 }, (_, digit) => digit)
  const crossed = { ...puzzle, givens: relabelEntropy(puzzle.givens, identity.map(d => d === 3 ? 4 : d === 4 ? 3 : d)) }
  assert.notEqual(entropyKey(crossed), entropyKey(puzzle))
  assert.throws(() => entropyKey({ ...puzzle, rules: [...puzzle.rules!, { type: 'parity', cells: [0], parity: 'odd' }] }))
})
