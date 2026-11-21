import assert from 'node:assert/strict'
import type { VariantDeduction, VariantHouse, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { variantHouseCells } from '../../src/sudoku/variants.ts'

const indexes = Array.from({ length: 9 }, (_, index) => index)
const cells = Array.from({ length: 81 }, (_, index) => index)

export function assertMatchingDigitProof(
  puzzle: VariantPuzzle,
  values: string,
  masks: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence, actions } = deduction
  assert.equal(evidence.type, 'matching-digit')
  const { digit, assumed, initiallyPlaced, checks, conflict } = evidence
  const bit = 1 << (digit - 1)
  const groups: number[][] = []
  const houses: VariantHouse[] = indexes.flatMap(index => [{ row: index }, { column: index }, { region: index }])
  for (const [index, rule] of (puzzle.rules ?? []).entries()) {
    if (rule.type === 'clone') groups.push(...rule.groups)
    if (rule.type === 'palindrome') {
      for (let i = 0; i < Math.floor(rule.cells.length / 2); i++) groups.push([rule.cells[i], rule.cells[rule.cells.length - 1 - i]])
    }
    if (rule.type === 'extra-house') houses.push({ extra: index })
    if (rule.type === 'diagonal') houses.push({ diagonal: rule.diagonal })
  }
  function matching(cell: number) {
    const seen = new Set([cell])
    for (;;) {
      const size = seen.size
      for (const group of groups) if (group.some(member => seen.has(member))) {
        for (const member of group) seen.add(member)
      }
      if (seen.size === size) return [...seen].sort((left, right) => left - right)
    }
  }
  const matches = cells.map(matching)
  const eligible = (cell: number) => matches[cell].every(member =>
    values[member] === String(digit) || (values[member] === '0' && (masks[member] & bit) !== 0))
  const occupants = new Set(cells.filter(cell => values[cell] === String(digit)).flatMap(cell => matches[cell]))
  const houseCells = houses.map(house => variantHouseCells(house, puzzle))

  function place(group: number[]) {
    assert.ok(group.every(cell => eligible(cell) && !occupants.has(cell)))
    for (const cell of group) occupants.add(cell)
    for (const house of houseCells) assert.ok(house.filter(cell => occupants.has(cell)).length <= 1)
  }

  assert.deepEqual([...occupants].sort((left, right) => left - right), initiallyPlaced)
  assert.deepEqual(assumed, matches[assumed[0]])
  assert.deepEqual(actions, assumed.map(cell => ({ eliminate: { cell, digit } })))
  place(assumed)

  for (const check of [...checks, conflict]) {
    const required = variantHouseCells(check.house, puzzle)
    assert.ok(required.every(cell => !occupants.has(cell)))
    const possible = required.filter(eligible)
    const blocked = possible.filter(cell => matches[cell].some(member =>
      houseCells.some(house => house.includes(member) && house.some(placed => occupants.has(placed)))))
    assert.deepEqual(check.blocked.map(block => block.cell).sort((left, right) => left - right),
      blocked.sort((left, right) => left - right))
    for (const block of check.blocked) {
      const shared = variantHouseCells(block.house, puzzle)
      assert.ok(matches[block.cell].includes(block.matched))
      assert.ok(occupants.has(block.placed))
      assert.ok(shared.includes(block.matched) && shared.includes(block.placed))
    }
    const remaining = possible.filter(cell => !blocked.includes(cell))
    if (check === conflict) {
      assert.deepEqual(remaining, [])
      assert.deepEqual(check.forced, [])
    } else {
      assert.equal(remaining.length, 1)
      assert.deepEqual(check.forced, matches[remaining[0]])
      place(check.forced)
    }
  }
}
