import assert from 'node:assert/strict'
import type { VariantDeduction, VariantHouse, VariantPosition, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Exhaust the Cartesian product in the proof, testing the written rules directly. */
export function assertLineHouseProof(position: VariantPosition, deduction: VariantDeduction) {
  const evidence = deduction.evidence
  assert.equal(evidence.type, 'line-houses')
  const { cells, domains, supported, houses, rules, assignments } = evidence
  const houseCells = (house: VariantHouse, puzzle: VariantPuzzle): readonly number[] => {
    if ('row' in house) return Array.from({ length: 9 }, (_, i) => house.row * 9 + i)
    if ('column' in house) return Array.from({ length: 9 }, (_, i) => i * 9 + house.column)
    if ('diagonal' in house) return Array.from({ length: 9 }, (_, i) => house.diagonal === 'main' ? 10 * i : 8 + 8 * i)
    if ('extra' in house) { const rule = puzzle.rules![house.extra]; assert.equal(rule.type, 'extra-house'); return rule.cells }
    return puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions[house.region] : Array.from({ length: 9 }, (_, i) => Math.floor(house.region / 3) * 27 + house.region % 3 * 3 + Math.floor(i / 3) * 9 + i % 3)
  }
  const scopes = houses.map(house => houseCells(house, position.puzzle))
  let product: number[][] = [[]]
  for (let i = 0; i < cells.length; i++) {
    const next: number[][] = []
    for (const prior of product) for (let digit = 1; digit <= 9; digit++) {
      if (!(domains[i] & 1 << (digit - 1))) continue
      if (prior.some((other, j) => other === digit && scopes.some(house => house.includes(cells[i]) && house.includes(cells[j])))) continue
      if (!rules.every(index => {
        const rule = position.puzzle.rules![index]; assert.equal(rule.type, 'whispers')
        return rule.cells.slice(1).every((b, j) => {
          const a = rule.cells[j]
          const other = a === cells[i] ? b : b === cells[i] ? a : -1
          const at = cells.indexOf(other)
          return at < 0 || at >= i || Math.abs(digit - prior[at]) >= rule.minDifference
        })
      })) continue
      next.push([...prior, digit])
    }
    product = next
  }
  assert.ok(product.length > 0)
  assert.equal(product.length, assignments)
  const union = cells.map((_, i) => product.reduce((mask, row) => mask | 1 << (row[i] - 1), 0))
  assert.deepEqual(supported, union)
  for (const action of deduction.actions) {
    assert.ok('eliminate' in action)
    const at = cells.indexOf(action.eliminate.cell)
    assert.ok(at >= 0 && domains[at] & 1 << (action.eliminate.digit - 1))
    assert.equal(union[at] & 1 << (action.eliminate.digit - 1), 0)
  }
}
