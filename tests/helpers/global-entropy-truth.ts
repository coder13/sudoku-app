import assert from 'node:assert/strict'
import type { Candidate, VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Enumerate actual digits under only the four-cell group rule in this proof. */
export function assertGlobalEntropyProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assert.equal(proof.technique, 'global-entropy')
  assert.equal(proof.evidence.type, 'constraint')
  const { cells, domains, rules } = proof.evidence
  assert.equal(rules.length, 1)
  assert.equal(puzzle.rules![rules[0]].type, 'global-entropy')
  assert.equal(cells.length, 4)
  const first = cells[0]
  assert.ok(first >= 0 && first < 72 && first % 9 < 8)
  assert.deepEqual(cells, [first, first + 1, first + 9, first + 10])
  const supported = [0, 0, 0, 0]
  const assignment: number[] = []
  let count = 0
  function visit(index: number) {
    if (index === 4) {
      if (!assignment.some(digit => digit <= 3) || !assignment.some(digit => digit >= 4 && digit <= 6)
        || !assignment.some(digit => digit >= 7)) return
      assignment.forEach((digit, i) => { supported[i] |= 1 << (digit - 1) })
      count++
      return
    }
    for (let digit = 1; digit <= 9; digit++) if (domains[index] & (1 << (digit - 1))) {
      assignment[index] = digit
      visit(index + 1)
      assignment.length = index
    }
  }
  visit(0)
  assert.ok(count > 0, 'The proof premises must allow a group assignment')
  const expected = domains.flatMap((mask, i) => Array.from({ length: 9 }, (_, n) => n + 1)
    .filter(digit => mask & (1 << (digit - 1)) && !(supported[i] & (1 << (digit - 1))))
    .map(digit => ({ eliminate: { cell: cells[i], digit } })))
  assert.deepEqual(proof.actions, expected)
}

const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
const group = (digit: number) => Math.floor((digit - 1) / 3)
const bit = (digit: number) => 1 << (digit - 1)
const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const box = (cell: number) => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
const shareHouse = (a: number, b: number) =>
  Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 || box(a) === box(b)

/** Propagate the three published clue families using group permutations and explicit four-digit lists. */
export function entropyTrialDomains(
  puzzle: VariantPuzzle, board: string, eliminations: readonly number[], assumption: Candidate,
): number[] {
  assert.equal(board[assumption.cell], '0')
  assert.ok(!puzzle.regions || puzzle.regions.type === 'boxes')
  const values = [...board].map(Number)
  values[assumption.cell] = assumption.digit
  const rules = puzzle.rules ?? []
  const lines = rules.filter(rule => rule.type === 'entropic')
  const circles = rules.filter(rule => rule.type === 'quadruple')
  assert.equal(rules.length, 1 + lines.length + circles.length)
  assert.ok(rules.some(rule => rule.type === 'global-entropy'))
  const masks = values.map((value, cell) => {
    if (value !== 0) return bit(value)
    return values.reduce((mask, other, peer) => !other || !shareHouse(cell, peer) ? mask : mask & ~bit(other),
      511 & ~eliminations[cell])
  })
  const cellsAt = (top: number) => [top, top + 1, top + 9, top + 10]
  const areas = Array.from({ length: 64 }, (_, i) => cellsAt(Math.floor(i / 8) * 9 + i % 8))

  function constrain(cells: readonly number[], supported: readonly number[]) {
    for (const [i, cell] of cells.entries()) if (!values[cell]) masks[cell] &= supported[i]
  }

  function supportArea(cells: readonly number[], printed?: readonly number[]) {
    const assignments: number[] = []
    const supports = [0, 0, 0, 0]
    function visit(i: number) {
      if (i === 4) {
        if (!printed && new Set(assignments.map(group)).size !== 3) return
        if (printed?.some(digit =>
          assignments.filter(d => d === digit).length < printed.filter(d => d === digit).length)) return
        assignments.forEach((digit, slot) => { supports[slot] |= bit(digit) })
        return
      }
      for (const digit of digits) {
        if (!(masks[cells[i]] & bit(digit))) continue
        if (printed && assignments.some((other, slot) => digit === other && shareHouse(cells[slot], cells[i]))) continue
        assignments.push(digit)
        visit(i + 1)
        assignments.pop()
      }
    }
    visit(0)
    return supports
  }

  for (;;) {
    const before = [...masks]
    for (const { cells } of lines) {
      const supports = cells.map(() => 0)
      for (const order of orders) {
        const domains = cells.map((cell, slot) => masks[cell] & (7 << 3 * order[slot % 3]))
        if (!domains.includes(0)) domains.forEach((mask, slot) => { supports[slot] |= mask })
      }
      constrain(cells, supports)
    }
    for (const circle of circles) {
      const cells = cellsAt(circle.topLeft)
      constrain(cells, supportArea(cells, circle.digits))
    }
    for (const cells of areas) constrain(cells, supportArea(cells))
    if (before.every((mask, cell) => masks[cell] === mask)) return masks
  }
}
