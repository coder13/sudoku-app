import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Enumerate the cited domains using only the written neighboring differences. */
export function assertWhispersProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'whispers')
  if (proof.evidence.type !== 'constraint') throw Error('Whispers needs its line premises')
  const { cells, domains, rules } = proof.evidence
  assert.ok(cells.length > 1 && rules.length > 0 && proof.actions.length > 0)
  assert.equal(domains.length, cells.length)
  assert.ok(domains.every(domain => Number.isInteger(domain) && domain > 0 && domain <= 511))
  const unique = [...new Set(cells)], masks = unique.map(cell => cells.reduce((mask, other, i) => other === cell ? mask & domains[i] : mask, 511))
  const edges = rules.flatMap(index => {
    const rule = puzzle.rules?.[index]
    if (rule?.type !== 'whispers') throw Error('Missing Whispers rule')
    assert.ok(Number.isInteger(rule.minDifference) && rule.minDifference >= 1 && rule.minDifference <= 8)
    const pairs = rule.cells.slice(1).flatMap((cell, i) => {
      const a = unique.indexOf(rule.cells[i]), b = unique.indexOf(cell)
      return a >= 0 && b >= 0 ? [[a, b, rule.minDifference] as const] : []
    })
    assert.ok(pairs.length)
    assert.ok(pairs.every(([a, b]) => a !== b))
    return pairs
  })
  const supported = unique.map(() => 0), digits: number[] = []
  function search(at: number) {
    if (at === unique.length) { digits.forEach((digit, i) => { supported[i] |= 1 << (digit - 1) }); return }
    for (let digit = 1; digit <= 9; digit++) {
      if (!(masks[at] & 1 << (digit - 1))) continue
      if (edges.some(([a, b, gap]) => a === at && b < at && Math.abs(digit - digits[b]) < gap ||
        b === at && a < at && Math.abs(digit - digits[a]) < gap)) continue
      digits[at] = digit; search(at + 1)
    }
  }
  search(0)
  assert.ok(supported.every(mask => mask > 0))
  for (const action of proof.actions) {
    const target = 'place' in action ? action.place : action.eliminate
    const at = unique.indexOf(target.cell), bit = 1 << (target.digit - 1)
    assert.ok(at >= 0 && masks[at] & bit)
    if ('place' in action) assert.equal(supported[at], bit)
    else assert.equal(supported[at] & bit, 0)
  }
}
