import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Enumerate distinct digits directly, then check the completed numerical span. */
export function assertRenbanProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'renban')
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules } = proof.evidence
  assert.equal(rules.length, 1)
  const rule = puzzle.rules![rules[0]]
  assert.equal(rule.type, 'renban')
  if (rule.type !== 'renban') throw new Error('Expected the declared Renban set')
  assert.deepEqual(cells, rule.cells)
  assert.equal(domains.length, cells.length)
  const support = cells.map(() => new Set<number>()), assigned: number[] = []
  let completions = 0
  function visit() {
    if (assigned.length === cells.length) {
      if (Math.max(...assigned) - Math.min(...assigned) !== cells.length - 1) return
      assigned.forEach((digit, i) => support[i].add(digit)); completions++
      return
    }
    for (let digit = 1; digit <= 9; digit++) {
      if (!(domains[assigned.length] & 1 << (digit - 1)) || assigned.includes(digit)) continue
      assigned.push(digit)
      if (Math.max(...assigned) - Math.min(...assigned) < cells.length) visit()
      assigned.pop()
    }
  }
  visit()
  assert.ok(completions > 0); assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = cells.indexOf(candidate.cell)
    assert.ok(index >= 0 && domains[index] & 1 << (candidate.digit - 1))
    if ('place' in action) assert.deepEqual([...support[index]], [candidate.digit])
    else assert.equal(support[index].has(candidate.digit), false)
  }
}
