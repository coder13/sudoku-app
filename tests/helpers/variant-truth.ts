import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

/** Check completed digits directly from rule definitions, without engine search or candidates. */
export function assertVariantCompletion(puzzle: VariantPuzzle, completion: string) {
  assert.match(completion, /^[1-9]{81}$/)
  const digits = [...completion].map(Number)
  const distinct = (cells: readonly number[]) => new Set(cells.map(cell => digits[cell])).size === cells.length
  for (let cell = 0; cell < 81; cell++) if (puzzle.givens[cell] !== '0') assert.equal(completion[cell], puzzle.givens[cell])
  const houses = [
    ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => row * 9 + col)),
    ...Array.from({ length: 9 }, (_, col) => Array.from({ length: 9 }, (_, row) => row * 9 + col)),
    ...(puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions : Array.from({ length: 9 }, (_, box) =>
      Array.from({ length: 9 }, (_, i) => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))),
  ]
  for (const house of houses) assert.ok(distinct(house), 'Every house needs nine distinct digits')
  const adjacent = Array.from({ length: 81 }, (_, cell) => [
    ...(cell % 9 < 8 ? [[cell, cell + 1]] : []), ...(cell < 72 ? [[cell, cell + 9]] : []),
  ]).flat()
  const marked = (pairs: readonly (readonly [number, number])[] | undefined, a: number, b: number) =>
    pairs?.some(([c, d]) => c === a && d === b || c === b && d === a) ?? false
  for (const rule of puzzle.rules ?? []) {
    switch (rule.type) {
      case 'non-consecutive':
        for (const [a, b] of adjacent) if (!marked(rule.except, a, b)) assert.notEqual(Math.abs(digits[a] - digits[b]), 1)
        break
      case 'anti-king': case 'anti-knight':
        for (let a = 0; a < 81; a++) for (let b = a + 1; b < 81; b++) {
          const dr = Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), dc = Math.abs(a % 9 - b % 9)
          if (rule.type === 'anti-king' ? dr === 1 && dc === 1 : dr * dc === 2) {
            assert.notEqual(digits[a], digits[b], `${rule.type}: ${a}, ${b}`)
          }
        }
        break
      case 'diagonal':
        assert.ok(distinct(Array.from({ length: 9 }, (_, i) => rule.diagonal === 'main' ? i * 10 : 8 + i * 8)))
        break
      case 'extra-house': assert.ok(distinct(rule.cells)); break
      case 'killer-cages':
        for (const cage of rule.cages) {
          assert.ok(distinct(cage.cells))
          assert.equal(cage.cells.reduce((sum, cell) => sum + digits[cell], 0), cage.sum)
        }
        if (rule.coverGrid) assert.equal(new Set(rule.cages.flatMap(cage => cage.cells)).size, 81)
        break
      case 'whispers':
        rule.cells.slice(1).forEach((cell, i) => assert.ok(Math.abs(digits[rule.cells[i]] - digits[cell]) >= rule.minDifference))
        break
      case 'palindrome':
        rule.cells.forEach((cell, i) => assert.equal(digits[cell], digits[rule.cells[rule.cells.length - 1 - i]]))
        break
      case 'inequality': assert.ok(digits[rule.less] < digits[rule.greater]); break
      case 'thermometer':
        rule.cells.slice(1).forEach((cell, i) => assert.ok(digits[rule.cells[i]] < digits[cell]))
        break
      case 'arrow': assert.equal(rule.cells.reduce((sum, cell) => sum + digits[cell], 0), digits[rule.circle]); break
      case 'parity':
        for (const cell of rule.cells) assert.equal(digits[cell] % 2, rule.parity === 'odd' ? 1 : 0)
        break
      case 'quadruple': {
        const cells = [rule.topLeft, rule.topLeft + 1, rule.topLeft + 9, rule.topLeft + 10]
        for (let digit = 1; digit <= 9; digit++) assert.ok(
          cells.filter(cell => digits[cell] === digit).length >= rule.digits.filter(printed => printed === digit).length)
        break
      }
      case 'kropki':
        for (const [kind, marks] of [rule.consecutive, rule.ratioTwo].entries()) {
          const matches = (a: number, b: number) => kind === 0 ? Math.abs(digits[a] - digits[b]) === 1 :
            digits[a] === digits[b] * 2 || digits[b] === digits[a] * 2
          for (const [a, b] of marks?.pairs ?? []) assert.ok(matches(a, b))
          if (marks?.negative) for (const [a, b] of adjacent) if (!marked(marks.pairs, a, b)) assert.ok(!matches(a, b))
        }
        break
      default: throw new Error(`Independent completion check does not support ${rule.type}`)
    }
  }
}
