import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { variantHouseCells } from '../../src/sudoku/variants.ts'
import { houseSupport, pairSupport } from './group-order-truth.ts'
import { matchingGeometry } from './matching-digit-truth.ts'

const bit = (digit: number) => 1 << (digit - 1)
const cells = Array.from({ length: 81 }, (_, cell) => cell)
const layoutKey = (layout: number[]) => layout.join(',')

export function assertMatchingLayoutProof(
  puzzle: VariantPuzzle,
  values: string,
  masks: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence, actions } = deduction
  assert.equal(evidence.type, 'matching-layout')
  const { digit, target, cases } = evidence
  const { matches, houses } = matchingGeometry(puzzle)
  const members = houses.map(house => variantHouseCells(house, puzzle))
  const initial = cells.map(cell => Number(values[cell]) ? bit(Number(values[cell])) : masks[cell])
  const base = matches.map(group => group.reduce((mask, cell) => mask & initial[cell], 511))
  assert.deepEqual(actions, matches[target.cell].map(cell => ({ eliminate: { cell, digit: target.digit } })))
  assert.ok(matches[target.cell].every(cell => values[cell] === '0' && (base[cell] & bit(target.digit)) !== 0))

  // Independently enumerate row placements and enforce matching groups after
  // all nine rows are filled. Use no detector ranking or stopping budget.
  const layouts: string[] = []
  const chosen = new Set<number>()
  function placeRow(row: number) {
    if (row === 9) {
      if (members.every(house => house.filter(cell => chosen.has(cell)).length === 1)
        && [...chosen].every(cell => matches[cell].every(member => chosen.has(member)))) {
        layouts.push(layoutKey(cells.filter(cell => chosen.has(cell))))
      }
      return
    }
    const rowCells = variantHouseCells({ row }, puzzle)
    const given = rowCells.find(cell => values[cell] === String(digit))
    for (const cell of given === undefined ? rowCells : [given]) {
      if (!(base[cell] & bit(digit))) continue
      if (members.some(house => house.includes(cell) && house.some(other => chosen.has(other)))) continue
      chosen.add(cell)
      placeRow(row + 1)
      chosen.delete(cell)
    }
  }
  placeRow(0)
  assert.ok(layouts.length)
  assert.deepEqual(cases.map(layout => layoutKey(layout.cells)).sort(), layouts.sort())

  for (const example of cases) {
    const assigned = new Set(example.cells)
    const domains = base.map((mask, cell) => mask & (assigned.has(cell) ? bit(digit) : ~bit(digit)))
    let contradiction = false
    for (const check of example.checks) {
      assert.equal(contradiction, false)
      assert.deepEqual(check.domains, check.cells.map(cell => domains[cell]))
      const scope = check.scope
      const support = scope.type === 'house'
        ? houseSupport(check.domains)
        : scope.type === 'pair'
          ? pairSupport(scope.rules.map(rule => puzzle.rules![rule]), check.cells, check.domains)
          : assert.fail('Layout proofs use houses and numeric pairs.')
      if (scope.type === 'house') assert.deepEqual(check.cells, variantHouseCells(scope.house, puzzle))
      assert.deepEqual(check.supported, support)
      contradiction = support.some(mask => mask === 0)
      check.cells.forEach((cell, index) => {
        for (const partner of matches[cell]) domains[partner] &= support[index]
      })
    }
    assert.equal(contradiction, example.contradicted)
    if (!contradiction) assert.equal(domains[target.cell] & bit(target.digit), 0)
  }
}
