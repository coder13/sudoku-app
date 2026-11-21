import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { variantHouseCells } from '../../src/sudoku/variants.ts'

/** Independently enumerate groups under each original sliding-window rule. */
export function assertGroupLineProof(
  puzzle: VariantPuzzle,
  proof: VariantDeduction,
  type: 'entropic' | 'modular'
) {
  assert.equal(proof.technique, type)
  if (proof.evidence.type === 'group-line-sum-house') {
    const { cells, domains, rules, house, total } = proof.evidence
    const [target, endpoint, partner] = cells
    const [line, sum] = rules.map(index => puzzle.rules![index])
    assert.ok(line.type === 'modular' || line.type === 'entropic')
    assert.equal(line.type, type)
    assert.equal(new Set(cells).size, 3)
    const offset = line.cells.indexOf(target) - line.cells.indexOf(endpoint)
    assert.ok(line.cells.includes(target) && line.cells.includes(endpoint))
    assert.equal(Math.abs(offset) % 3, 0)
    const samePair = ([a, b]: readonly number[]) => a === endpoint && b === partner || b === endpoint && a === partner
    const printedTotal = sum.type === 'adjacent-total' && samePair(sum.cells) ? sum.sum
      : sum.type === 'xv' && sum.five?.pairs?.some(samePair) ? 5
      : sum.type === 'xv' && sum.ten?.pairs?.some(samePair) ? 10 : undefined
    assert.equal(total, printedTotal)
    const sites = variantHouseCells(house, puzzle)
    assert.ok(sites.includes(target) && sites.includes(partner))

    const group = (digit: number) => type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
    const fits = (digit: number, index: number) => Boolean(domains[index] & (1 << (digit - 1)))
    const withHouse = new Set<number>()
    const withoutHouse = new Set<number>()
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
      if (b === c || b + c !== total || group(a) !== group(b) || !fits(a, 0) || !fits(b, 1) || !fits(c, 2)) continue
      if (sites.includes(endpoint) && a === b) continue
      withoutHouse.add(a)
      if (a !== c) withHouse.add(a)
    }
    assert.ok(withHouse.size)
    assert.deepEqual(proof.actions, [...withoutHouse].filter(digit => !withHouse.has(digit))
      .map(digit => ({ eliminate: { cell: target, digit } })))
    return
  }
  if (proof.evidence.type === 'group-line-house') {
    const { cells, domains, rule: index, house } = proof.evidence
    const rule = puzzle.rules![index]
    assert.ok(rule.type === 'entropic' || rule.type === 'modular')
    assert.equal(rule.type, type)
    const [first, second] = cells.map(cell => rule.cells.indexOf(cell))
    assert.ok(first >= 0 && second > first)
    assert.equal((second - first) % 3, 0)
    assert.ok(cells.every(cell => variantHouseCells(house, puzzle).includes(cell)))

    const group = (digit: number) => type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
    const supported = [0, 0]
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
      const left = 1 << (a - 1), right = 1 << (b - 1)
      if (a !== b && group(a) === group(b) && (domains[0] & left) && (domains[1] & right)) {
        supported[0] |= left
        supported[1] |= right
      }
    }
    assert.ok(supported.every(Boolean))
    assert.ok(proof.actions.length)
    for (const action of proof.actions) {
      assert.ok('eliminate' in action)
      const cell = cells.indexOf(action.eliminate.cell), bit = 1 << (action.eliminate.digit - 1)
      assert.ok(cell >= 0 && (domains[cell] & bit))
      assert.equal(supported[cell] & bit, 0)
    }
    return
  }
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules } = proof.evidence
  assert.equal(rules.length, 1)
  const rule = puzzle.rules![rules[0]]
  assert.equal(rule.type, type)
  if (rule.type !== 'entropic' && rule.type !== 'modular') throw new Error('Expected a declared group line')
  assert.deepEqual(cells, [...new Set(rule.cells)])
  assert.equal(domains.length, cells.length)
  const masks = [0, 0, 0]
  for (let digit = 1; digit <= 9; digit++) masks[type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3] |= 1 << (digit - 1)
  const path = rule.cells
  const assigned: number[] = [],
    support = cells.map(() => 0)
  let completions = 0
  function visit() {
    for (let i = 0; i < path.length; i++)
      for (let j = i + 1; j < Math.min(i + 3, path.length); j++) {
        const a = assigned[cells.indexOf(path[i])],
          b = assigned[cells.indexOf(path[j])]
        if (a !== undefined && b !== undefined && a === b) return
      }
    if (assigned.length === cells.length) {
      assigned.forEach((group, i) => {
        support[i] |= domains[i] & masks[group]
      })
      completions++
      return
    }
    for (let group = 0; group < 3; group++)
      if (domains[assigned.length] & masks[group]) {
        assigned.push(group)
        visit()
        assigned.pop()
      }
  }
  visit()
  assert.ok(completions > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate,
      index = cells.indexOf(candidate.cell),
      bit = 1 << (candidate.digit - 1)
    assert.ok(index >= 0 && domains[index] & bit)
    if ('place' in action) assert.equal(support[index], bit)
    else assert.equal(support[index] & bit, 0)
  }
}
