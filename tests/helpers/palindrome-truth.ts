import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPosition } from '../../src/sudoku/engine.ts'

/** Replay each action from the stated domains and the mathematical mirror rule. */
export function assertPalindromeProof(position: VariantPosition, proof: VariantDeduction) {
  assert.equal(proof.technique, 'palindrome')
  assert.equal(proof.evidence.type, 'constraint')
  const evidence = proof.evidence
  assert.equal(evidence.rules.length, 1)
  const rule = position.puzzle.rules![evidence.rules[0]]
  assert.equal(rule.type, 'palindrome')
  assert.deepEqual(evidence.cells, rule.cells)
  assert.equal(evidence.domains.length, rule.cells.length)
  for (const mask of evidence.domains) assert.ok(Number.isInteger(mask) && mask > 0 && mask <= 511)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = rule.cells.indexOf(candidate.cell)
    assert.ok(index >= 0)
    const opposite = rule.cells.length - 1 - index
    const support = evidence.domains[index] & evidence.domains[opposite]
    const bit = 1 << (candidate.digit - 1)
    assert.ok(evidence.domains[index] & bit)
    if ('place' in action) assert.equal(support, bit)
    else assert.equal(support & bit, 0)
  }
}
