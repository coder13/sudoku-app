import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle, VariantRule } from '../../src/sudoku/engine.ts'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const bit = (digit: number) => 1 << (digit - 1)
const ascending = (a: number, b: number) => a - b
const domainAt = (values: string, masks: readonly number[], cell: number) =>
  values[cell] === '0' ? masks[cell] : bit(Number(values[cell]))
const regionOf = (puzzle: VariantPuzzle, cell: number) => puzzle.regions?.type === 'jigsaw'
  ? puzzle.regions.regions.findIndex(region => region.includes(cell))
  : Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
const normalize = (parts: readonly (readonly number[])[]) =>
  parts.map(part => [...part].sort(ascending).join(',')).sort()

function ruleParts(puzzle: VariantPuzzle, rule: Extract<VariantRule, { type: 'region-sum' }>) {
  const parts: number[][] = []
  const visits: number[] = []
  for (const cell of rule.cells) {
    const region = regionOf(puzzle, cell)
    const index = rule.groupByRegion ? visits.indexOf(region) : visits.at(-1) === region ? visits.length - 1 : -1
    if (index < 0) {
      visits.push(region)
      parts.push([cell])
    } else parts[index].push(cell)
  }
  return parts
}

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

  assert.deepEqual(normalize(evidence.parts.map(part => part.cells)), normalize(ruleParts(puzzle, rule)))
  for (const part of evidence.parts) {
    assert.deepEqual(part.domains, part.cells.map(cell => domainAt(values, masks, cell)))
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

export function assertRegionSumHouseProof(
  puzzle: VariantPuzzle,
  values: string,
  masks: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence } = deduction
  assert.equal(evidence.type, 'region-sum-house')
  assert.ok('region' in evidence.house)
  const region = evidence.house.region
  assert.ok(evidence.lines.length >= 2)
  assert.equal(new Set(evidence.lines.map(line => line.rule)).size, evidence.lines.length)
  assert.deepEqual(evidence.remainderDomains, evidence.remainder.map(cell => domainAt(values, masks, cell)))
  const localCells = evidence.lines.flatMap(line => line.parts[line.inRegion].cells).concat(evidence.remainder)
  assert.deepEqual([...localCells].sort(ascending),
    Array.from({ length: 81 }, (_, cell) => cell).filter(cell => regionOf(puzzle, cell) === region))

  const lines = evidence.lines.map(line => {
    const rule = puzzle.rules![line.rule]
    assert.equal(rule.type, 'region-sum')
    assert.deepEqual(normalize(line.parts.map(part => part.cells)), normalize(ruleParts(puzzle, rule)))
    const parts = line.parts.map((part, index) => {
      assert.deepEqual(part.domains, part.cells.map(cell => domainAt(values, masks, cell)))
      assert.equal(part.cells.every(cell => regionOf(puzzle, cell) === region), index === line.inRegion)
      const assignments = digitAssignments(part.domains, true)
      assert.deepEqual(part.totals, [...assignments.keys()].sort(ascending))
      return { ...part, assignments }
    })
    const common = [...parts[0].assignments.keys()].filter(sum => parts.every(part => part.assignments.has(sum))).sort(ascending)
    assert.deepEqual(line.commonTotals, common)
    return { ...line, parts, common, surviving: new Set<number>() }
  })

  // Enumerate the nine cells directly and enforce each line's allowed totals.
  // This is independent of the engine's disjoint digit-set join.
  const domains = localCells.map(cell => domainAt(values, masks, cell))
  const assigned = new Array<number>(81).fill(0)
  const localSupport = new Array<number>(81).fill(0)
  function visit(index: number, used: number) {
    if (index === localCells.length) {
      const totals = lines.map(line => line.parts[line.inRegion].cells.reduce((sum, cell) => sum + assigned[cell], 0))
      if (totals.some((sum, i) => !lines[i].common.includes(sum))) return
      totals.forEach((sum, i) => lines[i].surviving.add(sum))
      for (const cell of localCells) localSupport[cell] |= bit(assigned[cell])
      return
    }
    const cell = localCells[index]
    for (const digit of digits) {
      if (!(domains[index] & ~used & bit(digit))) continue
      assigned[cell] = digit
      visit(index + 1, used | bit(digit))
    }
  }
  visit(0, 0)

  const removals = new Map<number, number>()
  function compare(cell: number, before: number, after: number) {
    if (values[cell] === '0' && before & ~after) removals.set(cell, (removals.get(cell) ?? 0) | (before & ~after))
  }
  for (const line of lines) {
    assert.deepEqual(line.remainingTotals, [...line.surviving].sort(ascending))
    assert.ok(line.surviving.size > 0)
    for (const [index, part] of line.parts.entries()) {
      for (const [i, cell] of part.cells.entries()) {
        const before = line.common.reduce((mask, sum) => mask | part.assignments.get(sum)![i], 0)
        const after = index === line.inRegion ? localSupport[cell]
          : [...line.surviving].reduce((mask, sum) => mask | part.assignments.get(sum)![i], 0)
        compare(cell, before, after)
      }
    }
  }
  const remainder = [...digitAssignments(evidence.remainderDomains, true).values()]
  evidence.remainder.forEach((cell, i) =>
    compare(cell, remainder.reduce((mask, assignment) => mask | assignment[i], 0), localSupport[cell]))
  const actions = [...removals].sort(([a], [b]) => ascending(a, b)).flatMap(([cell, mask]) =>
    digits.filter(digit => mask & bit(digit)).map(digit => ({ eliminate: { cell, digit } })))
  assert.deepEqual(deduction.actions, actions)
}
