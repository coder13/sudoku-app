import assert from 'node:assert/strict'
import test from 'node:test'
import { miracleSymmetry, offersMiracle } from '../src/sudoku/miracle.ts'
import { customModeDifficulties } from '../src/sudoku/custom-modes.ts'
import { DIFFICULTY_LEVELS } from '../src/sudoku/difficulty.ts'

test('Miracle eligibility follows the effective grade and the entire rule set', () => {
  const chess = ['anti-knight', 'anti-king', 'non-consecutive'] as const
  assert.deepEqual(customModeDifficulties(chess), DIFFICULTY_LEVELS)
  assert.deepEqual(DIFFICULTY_LEVELS.filter(level => offersMiracle(level, chess)), DIFFICULTY_LEVELS.slice(4))
  assert.equal(offersMiracle('hard', []), false)
  assert.match(miracleSymmetry(chess)!, /Reversing digits/)
  assert.match(miracleSymmetry([...chess, 'renban', 'parity', 'dutch-whispers'])!, /Reversing digits/)
  assert.match(miracleSymmetry(['sandwich', 'anti-king'])!, /Swapping 1 and 9/)
  assert.ok(miracleSymmetry(['kropki-black']))
  assert.ok(miracleSymmetry(['kropki-white']))
  assert.equal(miracleSymmetry(['kropki-white', 'kropki-black']), undefined)
  assert.equal(miracleSymmetry([...chess, 'killer-cages']), undefined)
})

test('all V and X markings admit a simultaneous exchange of two digit pairs', () => {
  const reason = miracleSymmetry(['xv', 'anti-king'])!
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const map = new Map(digits.map(d => [d, d]))
  for (const [, from, to] of reason.matchAll(/(\d)→(\d)/g)) map.set(Number(from), Number(to))
  assert.ok(digits.filter(d => map.get(d) !== d).length >= 4)
  assert.equal(new Set(map.values()).size, 9)
  for (const a of digits) for (const b of digits) for (const sum of [5, 10]) {
    assert.equal(a + b === sum, map.get(a)! + map.get(b)! === sum)
  }
  assert.equal(miracleSymmetry(['xv', 'kropki-white']), undefined)
})
