import assert from 'node:assert/strict'
import type { Candidate, VariantDeduction, VariantHouse, VariantPosition, VariantPuzzle } from '../../src/sudoku/engine.ts'

export const NC_EXCLUSION_TECHNIQUES = [
  'non-consecutive-locked-candidates-2', 'non-consecutive-locked-candidates-3',
  'non-consecutive-bivalue', 'non-consecutive-trivalue',
] as const

function houseCells(puzzle: VariantPuzzle, house: VariantHouse): number[] {
  const cells = Array.from({ length: 81 }, (_, cell) => cell)
  if ('row' in house) return cells.filter(cell => Math.floor(cell / 9) === house.row)
  if ('column' in house) return cells.filter(cell => cell % 9 === house.column)
  if ('region' in house) return puzzle.regions?.type === 'jigsaw' ? [...puzzle.regions.regions[house.region]] :
    cells.filter(cell => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3) === house.region)
  if ('diagonal' in house) {
    assert.ok(puzzle.rules?.some(rule => rule.type === 'diagonal' && rule.diagonal === house.diagonal))
    return cells.filter(cell => house.diagonal === 'main' ? Math.floor(cell / 9) === cell % 9 : Math.floor(cell / 9) + cell % 9 === 8)
  }
  const rule = puzzle.rules?.[house.extra]
  assert.equal(rule?.type, 'extra-house')
  return [...rule.cells]
}

/** Replay the full alternative set directly against declared rules and houses. */
export function assertExclusionProof(position: VariantPosition, proof: VariantDeduction) {
  assert.equal(proof.evidence.type, 'exclusion')
  const { premise, rules, houses } = proof.evidence
  assert.ok(rules.length > 0)
  const declared: VariantHouse[] = Array.from({ length: 9 }, (_, index) => [
    { row: index }, { column: index }, { region: index },
  ]).flat()
  position.puzzle.rules?.forEach((rule, index) => {
    if (rule.type === 'extra-house') declared.push({ extra: index })
    if (rule.type === 'diagonal') declared.push({ diagonal: rule.diagonal })
  })
  const allHouses = declared.map(house => houseCells(position.puzzle, house))
  const board = [...position.puzzle.givens].map((digit, cell) => Number(digit === '0' ? position.entries?.[cell] ?? '0' : digit))
  const domains = board.map((placed, cell) => placed ? [] : Array.from({ length: 9 }, (_, index) => index + 1).filter(digit =>
    !((position.eliminations?.[cell] ?? 0) & 1 << (digit - 1)) && allHouses.every(cells => {
      return !cells.includes(cell) || cells.every(other => board[other] !== digit)
    })))
  let alternatives: Candidate[]
  if (premise.type === 'cell') {
    const digits = domains[premise.cell]
    assert.equal(digits.reduce((mask, digit) => mask | 1 << (digit - 1), 0), premise.domain)
    alternatives = digits.map(digit => ({ cell: premise.cell, digit }))
    const span = Math.max(...digits) - Math.min(...digits)
    if (proof.technique === 'non-consecutive-bivalue') { assert.equal(digits.length, 2); assert.equal(span, 1) }
    else { assert.equal(proof.technique, 'non-consecutive-trivalue'); assert.ok([2, 3].includes(digits.length)); assert.equal(span, 2) }
  } else {
    const cells = houseCells(position.puzzle, premise.house)
    assert.ok(cells.every(cell => board[cell] !== premise.digit))
    assert.deepEqual([...cells.filter(cell => domains[cell].includes(premise.digit))].sort((a, b) => a - b), premise.cells)
    alternatives = premise.cells.map(cell => ({ cell, digit: premise.digit }))
  }
  assert.ok(alternatives.length >= 2)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    assert.ok('eliminate' in action)
    const target = action.eliminate
    assert.ok(domains[target.cell].includes(target.digit))
    if (premise.type === 'house') {
      const width = new Set([...premise.cells, target.cell]).size
      assert.equal(width, proof.technique === 'non-consecutive-locked-candidates-2' ? 2 : 3)
      assert.equal(Math.abs(target.digit - premise.digit), 1)
    }
    let usedRule = false
    for (const source of alternatives) {
      const sameCell = source.cell === target.cell && source.digit !== target.digit
      const sameDigit = source.digit === target.digit && source.cell !== target.cell && houses.some(house => {
        const cells = houseCells(position.puzzle, house)
        return cells.includes(source.cell) && cells.includes(target.cell)
      })
      const nonconsecutive = rules.some(index => {
        const rule = position.puzzle.rules?.[index]
        assert.equal(rule?.type, 'non-consecutive')
        const a = source.cell, b = target.cell
        const adjacent = Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs(a % 9 - b % 9) === 1
        return adjacent && Math.abs(source.digit - target.digit) === 1 &&
          !rule.except?.some(([c, d]) => c === a && d === b || c === b && d === a)
      })
      usedRule ||= nonconsecutive
      assert.ok(sameCell || sameDigit || nonconsecutive, `Unproved conflict ${JSON.stringify({ source, target })}`)
    }
    assert.ok(usedRule, 'A Non-Consecutive exclusion must use its declared binary rule')
  }
}
