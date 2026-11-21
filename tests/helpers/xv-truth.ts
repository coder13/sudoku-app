import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { assertSumPairProof } from './adjacent-total-truth.ts'

/** Enumerate allowed sums from the stated digits and all cited XV layers. */
export function assertXvProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'xv')
  if (proof.evidence.type === 'sum-pair') {
    assertSumPairProof(puzzle, proof)
    return
  }
  assert.equal(proof.evidence.type, 'constraint')
  const evidence = proof.evidence
  assert.equal(evidence.cells.length, 2)
  assert.equal(evidence.domains.length, 2)
  const [a, b] = evidence.cells
  assert.equal(Math.abs(a % 9 - b % 9) + Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), 1)
  const rules = evidence.rules.map(index => {
    const rule = puzzle.rules![index]
    assert.equal(rule.type, 'xv')
    if (rule.type !== 'xv') throw new Error('Expected an XV rule')
    return rule
  })
  const marks = (sum: 5 | 10) => rules.map(rule => sum === 5 ? rule.five : rule.ten)
  const given = (sum: 5 | 10) => marks(sum).some(mark => mark?.pairs?.some(([x, y]) => x === a && y === b || x === b && y === a))
  const v = given(5), x = given(10)
  const negative = (sum: 5 | 10) => marks(sum).some(mark => mark?.negative)
  assert.ok(v || x || negative(5) || negative(10))
  for (const mask of evidence.domains) assert.ok(Number.isInteger(mask) && mask > 0 && mask <= 511)
  const pairs: number[][] = []
  for (let left = 1; left <= 9; left++) for (let right = 1; right <= 9; right++) {
    if (left === right || !(evidence.domains[0] & 1 << (left - 1)) || !(evidence.domains[1] & 1 << (right - 1))) continue
    const sum = left + right
    if (v && sum !== 5 || x && sum !== 10 || !v && !x && (negative(5) && sum === 5 || negative(10) && sum === 10)) continue
    pairs.push([left, right])
  }
  assert.ok(pairs.length > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = evidence.cells.indexOf(candidate.cell)
    assert.ok(index >= 0)
    assert.ok(evidence.domains[index] & 1 << (candidate.digit - 1))
    const support = new Set(pairs.map(pair => pair[index]))
    if ('place' in action) assert.deepEqual([...support], [candidate.digit])
    else assert.equal(support.has(candidate.digit), false)
  }
}
