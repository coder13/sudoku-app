import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Enumerate the permitted digit pairs independently of native support masks. */
export function assertInequalityProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'inequality')
  assert.equal(proof.evidence.type, 'constraint')
  const evidence = proof.evidence
  assert.equal(evidence.rules.length, 1)
  const rule = puzzle.rules![evidence.rules[0]]
  assert.equal(rule.type, 'inequality')
  if (rule.type !== 'inequality') return
  assert.deepEqual(new Set(evidence.cells), new Set([rule.less, rule.greater]))
  const smaller = evidence.domains[evidence.cells.indexOf(rule.less)]
  const larger = evidence.domains[evidence.cells.indexOf(rule.greater)]
  const pairs: number[][] = []
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
    if (a < b && smaller & 1 << (a - 1) && larger & 1 << (b - 1)) pairs.push([a, b])
  }
  assert.ok(pairs.length > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const side = candidate.cell === rule.less ? 0 : 1
    assert.ok(candidate.cell === rule.less || candidate.cell === rule.greater)
    const support = new Set(pairs.map(pair => pair[side]))
    if ('place' in action) assert.deepEqual([...support], [candidate.digit])
    else assert.equal(support.has(candidate.digit), false)
  }
}
