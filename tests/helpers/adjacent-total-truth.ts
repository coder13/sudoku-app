import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { variantHouseCells } from '../../src/sudoku/variants.ts'

/** Replay a local sum from digit pairs rather than the engine's support tables. */
export function assertAdjacentTotalProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'adjacent-total')
  if (proof.evidence.type === 'sum-pair') {
    assertSumPairProof(puzzle, proof)
    return
  }
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules: indices } = proof.evidence
  assert.equal(cells.length, 2); assert.equal(domains.length, 2); assert.ok(indices.length > 0)
  const [a, b] = cells
  assert.equal(Math.abs(a % 9 - b % 9) + Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), 1)
  const totals = indices.map(index => {
    const rule = puzzle.rules![index]
    assert.equal(rule.type, 'adjacent-total')
    if (rule.type !== 'adjacent-total') throw new Error('Expected a declared total')
    assert.deepEqual(new Set(rule.cells), new Set(cells))
    return rule.sum
  })
  const pairs: [number, number][] = []
  for (let left = 1; left <= 9; left++) for (let right = 1; right <= 9; right++) {
    if (left !== right && domains[0] & 1 << (left - 1) && domains[1] & 1 << (right - 1) && totals.every(sum => left + right === sum)) pairs.push([left, right])
  }
  assert.ok(pairs.length > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = cells.indexOf(candidate.cell)
    assert.ok(index >= 0); assert.ok(domains[index] & 1 << (candidate.digit - 1))
    const permitted = new Set(pairs.map(pair => pair[index]))
    if ('place' in action) assert.deepEqual([...permitted], [candidate.digit])
    else assert.equal(permitted.has(candidate.digit), false)
  }
}


export function assertSumPairProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.evidence.type, 'sum-pair')
  const { cells, domains, totals, rules, house, houses } = proof.evidence
  const [a, b, c, d] = cells
  assert.equal(new Set(cells).size, 4)
  const sources = rules.map(index => puzzle.rules![index])
  assert.equal(proof.technique, sources.every(source => source.type === 'xv') ? 'xv' : 'adjacent-total')
  for (const [i, [first, second]] of [[a, b], [c, d]].entries()) {
    const samePair = ([left, right]: readonly number[]) =>
      first === left && second === right || first === right && second === left
    const rule = sources[i]
    const mark = rule.type === 'xv' && (totals[i] === 5 ? rule.five : totals[i] === 10 ? rule.ten : undefined)
    assert.ok(rule.type === 'adjacent-total' && rule.sum === totals[i] && samePair(rule.cells) ||
      mark && mark.pairs?.some(samePair))
  }
  const anchors = variantHouseCells(house, puzzle)
  assert.ok(anchors.includes(a) && anchors.includes(c))
  const sites = houses.map((house) => variantHouseCells(house, puzzle))
  const sees = (from: number, to: number) => sites.some(house => house.includes(from) && house.includes(to))
  const possibilities: number[][] = []
  for (let x = 1; x <= 9; x++) for (let y = 1; y <= 9; y++) for (let z = 1; z <= 9; z++) for (let t = 1; t <= 9; t++) {
    const values = [x, y, z, t]
    if (x === y || z === t || x + y !== totals[0] || z + t !== totals[1]) continue
    if (values.every((digit, i) => domains[i] & (1 << (digit - 1)))) possibilities.push(values)
  }
  const supported = possibilities.filter(([x, , z]) => x !== z)
  assert.ok(supported.length && proof.actions.length)
  for (const action of proof.actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    assert.ok(!cells.includes(cell) && sees(cell, b) && sees(cell, d))
    assert.ok(possibilities.some(([, y, , t]) => y !== digit && t !== digit))
    assert.ok(supported.every(([, y, , t]) => y === digit || t === digit))
  }
}
