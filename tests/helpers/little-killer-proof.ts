import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Recompute possible integer totals from the cited candidate lists, allowing repeated digits. */
export function checkLittleKillerProof(deduction: VariantDeduction, puzzle: VariantPuzzle) {
  assert.equal(deduction.technique, 'little-killer')
  if (deduction.evidence.type !== 'constraint') throw new Error('Little Killer needs its sum and candidate premises')
  const { cells, domains, rules } = deduction.evidence
  assert.equal(cells.length, domains.length)
  const clue = rules
    .map((index) => puzzle.rules?.[index])
    .find((rule) => rule?.type === 'little-killer' && JSON.stringify(rule.cells) === JSON.stringify(cells))
  if (clue?.type !== 'little-killer') throw new Error('Missing printed Little Killer total')
  const total = clue.sum
  const digits = domains.map((mask) =>
    Array.from({ length: 9 }, (_, i) => i + 1).filter((digit) => mask & (1 << (digit - 1))),
  )
  for (const action of deduction.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate,
      index = cells.indexOf(candidate.cell)
    assert.ok(index >= 0 && digits[index].includes(candidate.digit))
    let totals = new Set([0])
    digits.forEach((options, i) => {
      if (i !== index) totals = new Set([...totals].flatMap((sum) => options.map((digit) => sum + digit)))
    })
    const supported: number[] = digits[index].filter((digit) => totals.has(total - digit))
    assert.ok(supported.length)
    if ('place' in action) assert.deepEqual(supported, [candidate.digit])
    else assert.ok(!supported.includes(candidate.digit))
  }
}
