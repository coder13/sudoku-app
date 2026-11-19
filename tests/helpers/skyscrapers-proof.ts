import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Replay the cited row's permutations from its explicit domains and visibility count. */
export function checkSkyscrapersProof(deduction: VariantDeduction, puzzle: VariantPuzzle) {
  assert.equal(deduction.technique, 'skyscrapers')
  if (deduction.evidence.type !== 'constraint') throw new Error('Skyscrapers needs its row and candidate premises')
  const { cells, domains, rules } = deduction.evidence
  assert.equal(cells.length, 9)
  assert.equal(domains.length, 9)
  const clue = rules
    .map((index) => puzzle.rules?.[index])
    .find((rule) => rule?.type === 'skyscrapers' && JSON.stringify(rule.cells) === JSON.stringify(cells))
  if (clue?.type !== 'skyscrapers') throw new Error('Missing printed Skyscrapers visibility count')
  const required = clue.count
  const supported = cells.map(() => new Set<number>()),
    assigned = Array<number>(9).fill(0)
  const order = cells
    .map((_, i) => i)
    .sort(
      (a, b) => domains[a].toString(2).replaceAll('0', '').length - domains[b].toString(2).replaceAll('0', '').length,
    )
  let count = 0
  function enumerate(depth: number, used: Set<number>) {
    if (depth === 9) {
      let maximum = 0,
        visible = 0
      for (const digit of assigned)
        if (digit > maximum) {
          maximum = digit
          visible++
        }
      if (visible !== required) return
      count++
      assigned.forEach((digit, i) => supported[i].add(digit))
      return
    }
    const i = order[depth]
    for (let digit = 1; digit <= 9; digit++)
      if (domains[i] & (1 << (digit - 1)) && !used.has(digit)) {
        assigned[i] = digit
        used.add(digit)
        enumerate(depth + 1, used)
        used.delete(digit)
      }
  }
  enumerate(0, new Set())
  assert.ok(count)
  for (const action of deduction.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate,
      index = cells.indexOf(candidate.cell)
    assert.ok(index >= 0 && domains[index] & (1 << (candidate.digit - 1)))
    if ('place' in action) assert.deepEqual([...supported[index]], [candidate.digit])
    else assert.ok(!supported[index].has(candidate.digit))
  }
}
