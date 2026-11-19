import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Check every action directly against its cited marker and explicit candidate domain. */
export function assertParityProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'parity')
  if (proof.evidence.type !== 'constraint') throw Error('Odd/Even needs its marker premises')
  const { rules, cells, domains } = proof.evidence
  assert.ok(cells.length > 0 && rules.length > 0)
  assert.equal(domains.length, cells.length)
  assert.ok(rules.every(index => puzzle.rules?.[index]?.type === 'parity'))
  assert.ok(domains.every(domain => Number.isInteger(domain) && domain > 0 && domain <= 511))
  for (const action of proof.actions) {
    const target = 'place' in action ? action.place : action.eliminate
    const index = cells.indexOf(target.cell)
    assert.ok(index >= 0 && domains[index] & 1 << (target.digit - 1))
    const markers = rules.flatMap(index => {
      const rule = puzzle.rules?.[index]
      return rule?.type === 'parity' && rule.cells.includes(target.cell) ? [rule] : []
    })
    assert.ok(markers.length)
    const supported = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit =>
      domains[index] & 1 << (digit - 1) && markers.every(rule =>
        digit % 2 === (rule.parity === 'odd' ? 1 : 0)))
    assert.ok(supported.length)
    if ('place' in action) assert.deepEqual(supported, [target.digit])
    else assert.ok(!supported.includes(target.digit))
  }
}
