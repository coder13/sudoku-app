import assert from 'node:assert/strict'
import type { VariantDeduction, VariantHouse, VariantPuzzle } from '../../src/sudoku/engine.ts'

type EntropyEvidence = Extract<VariantDeduction['evidence'], { type: 'entropy-areas' }>
const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const digitBit = (digit: number) => 1 << (digit - 1)
const grid = Array.from({ length: 81 }, (_, cell) => cell)

function houseCells(puzzle: VariantPuzzle, house: VariantHouse) {
  if ('row' in house) return grid.filter(cell => Math.floor(cell / 9) === house.row)
  if ('column' in house) return grid.filter(cell => cell % 9 === house.column)
  assert.ok('region' in house)
  if (puzzle.regions?.type === 'jigsaw') return puzzle.regions.regions[house.region]
  return grid.filter(cell => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3) === house.region)
}

function directSupport(evidence: EntropyEvidence, windows: readonly (readonly number[])[],
  circles: { indices: number[]; printed: readonly number[] }[], houses: readonly (readonly number[])[]) {
  const { cells, domains } = evidence
  const assignment: number[] = []
  const supported = cells.map(() => 0)
  const positions = houses.map(house => cells.flatMap((cell, i) => house.includes(cell) ? [i] : []))
  const areas = windows.map(window => window.map(cell => cells.indexOf(cell)))
  function visit(i: number) {
    if (i === cells.length) {
      for (const area of areas) {
        const required = new Set(area.map(index => Math.floor((assignment[index] - 1) / 3)))
        if (required.size !== 3) return
      }
      for (const { indices, printed } of circles) {
        const unused = indices.map(index => assignment[index])
        for (const digit of printed) {
          const index = unused.indexOf(digit)
          if (index === -1) return
          unused.splice(index, 1)
        }
      }
      assignment.forEach((digit, index) => { supported[index] |= digitBit(digit) })
      return
    }
    for (const digit of digits) {
      if (!(domains[i] & digitBit(digit))) continue
      if (positions.some(house => house.includes(i) && house.some(index => index < i && assignment[index] === digit))) continue
      assignment[i] = digit
      visit(i + 1)
    }
  }
  visit(0)
  return supported
}

/** Enumerate actual digit tuples with the printed rules and named houses. */
export function assertEntropyAreaProof(puzzle: VariantPuzzle, proof: VariantDeduction, independentlyNecessary = false) {
  assert.ok(proof.technique === 'entropy-quadruple' || proof.technique === 'global-entropy')
  const includesCircles = proof.technique === 'entropy-quadruple'
  assert.equal(proof.evidence.type, 'entropy-areas')
  const evidence = proof.evidence
  const { cells, domains, rules, windows } = evidence
  assert.equal(puzzle.rules![rules[0]].type, 'global-entropy')
  assert.ok(windows.length === 1 || windows.length === 2)
  for (const [top, ...rest] of windows) {
    assert.ok(top >= 0 && top < 72 && top % 9 < 8)
    assert.deepEqual(rest, [top + 1, top + 9, top + 10])
  }
  if (windows.length === 2) {
    const shared = windows[0].filter(cell => windows[1].includes(cell))
    assert.ok(shared.length === 1 || shared.length === 2)
  }
  assert.deepEqual(cells, [...new Set(windows.flat())].sort((a, b) => a - b))
  const houses = evidence.houses.map(house => houseCells(puzzle, house))
  for (const house of houses) assert.ok(cells.filter(cell => house.includes(cell)).length >= 2)
  const circleRules = includesCircles ? puzzle.rules!.flatMap((rule, index) =>
    rule.type === 'quadruple' && windows.some(window => window[0] === rule.topLeft) ? [{ rule, index }] : []) : []
  if (includesCircles) assert.ok(circleRules.length)
  else assert.equal(windows.length, 2)
  assert.deepEqual(rules.slice(1).sort((a, b) => a - b), circleRules.map(({ index }) => index))
  const circles = circleRules.map(({ rule }) => ({
    indices: windows.find(window => window[0] === rule.topLeft)!.map(cell => cells.indexOf(cell)),
    printed: rule.digits,
  }))
  const supported = directSupport(evidence, windows, circles, houses)
  assert.ok(supported.every(Boolean), 'The premises must admit at least one assignment')
  assert.deepEqual(evidence.supported, supported)
  const separate = [...domains]
  for (const window of windows) {
    const support = directSupport(evidence, [window], [], [])
    for (const cell of window) separate[cells.indexOf(cell)] &= support[cells.indexOf(cell)]
  }
  for (const circle of circles) {
    const localCells = circle.indices.map(index => cells[index])
    const support = directSupport(evidence, [], [circle], houses.map(house => house.filter(cell => localCells.includes(cell))))
    for (const index of circle.indices) separate[index] &= support[index]
  }
  const expected = separate.flatMap((mask, i) => digits
    .filter(digit => mask & digitBit(digit) && !(supported[i] & digitBit(digit)))
    .map(digit => ({ eliminate: { cell: cells[i], digit } })))
  assert.ok(expected.length)
  assert.deepEqual(proof.actions, expected)
  if (independentlyNecessary) {
    const withoutCircle = directSupport(evidence, windows, [], houses)
    const withoutWindow = windows.map((_, i) => directSupport(evidence, windows.filter((_, index) => index !== i), circles, houses))
    const target = (masks: number[]) => expected.some(({ eliminate }) => masks[cells.indexOf(eliminate.cell)] & digitBit(eliminate.digit))
    assert.ok(target(withoutCircle))
    assert.ok(withoutWindow.every(target))
  }
}
