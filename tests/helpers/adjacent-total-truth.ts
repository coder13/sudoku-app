import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Replay a local sum from digit pairs rather than the engine's support tables. */
export function assertAdjacentTotalProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'adjacent-total')
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules: indices } = proof.evidence
  assert.equal(cells.length, 2); assert.equal(domains.length, 2); assert.ok(indices.length > 0)
  const [a, b] = cells
  assert.equal(Math.abs(a % 9 - b % 9) + Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), 1)
  const totals = indices.map(index => {
    const rule = puzzle.rules![index]
    assert.equal(rule.type, 'adjacent-total')
    if (rule.type !== 'adjacent-total') throw new Error('Expected a declared total')
    assert.deepEqual(new Set(rule.cells), new Set(cells))
    return rule.sum
  })
  const pairs: [number, number][] = []
  for (let left = 1; left <= 9; left++) for (let right = 1; right <= 9; right++) {
    if (left !== right && domains[0] & 1 << (left - 1) && domains[1] & 1 << (right - 1) && totals.every(sum => left + right === sum)) pairs.push([left, right])
  }
  assert.ok(pairs.length > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = cells.indexOf(candidate.cell)
    assert.ok(index >= 0); assert.ok(domains[index] & 1 << (candidate.digit - 1))
    const permitted = new Set(pairs.map(pair => pair[index]))
    if ('place' in action) assert.deepEqual([...permitted], [candidate.digit])
    else assert.equal(permitted.has(candidate.digit), false)
  }
}
