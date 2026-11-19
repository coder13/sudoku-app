import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import { createCalcudoku, type Cage, type CalcudokuPuzzle } from '../src/calcudoku/engine.ts'
import { checkLatin, findLatinHint, solveLatin } from '../src/latin/engine.ts'

function matchesCage(cage: Cage, values: readonly number[]) {
  const digits = cage.cells.map(cell => values[cell])
  if (digits.includes(0)) return true
  const [a, b] = digits
  const observed = {
    equal: a,
    add: digits.reduce((sum, digit) => sum + digit, 0),
    multiply: digits.reduce((product, digit) => product * digit, 1),
    subtract: Math.abs(a - b),
    divide: Math.max(a, b) / Math.min(a, b),
  }[cage.operator]
  return observed === cage.target
}

// This search enumerates rows and columns directly. It checks arithmetic
// only when a cage is full and never uses the app's digit masks or hints.
function countByCells(puzzle: CalcudokuPuzzle) {
  const { size, givens, cages } = puzzle
  const values = givens.slice()
  const cageByCell = values.map((_, cell) => cages.find(cage => cage.cells.includes(cell))!)
  function visit(): number {
    const index = values.indexOf(0)
    if (index === -1) return 1
    const row = index - index % size
    const column = index % size
    let count = 0
    for (let digit = 1; digit <= size && count < 2; digit++) {
      if (values.slice(row, row + size).includes(digit) ||
        values.some((value, i) => value === digit && i % size === column)) continue
      values[index] = digit
      if (matchesCage(cageByCell[index], values)) count += visit()
      values[index] = 0
    }
    return count
  }
  return visit()
}

test('all original Calcudoku boards have an independent unique count and complete logical hints', () => {
  for (const { id, puzzle } of calcudokuCatalog) {
    assert.equal(countByCells(puzzle), 1, id)
    const exact = solveLatin(puzzle)
    assert.equal(exact.status, 'unique', id)
    assert.equal(exact.nodes, 1, id)
    assert.ok(exact.solution)
    const values = puzzle.givens.slice()
    for (let count = values.filter(value => !value).length; count > 0; count--) {
      const hint = findLatinHint(puzzle, values)
      assert.ok(hint, id)
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, exact.solution[hint.cell], id)
      assert.ok(hint.rules.some(rule => rule.cells.includes(hint.cell)), id)
      values[hint.cell] = hint.value
    }
    assert.ok(checkLatin(puzzle, values).complete, id)
    assert.ok(puzzle.cages.every(cage => matchesCage(cage, values)), id)
  }
})

test('connected cages permit equal values across different rows and columns', () => {
  const { puzzle } = calcudokuCatalog[0]
  const exact = solveLatin(puzzle).solution!
  const cage = puzzle.cages.find(cage => cage.cells.length === 4)!
  assert.ok(new Set(cage.cells.map(cell => exact[cell])).size < cage.cells.length)
  const rowDuplicate = exact.slice()
  rowDuplicate[0] = rowDuplicate[1]
  assert.ok(checkLatin(puzzle, rowDuplicate).conflicts.some(rule => rule.label === 'Row 1'))
})

test('division and subtraction accept either operand order and reject non-integer quotients', () => {
  const { puzzle: easy } = calcudokuCatalog[0]
  const divider = easy.rules.find(rule => rule.label.startsWith('2÷'))!
  const domains = Array(9).fill(7)
  domains[3] = 2
  domains[4] = 1
  assert.deepEqual(divider.support(domains), [2, 1])
  domains[3] = 1
  domains[4] = 2
  assert.deepEqual(divider.support(domains), [1, 2])
  domains[3] = 4
  assert.equal(divider.support(domains), null)

  const { puzzle: medium } = calcudokuCatalog.find(entry => entry.id === 'medium-1')!
  const subtract = medium.rules.find(rule => rule.label.startsWith('1−'))!
  const masks = Array(16).fill(15)
  masks[3] = 4
  masks[7] = 2
  assert.deepEqual(subtract.support(masks), [4, 2])
  masks[3] = 2
  masks[7] = 4
  assert.deepEqual(subtract.support(masks), [2, 4])
})

test('invalid cage definitions fail before play and exact search enforces its budget', () => {
  const { puzzle } = calcudokuCatalog[0]
  assert.throws(() => createCalcudoku(3, puzzle.cages.slice(1)), /exactly one cage/)
  const [first, ...rest] = puzzle.cages
  assert.throws(() => createCalcudoku(3, [{ ...first, target: 1 }, ...rest]), /no valid arithmetic/)
  assert.equal(solveLatin(puzzle, [], 0).status, 'search-limit')
})
