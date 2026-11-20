import assert from 'node:assert/strict'
import type { VariantDeduction, VariantHouse, VariantPuzzle, VariantRule } from '../../src/sudoku/engine.ts'
import { variantHouseCells } from '../../src/sudoku/variants.ts'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const bit = (digit: number) => 1 << (digit - 1)
const group = (type: 'entropic' | 'modular', digit: number) =>
  type === 'entropic' ? Math.floor((digit - 1) / 3) : (digit - 1) % 3

function houseSupport(domains: number[]) {
  const support = domains.map(() => 0)
  const assignments: number[] = []
  function fill(used: number) {
    if (assignments.length === domains.length) {
      assignments.forEach((mask, i) => { support[i] |= mask })
      return
    }
    for (const digit of digits) {
      const mask = bit(digit)
      if (!(domains[assignments.length] & mask & ~used)) continue
      assignments.push(mask)
      fill(used | mask)
      assignments.pop()
    }
  }
  fill(0)
  return support
}

function pairSupport(rules: VariantRule[], [a, b]: number[], domains: number[]) {
  const marker = (clues: { pairs?: [number, number][]; negative?: boolean } | undefined) =>
    clues?.pairs?.some(([left, right]) => left === a && right === b || left === b && right === a)
  const kropki = rules.filter(rule => rule.type === 'kropki')
  const xv = rules.filter(rule => rule.type === 'xv')
  const checks = [
    { clues: kropki.map(rule => rule.consecutive), permits: (x: number, y: number) => Math.abs(x - y) === 1 },
    { clues: kropki.map(rule => rule.ratioTwo), permits: (x: number, y: number) => x === 2 * y || y === 2 * x },
    { clues: xv.map(rule => rule.five), permits: (x: number, y: number) => x + y === 5 },
    { clues: xv.map(rule => rule.ten), permits: (x: number, y: number) => x + y === 10 },
  ]
  const positive = checks.filter(check => check.clues.some(marker))
  const negative = positive.length ? [] : checks.filter(check => check.clues.some(clue => clue?.negative))
  const supports = [0, 0]
  for (const x of digits) for (const y of digits) {
    if (!(domains[0] & bit(x)) || !(domains[1] & bit(y))) continue
    if (!positive.every(check => check.permits(x, y)) || negative.some(check => check.permits(x, y))) continue
    if (!rules.every(rule => {
      if (rule.type === 'inequality') return rule.less === a ? x < y : y < x
      if (rule.type === 'adjacent-total') return x !== y && x + y === rule.sum
      return rule.type === 'kropki' || rule.type === 'xv'
    })) continue
    supports[0] |= bit(x)
    supports[1] |= bit(y)
  }
  assert.equal(rules.length > 0, true)
  return supports
}

function lineChoices(rule: VariantRule, cells: number[], domains: number[]) {
  assert.ok(rule.type === 'entropic' || rule.type === 'modular')
  assert.deepEqual(cells, [...new Set(rule.cells)])
  const partitions = [0, 1, 2].map(i =>
    digits.reduce((mask, d) => group(rule.type, d) === i ? mask | bit(d) : mask, 0))
  const choices = []
  for (const a of partitions) for (const b of partitions) for (const c of partitions) {
    if (a === b || b === c || a === c) continue
    const order = [a, b, c]
    if (rule.cells.every((cell, i) => domains[cells.indexOf(cell)] & order[i % 3])) choices.push(order)
  }
  return choices
}

type Check = Extract<VariantDeduction['evidence'], { type: 'group-order' }>['rejected'][number]['conflict']

function houseDomains(puzzle: VariantPuzzle, values: string, eliminations: readonly number[]) {
  const rules = puzzle.rules!
  const houses: VariantHouse[] = digits.flatMap((_, i) => [{ row: i }, { column: i }, { region: i }])
  for (const [i, rule] of rules.entries()) {
    if (rule.type === 'extra-house') houses.push({ extra: i })
    if (rule.type === 'diagonal') houses.push({ diagonal: rule.diagonal })
  }
  const before = [...values].map((value, cell) => value === '0' ? 511 & ~eliminations[cell] : bit(Number(value)))
  for (const house of houses) {
    const members = variantHouseCells(house, puzzle)
    const used = members.reduce((mask, cell) => values[cell] === '0' ? mask : mask | bit(Number(values[cell])), 0)
    for (const cell of members) if (values[cell] === '0') before[cell] &= ~used
  }
  return before
}

function supportCheck(puzzle: VariantPuzzle, check: Check, current: number[]) {
  const rules = puzzle.rules!
  const scope = check.scope
  if (scope.type === 'house') {
    assert.deepEqual([...check.cells].sort(), [...variantHouseCells(scope.house, puzzle)].sort())
    return houseSupport(current)
  }
  if (scope.type === 'pair') return pairSupport(scope.rules.map(index => rules[index]), check.cells, current)
  const target = rules[scope.rule]
  assert.ok(target.type === 'entropic' || target.type === 'modular')
  const choices = lineChoices(target, check.cells, current)
  return check.cells.map((cell, i) => choices.reduce((mask, order) =>
    mask | (current[i] & order[target.cells.indexOf(cell) % 3]), 0))
}

export function assertGroupOrderProof(
  puzzle: VariantPuzzle,
  values: string,
  eliminations: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence, actions } = deduction
  assert.equal(evidence.type, 'group-order')
  const rules = puzzle.rules!
  const source = rules[evidence.rule]
  assert.ok(source.type === 'entropic' || source.type === 'modular')
  const { cells, domains, phases, rejected, remaining } = evidence
  const before = houseDomains(puzzle, values, eliminations)
  assert.deepEqual(domains, cells.map(cell => before[cell]))
  assert.deepEqual(phases, cells.map(cell => source.cells.indexOf(cell) % 3))
  const orders = [...remaining, ...rejected.map(item => item.groups)].map(groups => groups.join()).sort()
  assert.deepEqual(orders, lineChoices(source, cells, domains).map(groups => groups.join()).sort())
  for (const { groups, checks, conflict, houseConflict } of rejected) {
    const assumed = [...before]
    cells.forEach((cell, i) => { assumed[cell] &= groups[phases[i]] })
    assert.ok([...checks, conflict].some(step => step.scope.type === 'pair'))
    for (const check of [...checks, conflict]) {
      const current = check.cells.map(cell => assumed[cell])
      assert.deepEqual(check.domains, current)
      const supported = supportCheck(puzzle, check, current)
      assert.deepEqual(check.supported, supported)
      assert.notDeepEqual(check.supported, current)
      assert.ok(supported.every(mask => check === conflict ? mask === 0 : mask !== 0))
      check.cells.forEach((cell, i) => { assumed[cell] = supported[i] })
    }
    if (conflict.scope.type === 'house') {
      assert.ok(houseConflict)
      const needed = digits.filter(digit => houseConflict.digits & bit(digit)).length
      assert.notEqual(needed, houseConflict.cells.length)
      if (needed > houseConflict.cells.length) {
        assert.deepEqual(conflict.cells.filter((_, i) => conflict.domains[i] & houseConflict.digits), houseConflict.cells)
      } else {
        assert.ok(houseConflict.cells.every(cell =>
          !(conflict.domains[conflict.cells.indexOf(cell)] & ~houseConflict.digits)))
      }
    } else assert.equal(houseConflict, undefined)
  }
  const expected = cells.flatMap((cell, i) => values[cell] !== '0' ? [] : digits
    .filter(digit => (domains[i] & bit(digit)) && !remaining.some(order => order[phases[i]] & bit(digit)))
    .map(digit => `${cell}:${digit}`))
  assert.deepEqual(actions.map(action => {
    assert.ok('eliminate' in action)
    return `${action.eliminate.cell}:${action.eliminate.digit}`
  }).sort(), expected.sort())
}

/** Independently enumerate both branch orders and every local assignment used. */
export function assertGroupOrderElimination(
  puzzle: VariantPuzzle,
  values: string,
  eliminations: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence, actions } = deduction
  assert.equal(evidence.type, 'group-order-elimination')
  const { rule, cells, phases, branches, domains } = evidence
  const source = puzzle.rules![rule]
  assert.ok(source.type === 'entropic' || source.type === 'modular')
  const before = houseDomains(puzzle, values, eliminations)
  assert.deepEqual(domains, cells.map(cell => before[cell]))
  assert.deepEqual(phases, cells.map(cell => source.cells.indexOf(cell) % 3))
  assert.deepEqual(
    branches.map(branch => branch.groups.join()).sort(),
    lineChoices(source, cells, domains).map(order => order.join()).sort(),
  )
  assert.equal(branches.length, 2)
  assert.equal(actions.length, 1)
  const [action] = actions
  assert.ok('eliminate' in action)
  const target = action.eliminate
  assert.equal(values[target.cell], '0')
  assert.ok(before[target.cell] & bit(target.digit))
  assert.ok(branches.some(branch => branch.checks.some(check => check.scope.type === 'pair')))
  for (const { groups, checks } of branches) {
    const assumed = [...before]
    cells.forEach((cell, i) => { assumed[cell] &= groups[phases[i]] })
    for (const check of checks) {
      const current = check.cells.map(cell => assumed[cell])
      assert.deepEqual(check.domains, current)
      const supported = supportCheck(puzzle, check, current)
      assert.deepEqual(check.supported, supported)
      assert.notDeepEqual(current, supported)
      assert.ok(supported.every(Boolean))
      check.cells.forEach((cell, i) => { assumed[cell] = supported[i] })
    }
    assert.equal(assumed[target.cell] & bit(target.digit), 0)
  }
}
