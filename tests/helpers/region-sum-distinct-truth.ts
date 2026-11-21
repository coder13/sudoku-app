import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const bit = (digit: number) => 1 << (digit - 1)

function digitAssignments(domains: readonly number[], distinct: boolean) {
  const supported = new Map<number, number[]>()
  const chosen: number[] = []
  function visit(index: number, sum: number) {
    if (index === domains.length) {
      const masks = supported.get(sum) ?? domains.map(() => 0)
      for (const [i, digit] of chosen.entries()) masks[i] |= bit(digit)
      supported.set(sum, masks)
      return
    }
    for (const digit of digits) {
      if (!(domains[index] & bit(digit)) || distinct && chosen.includes(digit)) continue
      chosen.push(digit)
      visit(index + 1, sum + digit)
      chosen.pop()
    }
  }
  visit(0, 0)
  return supported
}

export function assertRegionSumDistinctProof(
  puzzle: VariantPuzzle,
  values: string,
  masks: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence } = deduction
  assert.equal(evidence.type, 'region-sum-distinct')
  const rule = puzzle.rules![evidence.rule]
  assert.equal(rule.type, 'region-sum')

  const regionOf = (cell: number) => puzzle.regions?.type === 'jigsaw'
    ? puzzle.regions.regions.findIndex(region => region.includes(cell))
    : Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
  const expected: number[][] = []
  const visits: number[] = []
  for (const cell of rule.cells) {
    const region = regionOf(cell)
    const index = rule.groupByRegion ? visits.indexOf(region) : visits.at(-1) === region ? visits.length - 1 : -1
    if (index < 0) {
      visits.push(region)
      expected.push([cell])
    } else expected[index].push(cell)
  }
  const normalize = (parts: readonly (readonly number[])[]) => parts.map(part => [...part].sort((a, b) => a - b).join(',')).sort()
  assert.deepEqual(normalize(evidence.parts.map(part => part.cells)), normalize(expected))
  for (const part of evidence.parts) {
    assert.deepEqual(part.domains, part.cells.map(cell => values[cell] === '0' ? masks[cell] : bit(Number(values[cell]))))
  }

  function support(distinct: boolean) {
    const assignments = evidence.parts.map(part => digitAssignments(part.domains, distinct))
    const shared = [...assignments[0].keys()].filter(sum => assignments.every(part => part.has(sum))).sort((a, b) => a - b)
    return { shared, assignments, allowed: evidence.parts.map((part, i) => part.cells.map((_, j) =>
      shared.reduce((mask, total) => mask | assignments[i].get(total)![j], 0)
    )) }
  }

  const distinct = support(true)
  assert.deepEqual(evidence.commonTotals, distinct.shared)
  assert.ok(distinct.shared.length > 0)
  for (const [i, part] of evidence.parts.entries()) {
    assert.deepEqual(part.totals, [...distinct.assignments[i].keys()].sort((a, b) => a - b))
  }
  const basic = support(false)
  const actions = evidence.parts.flatMap((part, i) => part.cells.flatMap((cell, j) => {
    if (values[cell] !== '0') return []
    return digits.filter(digit => basic.allowed[i][j] & ~distinct.allowed[i][j] & bit(digit))
      .map(digit => ({ eliminate: { cell, digit } }))
  }))
  actions.sort((a, b) => a.eliminate.cell - b.eliminate.cell || a.eliminate.digit - b.eliminate.digit)
  assert.deepEqual(deduction.actions, actions)
}
