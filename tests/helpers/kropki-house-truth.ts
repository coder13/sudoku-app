import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const bit = (digit: number) => 1 << (digit - 1)

export function assertKropkiHouseProof(puzzle: VariantPuzzle, values: string, masks: readonly number[], deduction: VariantDeduction) {
  const { evidence } = deduction
  assert.equal(evidence.type, 'kropki-house')
  const { pair, house, cells, domains } = evidence
  const hasPair = (pairs: readonly (readonly [number, number])[] | undefined) =>
    Boolean(pairs?.some(edge => edge.includes(pair[0]) && edge.includes(pair[1])))
  const sources = (puzzle.rules ?? []).flatMap((rule, i) => rule.type === 'kropki' &&
    (hasPair(rule.consecutive?.pairs) || hasPair(rule.ratioTwo?.pairs)) ? [{ rule, i }] : [])
  assert.deepEqual(evidence.rules, sources.map(({ i }) => i))
  assert.ok(sources.length)
  const white = sources.some(({ rule }) => hasPair(rule.consecutive?.pairs))
  const black = sources.some(({ rule }) => hasPair(rule.ratioTwo?.pairs))
  const fitsDot = (a: number, b: number) => (!white || Math.abs(a - b) === 1) &&
    (!black || Math.max(a, b) === 2 * Math.min(a, b))
  const indices = digits.map(digit => digit - 1)
  const houseCells = 'row' in house ? indices.map(col => 9 * house.row + col)
    : 'column' in house ? indices.map(row => 9 * row + house.column)
      : 'region' in house ? puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions[house.region]
        : indices.map(i => Math.floor(house.region / 3) * 27 + house.region % 3 * 3 + Math.floor(i / 3) * 9 + i % 3)
        : 'diagonal' in house ? indices.map(i => house.diagonal === 'main' ? 10 * i : 8 * (i + 1))
          : puzzle.rules!.flatMap((rule, i) => i === house.extra && rule.type === 'extra-house' ? rule.cells : [])
  assert.deepEqual(cells, houseCells)
  assert.deepEqual(domains, cells.map(cell => values[cell] === '0' ? masks[cell] : bit(Number(values[cell]))))

  const [left, right] = pair.map(cell => cells.indexOf(cell))
  const houseOnly = Array<number>(9).fill(0)
  const joint = Array<number>(9).fill(0)
  const dotOnly = [0, 0]
  const tested = new Set<number>()
  for (const a of digits) for (const b of digits) {
    if (!(domains[left] & bit(a)) || !(domains[right] & bit(b)) || !fitsDot(a, b)) continue
    tested.add(bit(a) | bit(b))
    dotOnly[0] |= bit(a)
    dotOnly[1] |= bit(b)
  }
  const accepted = new Set<number>()
  const assignment: number[] = []
  function enumerate(slot: number, used: number) {
    if (slot === cells.length) {
      assignment.forEach((digit, i) => { houseOnly[i] |= bit(digit) })
      const a = assignment[left], b = assignment[right]
      if (fitsDot(a, b)) {
        accepted.add(bit(a) | bit(b))
        assignment.forEach((digit, i) => { joint[i] |= bit(digit) })
      }
      return
    }
    for (const digit of digits) {
      if ((domains[slot] & ~used & bit(digit)) === 0) continue
      assignment.push(digit)
      enumerate(slot + 1, used | bit(digit))
      assignment.pop()
    }
  }
  enumerate(0, 0)
  assert.ok(accepted.size)
  assert.equal(evidence.tested, tested.size)
  assert.equal(evidence.locked, [...accepted].reduce((common, mask) => common & mask, 511))
  assert.deepEqual(evidence.rejected, [...tested].filter(mask => !accepted.has(mask)).sort((a, b) => a - b))
  const expected = [...cells].sort((a, b) => a - b).flatMap(cell => {
    const i = cells.indexOf(cell)
    const only = i === left ? dotOnly[0] : i === right ? dotOnly[1] : 511
    return values[cell] === '0' ? digits.filter(digit => only & houseOnly[i] & ~joint[i] & bit(digit))
      .map(digit => ({ eliminate: { cell, digit } })) : []
  })
  assert.deepEqual(deduction.actions, expected)
}
