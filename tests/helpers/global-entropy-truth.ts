import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Enumerate actual digits under only the four-cell group rule in this proof. */
export function assertGlobalEntropyProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'global-entropy')
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules } = proof.evidence
  assert.equal(rules.length, 1)
  assert.equal(puzzle.rules![rules[0]].type, 'global-entropy')
  assert.equal(cells.length, 4)
  const first = cells[0]
  assert.ok(first >= 0 && first < 72 && first % 9 < 8)
  assert.deepEqual(cells, [first, first + 1, first + 9, first + 10])
  const supported = [0, 0, 0, 0]
  const assignment: number[] = []
  let count = 0
  function visit(index: number) {
    if (index === 4) {
      if (!assignment.some(digit => digit <= 3) || !assignment.some(digit => digit >= 4 && digit <= 6)
        || !assignment.some(digit => digit >= 7)) return
      assignment.forEach((digit, i) => { supported[i] |= 1 << (digit - 1) })
      count++
      return
    }
    for (let digit = 1; digit <= 9; digit++) if (domains[index] & (1 << (digit - 1))) {
      assignment[index] = digit
      visit(index + 1)
      assignment.length = index
    }
  }
  visit(0)
  assert.ok(count > 0, 'The proof premises must allow a group assignment')
  const expected = domains.flatMap((mask, i) => Array.from({ length: 9 }, (_, n) => n + 1)
    .filter(digit => mask & (1 << (digit - 1)) && !(supported[i] & (1 << (digit - 1))))
    .map(digit => ({ eliminate: { cell: cells[i], digit } })))
  assert.deepEqual(proof.actions, expected)
}
