import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { variantHouseCells } from '../../src/sudoku/variants.ts'

function assertGroupAndSum(puzzle: VariantPuzzle, type: 'entropic' | 'modular', rules: readonly number[],
  [first, second, left, right]: readonly number[], total: number) {
  const [line, sum] = rules.map(index => puzzle.rules![index])
  assert.ok(line.type === 'modular' || line.type === 'entropic')
  assert.equal(line.type, type)
  assert.ok(line.cells.includes(first) && line.cells.includes(second))
  assert.equal(Math.abs(line.cells.indexOf(first) - line.cells.indexOf(second)) % 3, 0)
  assertPrintedSum(sum, left, right, total)
}

function assertPrintedSum(sum: NonNullable<VariantPuzzle['rules']>[number], left: number, right: number, total: number) {
  const samePair = ([a, b]: readonly number[]) => a === left && b === right || b === left && a === right
  const printedTotal = sum.type === 'adjacent-total' && samePair(sum.cells) ? sum.sum
    : sum.type === 'xv' && sum.five?.pairs?.some(samePair) ? 5
    : sum.type === 'xv' && sum.ten?.pairs?.some(samePair) ? 10 : undefined
  assert.equal(total, printedTotal)
}

/** Independently enumerate groups under each original sliding-window rule. */
export function assertGroupLineProof(
  puzzle: VariantPuzzle,
  proof: VariantDeduction,
  type: 'entropic' | 'modular'
) {
  assert.equal(proof.technique, type)
  if (proof.evidence.type === 'group-line-phase-sum') {
    const { cells, rules, domains, total, house } = proof.evidence
    const [a, b, c, fixed] = cells
    assert.equal(new Set(cells).size, 4)
    const line = puzzle.rules![rules[0]]
    assert.ok(line.type === 'modular' || line.type === 'entropic')
    assert.equal(line.type, type)
    const phases = [a, c, fixed].map(cell => line.cells.indexOf(cell))
    assert.ok(phases.every(phase => phase >= 0))
    assert.equal(new Set(phases.map(phase => phase % 3)).size, 3)
    assertPrintedSum(puzzle.rules![rules[1]], a, b, total)
    const sites = variantHouseCells(house, puzzle)
    assert.ok(sites.includes(b) && sites.includes(c))

    const group = (digit: number) => type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
    const allDigits = Array.from({ length: 9 }, (_, i) => i + 1)
    const allowed = domains.map(mask => allDigits.filter(digit => mask & (1 << (digit - 1))))
    assert.equal(new Set(allowed[3].map(group)).size, 1)
    const possible = [0, 0, 0], supported = [0, 0, 0]
    for (const x of allowed[0]) for (const y of allowed[1]) for (const z of allowed[2]) for (const d of allowed[3]) {
      if (x === y || x + y !== total || new Set([x, z, d].map(group)).size !== 3) continue
      for (const [i, digit] of [x, y, z].entries()) {
        possible[i] |= 1 << (digit - 1)
        if (y !== z) supported[i] |= 1 << (digit - 1)
      }
    }
    assert.ok(supported.every(Boolean))
    const expected = cells.slice(0, 3).flatMap((cell, i) =>
      allDigits.filter(digit => (possible[i] & ~supported[i]) & (1 << (digit - 1)))
        .map(digit => ({ eliminate: { cell, digit } })))
      .sort((a, b) => a.eliminate.cell - b.eliminate.cell || a.eliminate.digit - b.eliminate.digit)
    assert.deepEqual(proof.actions, expected)
    return
  }
  if (proof.evidence.type === 'group-sum-implication') {
    const { assumption, links, conflict } = proof.evidence
    const first = links[0].source, last = links.at(-1)!.source
    assert.ok(first.type === 'line' && last.type === 'line')
    assert.notEqual(first.rule, last.rule)
    assert.equal(puzzle.rules![first.rule].type, type)
    assert.ok(links.length >= 3 && links.length <= 6)
    assert.ok([1, 2].includes(links.filter(link => link.source.type === 'sum').length))
    assert.equal(new Set([assumption.cell, ...links.map(link => link.candidate.cell)]).size, links.length + 1)

    let previous = assumption
    for (const { source, candidate, domain } of links) {
      const allowed = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => domain & (1 << (digit - 1)))
      assert.ok(allowed.length > 1)
      if (source.type === 'sum') {
        assertPrintedSum(puzzle.rules![source.rule], previous.cell, candidate.cell, source.total)
        assert.deepEqual(allowed.filter(digit => digit !== previous.digit && digit + previous.digit === source.total), [candidate.digit])
      } else if (source.type === 'house') {
        const sites = variantHouseCells(source.house, puzzle)
        assert.ok(sites.includes(previous.cell) && sites.includes(candidate.cell))
        assert.ok(allowed.includes(previous.digit))
        assert.deepEqual(allowed.filter(digit => digit !== previous.digit), [candidate.digit])
      } else {
        const line = puzzle.rules![source.rule]
        assert.ok(line.type === 'modular' || line.type === 'entropic')
        const group = (digit: number) => line.type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
        const phases = [previous.cell, candidate.cell].map(cell => line.cells.indexOf(cell))
        assert.ok(phases.every(phase => phase >= 0))
        if (source.anchor) {
          const [anchor, mask] = source.anchor
          const thirdPhase = line.cells.indexOf(anchor)
          assert.ok(thirdPhase >= 0)
          assert.equal(new Set([...phases, thirdPhase].map(phase => phase % 3)).size, 3)
          const fixed = new Set(Array.from({ length: 9 }, (_, i) => i + 1)
            .filter(digit => mask & (1 << (digit - 1))).map(group))
          assert.equal(fixed.size, 1)
          assert.ok(!fixed.has(group(previous.digit)))
          assert.deepEqual(allowed.filter(digit => group(digit) !== group(previous.digit) && !fixed.has(group(digit))), [candidate.digit])
        } else {
          assert.equal(Math.abs(phases[0] - phases[1]) % 3, 0)
          assert.deepEqual(allowed.filter(digit => group(digit) === group(previous.digit)), [candidate.digit])
        }
      }
      previous = candidate
    }
    const sites = variantHouseCells(conflict, puzzle)
    assert.ok(sites.includes(assumption.cell) && sites.includes(previous.cell))
    assert.equal(previous.digit, assumption.digit)
    assert.deepEqual(proof.actions, [{ eliminate: assumption }])
    return
  }
  if (proof.evidence.type === 'group-line-sum-chain') {
    const { cells, rules, totals, house, houses, domains, supported, locked } = proof.evidence
    const [start, middle, end, partner] = cells
    const sites = house ? variantHouseCells(house, puzzle) : []
    const allSites = house ? [sites] : (houses ?? []).map(house => variantHouseCells(house, puzzle))
    assert.equal(new Set(cells).size, 4)
    assert.ok(allSites.length)
    if (house) assert.ok(cells.every(cell => sites.includes(cell)))
    const paired = (i: number, j: number) => allSites.some(sites => sites.includes(cells[i]) && sites.includes(cells[j]))
    assertGroupAndSum(puzzle, type, [rules[0], rules[1]], [start, partner, start, middle], totals[0])
    assertGroupAndSum(puzzle, type, [rules[0], rules[2]], [start, partner, middle, end], totals[1])
    const group = (digit: number) => type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
    const before = [0, 0, 0, 0]
    const after = [0, 0, 0, 0]
    let usedBefore = 511, usedAfter = 511
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) for (let d = 1; d <= 9; d++) {
      const values = [a, b, c, d]
      if (a === b || b === c || a + b !== totals[0] || b + c !== totals[1]) continue
      if (values.some((digit, i) => values.slice(0, i).some((other, j) => digit === other && paired(i, j)))) continue
      const bits = values.map(digit => 1 << (digit - 1))
      if (bits.some((bit, index) => !(domains[index] & bit))) continue
      const used = bits.reduce((mask, bit) => mask | bit, 0)
      bits.forEach((bit, index) => { before[index] |= bit })
      usedBefore &= used
      if (group(a) === group(d)) {
        bits.forEach((bit, index) => { after[index] |= bit })
        usedAfter &= used
      }
    }
    assert.ok(after.every(Boolean))
    assert.deepEqual(after, supported)
    assert.equal(locked, house ? usedAfter & ~usedBefore : 0)
    const core = cells.flatMap((cell, index) => Array.from({ length: 9 }, (_, digit) => digit + 1)
      .filter(digit => (before[index] & ~after[index]) & (1 << (digit - 1)))
      .map(digit => ({ eliminate: { cell, digit } })))
      .sort((a, b) => a.eliminate.cell - b.eliminate.cell || a.eliminate.digit - b.eliminate.digit)
    assert.deepEqual(proof.actions.filter(action => 'eliminate' in action && cells.includes(action.eliminate.cell)), core)
    for (const action of proof.actions) {
      assert.ok('eliminate' in action)
      if (cells.includes(action.eliminate.cell)) continue
      assert.ok(sites.includes(action.eliminate.cell) && locked & (1 << (action.eliminate.digit - 1)))
    }
    return
  }
  if (proof.evidence.type === 'group-line-house-triplet') {
    const { cells, domains, rule, house } = proof.evidence
    const path = puzzle.rules![rule]
    assert.ok(path.type === 'modular' || path.type === 'entropic')
    assert.equal(path.type, type)
    assert.equal(new Set(cells).size, 4)
    const phases = cells.slice(0, 3).map(cell => path.cells.indexOf(cell))
    assert.ok(phases.every(position => position >= 0))
    assert.equal(new Set(phases.map(position => position % 3)).size, 3)
    assert.ok(!path.cells.includes(cells[3]))
    const sites = variantHouseCells(house, puzzle)
    assert.ok(cells.slice(1).every(cell => sites.includes(cell)))
    const group = (digit: number) => type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
    const fits = (i: number, digit: number) => Boolean(domains[i] & (1 << (digit - 1)))
    const possible = new Set<number>()
    const supported = new Set<number>()
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
      if (new Set([group(a), group(b), group(c)]).size !== 3 || !fits(0, a) || !fits(1, b) || !fits(2, c)) continue
      possible.add(a)
      for (let d = 1; d <= 9; d++) {
        if (fits(3, d) && d !== b && d !== c) supported.add(a)
      }
    }
    assert.ok(proof.actions.length && supported.size)
    for (const action of proof.actions) {
      assert.ok('eliminate' in action)
      assert.equal(action.eliminate.cell, cells[0])
      assert.ok(possible.has(action.eliminate.digit) && !supported.has(action.eliminate.digit))
    }
    return
  }
  if (proof.evidence.type === 'group-line-disjoint-sum') {
    const { cells, domains, rules, houses, total } = proof.evidence
    assert.equal(new Set(cells).size, 4)
    assertGroupAndSum(puzzle, type, rules, cells, total)
    const sites = houses.map(house => variantHouseCells(house, puzzle))
    const sees = (i: number, j: number) => sites.some(house => house.includes(cells[i]) && house.includes(cells[j]))
    const group = (digit: number) => type === 'entropic' ? Math.floor((digit - 1) / 3) : digit % 3
    const possible = [new Set<number>(), new Set<number>()]
    const supported = [new Set<number>(), new Set<number>()]
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) for (let d = 1; d <= 9; d++) {
      if (group(a) !== group(b) || c === d || c + d !== total || a === b && sees(0, 1)) continue
      if (![a, b, c, d].every((digit, i) => domains[i] & (1 << (digit - 1)))) continue
      possible[0].add(a)
      possible[1].add(b)
      if (a === c && sees(0, 2) || a === d && sees(0, 3) || b === c && sees(1, 2) || b === d && sees(1, 3)) continue
      supported[0].add(a)
      supported[1].add(b)
    }
    assert.ok(supported[0].size)
    assert.ok(proof.actions.length)
    const target = 'eliminate' in proof.actions[0] ? proof.actions[0].eliminate.cell : -1
    const index = cells.indexOf(target)
    assert.ok(index === 0 || index === 1)
    assert.deepEqual(proof.actions, [...possible[index]].filter(digit => !supported[index].has(digit))
      .sort((a, b) => a - b).map(digit => ({ eliminate: { cell: target, digit } })))
    return
  }
  if (proof.evidence.type === 'group-line-sum-house') {
    const { cells, domains, rules, house, total } = proof.evidence
    const [target, endpoint, partner] = cells
    assert.equal(new Set(cells).size, 3)
    assertGroupAndSum(puzzle, type, rules, [target, endpoint, endpoint, partner], total)
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
