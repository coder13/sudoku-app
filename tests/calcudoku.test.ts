import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import { createCalcudoku, type Cage, type CalcudokuPuzzle } from '../src/calcudoku/engine.ts'
import { bit, checkLatin, findLatinHint, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { subsetTechnique } from '../src/latin/line-subsets.ts'

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

test('all Calcudoku catalog puzzles have an independent unique count and complete logical hints', () => {
  for (const { id, puzzle } of calcudokuCatalog) {
    assert.equal(countByCells(puzzle), 1, id)
    const exact = solveLatin(puzzle)
    assert.equal(exact.status, 'unique', id)
    assert.equal(exact.nodes, 1, id)
    assert.ok(exact.solution)
    const values = puzzle.givens.slice()
    const placements = findLatinHints(puzzle, values)
    assert.deepEqual(placements[0], findLatinHint(puzzle, values), id)
    assert.equal(new Set(placements.map(hint => hint.cell)).size, placements.length, id)
    for (const hint of placements) {
      assert.equal(values[hint.cell], 0, id)
      assert.equal(hint.value, exact.solution[hint.cell], id)
    }
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

test('cages with the same sum keep the row and column restrictions for their cell order', () => {
  function sumCage(cells: number[]) {
    const otherCages: Cage[] = Array.from({ length: 9 }, (_, cell) => cell)
      .filter(cell => !cells.includes(cell))
      .map(cell => ({ cells: [cell], operator: 'equal', target: 3 }))
    return createCalcudoku(3, [{ cells, operator: 'add', target: 4 }, ...otherCages]).rules[0]
  }

  const domains = Array(9).fill(7)
  assert.deepEqual(sumCage([0, 1, 3]).support(domains), [2, 1, 1])
  assert.throws(() => sumCage([0, 1, 2]), /no valid arithmetic/)
  assert.deepEqual(sumCage([4, 7, 5]).support(domains), [2, 1, 1])
  assert.deepEqual(sumCage([1, 0, 3]).support(domains), [1, 2, 1])
})

test('large cage support matches direct enumeration with narrow domains in each cell', () => {
  const size = 9
  const cells = [0, 1, 2, 10, 11]
  const cage = { cells, operator: 'add', target: 25 } as const
  const otherCages: Cage[] = Array.from({ length: size * size }, (_, cell) => cell)
    .filter(cell => !cells.includes(cell))
    .map(cell => ({ cells: [cell], operator: 'equal', target: 1 }))
  const rule = createCalcudoku(size, [cage, ...otherCages]).rules[0]
  const all = (1 << size) - 1
  const combinations: number[][] = []
  function collect(digits: number[]) {
    if (digits.length === cells.length) {
      if (digits.reduce((sum, digit) => sum + digit, 0) === cage.target) combinations.push(digits.map(bit))
      return
    }
    const cell = cells[digits.length]
    for (let digit = 1; digit <= size; digit++) {
      if (digits.some((other, offset) => other === digit &&
        (cells[offset] % size === cell % size || Math.floor(cells[offset] / size) === Math.floor(cell / size)))) continue
      collect([...digits, digit])
    }
  }
  collect([])
  assert.ok(combinations.length > 128)

  const domains = Array<number>(size * size).fill(all)
  for (const cell of cells) {
    for (let digit = 0; digit <= size; digit++) {
      domains[cell] = bit(digit)
      const valid = combinations.filter(tuple => cells.every((index, offset) => domains[index] & tuple[offset]))
      const support = cells.map((_, offset) => valid.reduce((mask, tuple) => mask | tuple[offset], 0))
      assert.deepEqual(rule.support(domains), valid.length ? support : null)
    }
    domains[cell] = all
  }
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

test('the grid total rejects inconsistent crossing cages within one search node', () => {
  const size = 8
  const cages: Cage[] = []
  for (let row = 0; row < size; row += 2) {
    for (let column = 0; column < size; column += 2) {
      const first = row * size + column
      const cells = [first, first + 1, first + size, first + size + 1]
      const target = cells.reduce((sum, cell) => sum + (Math.floor(cell / size) + cell % size) % size + 1, 0)
      cages.push({ operator: 'add', cells, target })
    }
  }
  assert.equal(solveLatin(createCalcudoku(size, cages)).status, 'multiple')
  cages[size] = { ...cages[size], target: cages[size].target + 1 }
  const puzzle = createCalcudoku(size, cages)
  assert.deepEqual(checkLatin(puzzle, []).conflicts.map(rule => rule.label), [
    'The grid must total 288. Its cages add up to 289.',
  ])
  assert.deepEqual(solveLatin(puzzle, [], 1), { status: 'unsolvable', solution: null, nodes: 1 })
})

test('a valid grid total cannot hide contradictory row totals', () => {
  const cages: Cage[] = [5, 4, 5, 6, 5, 5, 5, 5].map((target, index) => ({
    cells: [2 * index, 2 * index + 1], operator: 'add', target,
  }))
  const puzzle = createCalcudoku(4, cages)
  const conflicts = checkLatin(puzzle, []).conflicts
  assert.deepEqual(conflicts.map(rule => rule.label), [
    'Row 1 must total 10. Its cages add up to 9.',
    'Row 2 must total 10. Its cages add up to 11.',
  ])
  assert.deepEqual(conflicts[0].cells, [0, 1, 2, 3])
  assert.deepEqual(solveLatin(puzzle, [], 1), { status: 'unsolvable', solution: null, nodes: 1 })
})

test('exact search rechecks crossing rules after a branch and keeps cached cage results local', () => {
  const rows = [0, 1, 2].map(row => ({ cells: [row * 3, row * 3 + 1, row * 3 + 2], operator: 'add' as const, target: 6 }))
  const puzzle = createCalcudoku(3, rows)
  assert.equal(solveLatin(puzzle, [], 1).status, 'search-limit')
  const ambiguous = solveLatin(puzzle)
  assert.equal(ambiguous.status, 'multiple')
  assert.ok(ambiguous.solution)
  assert.ok(checkLatin(puzzle, ambiguous.solution).complete)
  assert.equal(solveLatin(puzzle, [2, 2]).status, 'unsolvable')
  assert.deepEqual(solveLatin(puzzle), ambiguous)
})

test('a known row total unlocks the first placement in Hard 4', () => {
  const { puzzle } = calcudokuCatalog.find(entry => entry.id === 'hard-4')!
  const basic = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'line-total' && !rule.afterBasic) }
  assert.equal(findLatinHint(basic, []), null)
  const hint = findLatinHint(puzzle, [])
  assert.equal(hint?.cell, 4)
  assert.equal(hint.value, 1)
  assert.equal(hint.rules[0].kind, 'line-total')
  assert.match(hint.rules[0].label, /Row 1 totals 15/)
  assert.match(hint.rules[0].label, /R1C3, R1C4, R1C5 must add up to 10/)
})

test('Hard 5 and Hard 6 use a naked pair and a naked triple after cage arithmetic stalls', () => {
  const cases = [
    { id: 'hard-5', kind: 'naked-pair', cells: [21, 22], digits: 'Only 1 and 5', cell: 14, value: 5 },
    { id: 'hard-6', kind: 'naked-triple', cells: [0, 5, 10], digits: 'Only 2, 3, and 5', cell: 1, value: 2 },
  ]
  for (const { id, kind, cells, digits, cell, value } of cases) {
    const { puzzle } = calcudokuCatalog.find(entry => entry.id === id)!
    const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => kind === 'naked-pair' ? !rule.afterBasic : rule.kind !== kind && rule.kind !== 'cage-line') }
    const entries = puzzle.givens.slice()
    for (const hint of findLatinHints(simpler, [])) entries[hint.cell] = hint.value
    assert.equal(findLatinHint(simpler, entries), null, id)
    assert.equal(solveLatin(simpler, entries, 1).status, 'search-limit', id)
    const hint = findLatinHint(puzzle, entries)
    assert.ok(hint, id)
    assert.equal(hint.cell, cell, id)
    assert.equal(hint.value, value, id)
    assert.equal(subsetTechnique(hint), kind === 'naked-pair' ? 'Naked pair' : 'Naked triple', id)
    const proof = hint.rules.find(rule => rule.kind === kind)
    assert.deepEqual(proof?.cells, cells, id)
    assert.ok(proof.label.startsWith(digits), id)
  }
})


test('a cage locks a digit in one line to start Hard 7', () => {
  const { puzzle } = calcudokuCatalog.find(entry => entry.id === 'hard-7')!
  const transpose = (cell: number) => cell % puzzle.size * puzzle.size + Math.floor(cell / puzzle.size)
  const transposed = createCalcudoku(puzzle.size, puzzle.cages.map(cage => ({
    ...cage, cells: cage.cells.map(transpose),
  })))
  for (const [grid, target, cage, line] of [
    [puzzle, 1, 'R1C3', 'row 1'],
    [transposed, transpose(1), 'R3C1', 'column 1'],
  ] as const) {
    const simpler = { ...grid, rules: grid.rules.filter(rule => rule.kind !== 'cage-line') }
    assert.equal(findLatinHint(simpler, []), null)
    assert.equal(solveLatin(simpler, [], 1).status, 'search-limit')
    const hint = findLatinHint(grid, [])
    assert.equal(hint?.cell, target)
    assert.equal(hint.value, 2)
    const proof = hint.rules.find(rule => rule.kind === 'cage-line')
    assert.equal(proof?.label,
      `Every valid combination for the 60× cage at ${cage} places 1 in ${line}. Remove 1 from the rest of ${line}.`)
    const walkthrough = findLatinSolutionHints(grid, [])
    assert.deepEqual(walkthrough[0], hint)
    assert.equal(walkthrough.length, grid.givens.filter(digit => !digit).length)
    assert.equal(countByCells(grid), 1)
  }
})

test('Hard 8 needs an X-wing after cage and line deductions stall', () => {
  const { puzzle } = calcudokuCatalog.find(entry => entry.id === 'hard-8')!
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'x-wing') }
  const values = puzzle.givens.slice()
  for (const { cell, value } of findLatinHints(simpler, [])) values[cell] = value

  assert.equal(findLatinHint(simpler, values), null)
  assert.equal(solveLatin(simpler, [], 1).status, 'search-limit')
  assert.equal(solveLatin(puzzle, [], 1).status, 'unique')

  const hint = findLatinHint(puzzle, values)
  assert.ok(hint)
  assert.equal(hint.cell, 1)
  assert.equal(hint.value, 4)
  const proof = hint.rules.find(rule => rule.kind === 'x-wing')
  assert.ok(proof)
  assert.deepEqual(proof.cells, [11, 13, 16, 18])
  assert.match(proof.label, /In rows 3 and 4, 2 can only go in columns 2 and 4\./)
  const walkthrough = findLatinSolutionHints(puzzle, [])
  assert.equal(walkthrough.length, puzzle.givens.filter(digit => !digit).length)
  assert.ok(walkthrough.some(step => step.rules.some(rule => rule.kind === 'x-wing')))
})
