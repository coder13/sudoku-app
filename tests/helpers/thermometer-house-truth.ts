import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const bit = (digit: number) => 1 << (digit - 1)

function eachAssignment(domains: readonly number[], increasing: boolean, accept: (digits: number[]) => void) {
  const chosen: number[] = []
  function visit(index: number) {
    if (index === domains.length) {
      accept(chosen)
      return
    }
    for (const digit of digits) {
      if (!(domains[index] & bit(digit))) continue
      if (increasing ? digit <= (chosen.at(-1) ?? 0) : chosen.includes(digit)) continue
      chosen.push(digit)
      visit(index + 1)
      chosen.pop()
    }
  }
  visit(0)
}

export function assertThermometerHouseProof(
  puzzle: VariantPuzzle,
  values: string,
  masks: readonly number[],
  deduction: VariantDeduction,
) {
  const { evidence } = deduction
  assert.equal(evidence.type, 'thermometer-house')
  const line = puzzle.rules?.[evidence.rule]
  assert.ok(line && line.type === 'thermometer')
  assert.deepEqual(evidence.lineCells, line.cells)
  const { house } = evidence
  const indices = Array.from({ length: 9 }, (_, i) => i)
  const houseCells = 'row' in house ? indices.map(col => house.row * 9 + col)
    : 'column' in house ? indices.map(row => row * 9 + house.column)
      : 'region' in house ? puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions[house.region]
        : indices.map(i => Math.floor(house.region / 3) * 27 + house.region % 3 * 3 + Math.floor(i / 3) * 9 + i % 3)
        : 'diagonal' in house ? indices.map(i => house.diagonal === 'main' ? 10 * i : 8 * (i + 1))
          : puzzle.rules!.flatMap((rule, i) => rule.type === 'extra-house' && i === house.extra ? rule.cells : [])
  assert.deepEqual(evidence.cells, houseCells)
  const domain = (cell: number) => values[cell] === '0' ? masks[cell] : bit(Number(values[cell]))
  assert.deepEqual(evidence.domains, houseCells.map(domain))
  assert.deepEqual(evidence.lineDomains, line.cells.map(domain))

  const lineInHouse = houseCells.map(cell => line.cells.indexOf(cell))
  assert.ok(lineInHouse.filter(i => i >= 0).length >= 2)
  const lineOnly = new Array<number>(81).fill(0)
  const houseOnly = new Array<number>(81).fill(0)
  const joint = new Array<number>(81).fill(0)
  const tested = new Map<number, boolean>()
  eachAssignment(evidence.domains, false, completed => {
    completed.forEach((digit, i) => { houseOnly[houseCells[i]] |= bit(digit) })
  })
  eachAssignment(evidence.lineDomains, true, placement => {
    placement.forEach((digit, i) => { lineOnly[line.cells[i]] |= bit(digit) })
    const houseDomains = lineInHouse.map((i, slot) => i < 0 ? evidence.domains[slot] : bit(placement[i]))
    const pinned = lineInHouse.reduce((mask, i) => i < 0 ? mask : mask | bit(placement[i]), 0)
    let complete = false
    eachAssignment(houseDomains, false, finished => {
      complete = true
      finished.forEach((digit, i) => { joint[houseCells[i]] |= bit(digit) })
    })
    if (complete) placement.forEach((digit, i) => { joint[line.cells[i]] |= bit(digit) })
    tested.set(pinned, complete)
  })
  assert.ok([...tested.values()].some(Boolean))
  assert.equal(evidence.tested, tested.size)
  assert.deepEqual(evidence.rejected, [...tested].flatMap(([digits, fit]) => fit ? [] : [digits]).sort((a, b) => a - b))
  const cells = [...new Set([...line.cells, ...houseCells])].sort((a, b) => a - b)
  const removals = cells.flatMap(cell => {
    if (values[cell] !== '0') return []
    const orthogonal = houseCells.includes(cell) ? houseOnly[cell] : domain(cell)
    const increasing = line.cells.includes(cell) ? lineOnly[cell] : domain(cell)
    return digits.filter(digit => orthogonal & increasing & ~joint[cell] & bit(digit))
      .map(digit => ({ eliminate: { cell, digit } }))
  })
  assert.deepEqual(deduction.actions, removals)
}
