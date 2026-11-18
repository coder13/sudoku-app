import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Independently enumerate groups under each original sliding-window rule. */
export function assertEntropicProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'entropic')
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules } = proof.evidence
  assert.equal(rules.length, 1)
  const rule = puzzle.rules![rules[0]]
  assert.equal(rule.type, 'entropic')
  if (rule.type !== 'entropic') throw new Error('Expected the declared Entropic path')
  assert.deepEqual(cells, [...new Set(rule.cells)])
  assert.equal(domains.length, cells.length)
  const masks = [7, 56, 448],
    assigned: number[] = [],
    support = cells.map(() => 0)
  let completions = 0
  function visit() {
    for (let i = 0; i < rule.cells.length; i++)
      for (let j = i + 1; j < Math.min(i + 3, rule.cells.length); j++) {
        const a = assigned[cells.indexOf(rule.cells[i])],
          b = assigned[cells.indexOf(rule.cells[j])]
        if (a !== undefined && b !== undefined && a === b) return
      }
    if (assigned.length === cells.length) {
      assigned.forEach((group, i) => {
        support[i] |= domains[i] & masks[group]
      })
      completions++
      return
    }
    for (let group = 0; group < 3; group++)
      if (domains[assigned.length] & masks[group]) {
        assigned.push(group)
        visit()
        assigned.pop()
      }
  }
  visit()
  assert.ok(completions > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate,
      index = cells.indexOf(candidate.cell),
      bit = 1 << (candidate.digit - 1)
    assert.ok(index >= 0 && domains[index] & bit)
    if ('place' in action) assert.equal(support[index], bit)
    else assert.equal(support[index] & bit, 0)
  }
}
