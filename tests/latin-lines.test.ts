import assert from 'node:assert/strict'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { createFutoshiki } from '../src/futoshiki/engine.ts'
import { checkLatin } from '../src/latin/engine.ts'
import { readCoachStandaloneDiagonals } from '../src/sudoku/coach-standalone-diagonals.ts'
import { readCoachStandaloneExclusions } from '../src/sudoku/coach-standalone-exclusions.ts'
import { readCoachStandaloneExtrema } from '../src/sudoku/coach-standalone-extrema.ts'
import { readCoachStandaloneLine } from '../src/sudoku/coach-standalone-lines.ts'

test('Sudoku Coach standalone Thermometers preserve bulb-to-tip order and shared cells', () => {
  const lines = readCoachStandaloneLine({
    id: 'thermometer', type: 'thermometer', settings: { colour: '#ff8080' },
    segments: [
      { cells: [0, 1, 2], parameters: {} },
      { cells: [2, 5], parameters: {} },
    ],
  }, 3)

  assert.deepEqual(lines, [
    { type: 'thermometer', cells: [0, 1, 2], color: '#ff8080' },
    { type: 'thermometer', cells: [2, 5], color: '#ff8080' },
  ])
})

test('Sudoku Coach standalone Renban layers join connected segments without merging disjoint paths', () => {
  const lines = readCoachStandaloneLine({
    id: 'renban', type: 'renban', settings: {},
    segments: [
      { cells: [0, 1], parameters: {} },
      { cells: [1, 2], parameters: {} },
      { cells: [6, 7], parameters: {} },
    ],
  }, 3)

  assert.deepEqual(lines.map(line => line.type === 'renban' ? [...line.cells].sort((a, b) => a - b) : []), [[0, 1, 2], [6, 7]])
})

test('Sudoku Coach standalone Entropic and Modular layers parse independent paths', () => {
  const entropic = readCoachStandaloneLine({
    id: 'entropic', type: 'entropicLine', settings: {},
    segments: [
      { cells: [0, 1], parameters: {} },
      { cells: [2, 3, 4], parameters: {} },
    ],
  }, 9)
  assert.deepEqual(entropic, [
    { type: 'entropic', cells: [0, 1], groups: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
    { type: 'entropic', cells: [2, 3, 4], groups: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
  ])
  assert.deepEqual(readCoachStandaloneLine({
    id: 'modular', type: 'modularLine', settings: {},
    segments: [{ cells: [4, 3], parameters: {} }],
  }, 5), [{ type: 'modular', cells: [4, 3] }])
})

test('Sudoku Coach standalone Between and Lockout layers retain endpoint order', () => {
  assert.deepEqual(readCoachStandaloneLine({
    id: 'between', type: 'betweenLine', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }, 5), [{ type: 'between', cells: [0, 1, 2] }])
  assert.deepEqual(readCoachStandaloneLine({
    id: 'lockout', type: 'lockoutLine', settings: {},
    segments: [{ cells: [8, 7, 6], parameters: {} }],
  }, 9), [{ type: 'lockout', cells: [8, 7, 6], minDifference: 4 }])
})

test('Sudoku Coach standalone Arrow layers retain the bulb and ordered shaft', () => {
  assert.deepEqual(readCoachStandaloneLine({
    id: 'arrow', type: 'arrow', settings: { bulbSize: 30, arrowHeadLength: 15 },
    segments: [{ cells: [5, 6, 7], parameters: {} }],
  }, 4), [{ type: 'arrow', circle: 5, cells: [6, 7] }])
})

test('Sudoku Coach standalone Minimum and Maximum layers remain separate', () => {
  assert.deepEqual(readCoachStandaloneExtrema([
    { id: 'minimum', type: 'minimum', settings: {}, segments: [
      { cells: [0], parameters: {} }, { cells: [1], parameters: {} },
    ] },
    { id: 'maximum', type: 'maximum', settings: {}, segments: [{ cells: [5], parameters: {} }] },
  ], 4), [
    { type: 'minimum', cells: [0, 1], ignoreMarkedNeighbors: true },
    { type: 'maximum', cells: [5], ignoreMarkedNeighbors: true },
  ])
})

test('Futoshiki engine enforces two-cell and three-cell Entropic and Modular paths', () => {
  const entropic = readCoachStandaloneLine({
    id: 'entropic', type: 'entropicLine', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }, 9)
  const modular = readCoachStandaloneLine({
    id: 'modular', type: 'modularLine', settings: {},
    segments: [{ cells: [0, 1], parameters: {} }],
  }, 5)
  const entropicPuzzle = createFutoshiki(9, Array(81).fill(0), [], [], entropic)
  const modularPuzzle = createFutoshiki(5, Array(25).fill(0), [], [], modular)

  assert.equal(checkLatin(entropicPuzzle, [1, 4, 7, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'entropic'), false)
  assert.equal(checkLatin(entropicPuzzle, [1, 4, 6, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'entropic'), true)
  const modularSameGroup = Array(25).fill(0); modularSameGroup[0] = 1; modularSameGroup[1] = 4
  const modularDifferentGroups = [...modularSameGroup]; modularDifferentGroups[1] = 2
  assert.equal(checkLatin(modularPuzzle, modularSameGroup).conflicts.some(rule => rule.kind === 'modular'), true)
  assert.equal(checkLatin(modularPuzzle, modularDifferentGroups).conflicts.some(rule => rule.kind === 'modular'), false)
})

test('Futoshiki engine enforces Between interior bounds and Lockout endpoint gap', () => {
  const between = readCoachStandaloneLine({
    id: 'between', type: 'betweenLine', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }, 5)
  const lockout = readCoachStandaloneLine({
    id: 'lockout', type: 'lockoutLine', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }, 9)
  const betweenPuzzle = createFutoshiki(5, Array(25).fill(0), [], [], between)
  const lockoutPuzzle = createFutoshiki(9, Array(81).fill(0), [], [], lockout)
  const calcudokuBetween = createCalcudoku(5, Array.from({ length: 5 }, (_, row) => ({
    cells: Array.from({ length: 5 }, (_, column) => row * 5 + column), operator: 'add' as const, target: 15,
  })), { givens: Array(25).fill(0), lines: between })
  const calcudokuLockout = createCalcudoku(9, Array.from({ length: 27 }, (_, index) => {
    const row = Math.floor(index / 3), startColumn = index % 3 * 3
    return { cells: [row * 9 + startColumn, row * 9 + startColumn + 1, row * 9 + startColumn + 2],
      operator: 'add' as const, target: 15 }
  }), { givens: Array(81).fill(0), lines: lockout })
  assert.equal(checkLatin(betweenPuzzle, [1, 3, 5, ...Array(22).fill(0)])
    .conflicts.some(rule => rule.kind === 'between'), false)
  assert.equal(checkLatin(betweenPuzzle, [1, 5, 4, ...Array(22).fill(0)])
    .conflicts.some(rule => rule.kind === 'between'), true)
  assert.equal(checkLatin(lockoutPuzzle, [1, 8, 6, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'lockout'), false)
  assert.equal(checkLatin(lockoutPuzzle, [1, 4, 6, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'lockout'), true)
  assert.equal(checkLatin(lockoutPuzzle, [1, 8, 4, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'lockout'), true)
  assert.equal(checkLatin(calcudokuBetween, [1, 3, 5, ...Array(22).fill(0)])
    .conflicts.some(rule => rule.kind === 'between'), false)
  assert.equal(checkLatin(calcudokuBetween, [1, 5, 4, ...Array(22).fill(0)])
    .conflicts.some(rule => rule.kind === 'between'), true)
  assert.equal(checkLatin(calcudokuLockout, [1, 8, 6, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'lockout'), false)
  assert.equal(checkLatin(calcudokuLockout, [1, 4, 6, ...Array(78).fill(0)])
    .conflicts.some(rule => rule.kind === 'lockout'), true)
})

test('Futoshiki and Calcudoku engines enforce Arrow sums', () => {
  const lines = readCoachStandaloneLine({
    id: 'arrow', type: 'arrow', settings: {},
    segments: [{ cells: [0, 1, 2], parameters: {} }],
  }, 4)
  const futoshiki = createFutoshiki(4, Array(16).fill(0), [], [], lines)
  const calcudoku = createCalcudoku(4, Array.from({ length: 4 }, (_, row) => ({
    cells: Array.from({ length: 4 }, (_, column) => row * 4 + column), operator: 'add' as const, target: 10,
  })), { givens: Array(16).fill(0), lines })
  const valid = [3, 1, 2, ...Array(13).fill(0)]
  const invalid = [4, 1, 2, ...Array(13).fill(0)]
  for (const puzzle of [futoshiki, calcudoku]) {
    assert.equal(checkLatin(puzzle, valid).conflicts.some(rule => rule.kind === 'arrow'), false)
    assert.equal(checkLatin(puzzle, invalid).conflicts.some(rule => rule.kind === 'arrow'), true)
  }
})

test('Futoshiki and Calcudoku engines enforce Minimum and Maximum cells with same-layer exceptions', () => {
  const extrema = readCoachStandaloneExtrema([
    { id: 'minimum', type: 'minimum', settings: {}, segments: [
      { cells: [0], parameters: {} }, { cells: [1], parameters: {} },
    ] },
  ], 4)
  const futoshiki = createFutoshiki(4, Array(16).fill(0), [], [], [], [], [], extrema)
  const calcudoku = createCalcudoku(4, Array.from({ length: 4 }, (_, row) => ({
    cells: Array.from({ length: 4 }, (_, column) => row * 4 + column), operator: 'add' as const, target: 10,
  })), { givens: Array(16).fill(0), extrema })
  const markedNeighbors = [2, 1, ...Array(14).fill(0)]
  const unmarkedNeighbor = [2, 1, ...Array(14).fill(0)]
  for (const puzzle of [futoshiki, calcudoku]) {
    assert.equal(checkLatin(puzzle, markedNeighbors).conflicts.some(rule => rule.kind === 'minimum'), false)
  }
  const singleMinimum = createFutoshiki(4, Array(16).fill(0), [], [], [], [], [], [
    { type: 'minimum', cells: [0], ignoreMarkedNeighbors: true },
  ])
  assert.equal(checkLatin(singleMinimum, unmarkedNeighbor).conflicts.some(rule => rule.kind === 'minimum'), true)
  const singleMaximum = createCalcudoku(4, Array.from({ length: 4 }, (_, row) => ({
    cells: Array.from({ length: 4 }, (_, column) => row * 4 + column), operator: 'add' as const, target: 10,
  })), { givens: Array(16).fill(0), extrema: [{ type: 'maximum', cells: [0], ignoreMarkedNeighbors: true }] })
  assert.equal(checkLatin(singleMaximum, [2, 3, ...Array(14).fill(0)])
    .conflicts.some(rule => rule.kind === 'maximum'), true)
})

test('Futoshiki and Calcudoku engines enforce parsed Thermometer paths', () => {
  const lines = [{ type: 'thermometer' as const, cells: [0, 1, 2] }]
  const futoshiki = createFutoshiki(3, Array(9).fill(0), [], [], lines)
  const calcudoku = createCalcudoku(3, [
    { cells: [0, 1, 2], operator: 'add', target: 6 },
    { cells: [3, 4, 5], operator: 'add', target: 6 },
    { cells: [6, 7, 8], operator: 'add', target: 6 },
  ], { givens: Array(9).fill(0), lines })

  assert.equal(checkLatin(futoshiki, [1, 2, 3, 0, 0, 0, 0, 0, 0]).conflicts.some(rule => rule.kind === 'thermometer'), false)
  assert.equal(checkLatin(futoshiki, [3, 2, 1, 0, 0, 0, 0, 0, 0]).conflicts.some(rule => rule.kind === 'thermometer'), true)
  assert.equal(checkLatin(calcudoku, [1, 2, 3, 0, 0, 0, 0, 0, 0]).conflicts.some(rule => rule.kind === 'thermometer'), false)
  assert.equal(checkLatin(calcudoku, [3, 2, 1, 0, 0, 0, 0, 0, 0]).conflicts.some(rule => rule.kind === 'thermometer'), true)
})

test('Sudoku Coach standalone diagonal parser preserves both directions and rejects duplicate layers', () => {
  assert.deepEqual(readCoachStandaloneDiagonals([
    { id: 'main', type: 'diagonalNegative', settings: {}, segments: [] },
    { id: 'anti', type: 'diagonalPositive', settings: {}, segments: [] },
  ], 5), ['main', 'anti'])
  assert.throws(() => readCoachStandaloneDiagonals([
    { id: 'main-1', type: 'diagonalNegative', settings: {}, segments: [] },
    { id: 'main-2', type: 'diagonalNegative', settings: {}, segments: [] },
  ], 5), /repeats a diagonal/)
  assert.throws(() => readCoachStandaloneDiagonals([
    { id: 'main', type: 'diagonalNegative', settings: { colour: 'red' }, segments: [] },
  ], 5), /unsupported diagonal settings/)
})

test('Futoshiki and Calcudoku engines enforce both parsed diagonal houses', () => {
  const diagonals = ['main', 'anti'] as const
  const size = 4
  const futoshiki = createFutoshiki(size, Array(size ** 2).fill(0), [], [], [], diagonals)
  const cages = Array.from({ length: size }, (_, row) => ({
    cells: Array.from({ length: size }, (_, column) => row * size + column), operator: 'add' as const, target: 10,
  }))
  const calcudoku = createCalcudoku(size, cages, { givens: Array(size ** 2).fill(0), diagonals })
  const valid = [1, 2, 3, 4, 3, 4, 1, 2, 4, 3, 2, 1, 2, 1, 4, 3]
  const invalid = [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]

  for (const puzzle of [futoshiki, calcudoku]) {
    assert.equal(checkLatin(puzzle, valid).conflicts.some(rule => rule.label === 'Main diagonal'), false)
    assert.equal(checkLatin(puzzle, valid).conflicts.some(rule => rule.label === 'Anti diagonal'), false)
    assert.equal(checkLatin(puzzle, invalid).conflicts.some(rule => rule.label === 'Main diagonal'), true)
    assert.equal(checkLatin(puzzle, invalid).conflicts.some(rule => rule.label === 'Anti diagonal'), true)
  }
})

test('Sudoku Coach standalone anti-move parser and engines enforce Knight and King exclusions', () => {
  const exclusions = readCoachStandaloneExclusions([
    { id: 'knight', type: 'antiKnight', settings: {}, segments: [] },
    { id: 'king', type: 'antiKing', settings: {}, segments: [] },
  ], 4)
  assert.deepEqual(exclusions, ['anti-knight', 'anti-king'])
  assert.throws(() => readCoachStandaloneExclusions([
    { id: 'knight-1', type: 'antiKnight', settings: {}, segments: [] },
    { id: 'knight-2', type: 'antiKnight', settings: {}, segments: [] },
  ], 4), /repeats an anti-move rule/)

  const knightLatin = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1]
  const kingLatin = [1, 2, 3, 4, 2, 1, 4, 3, 3, 4, 1, 2, 4, 3, 2, 1]
  for (const makePuzzle of [
    (rules: typeof exclusions) => createFutoshiki(4, Array(16).fill(0), [], [], [], [], rules),
    (rules: typeof exclusions) => createCalcudoku(4, Array.from({ length: 4 }, (_, row) => ({
      cells: Array.from({ length: 4 }, (_, column) => row * 4 + column), operator: 'add' as const, target: 10,
    })), { givens: Array(16).fill(0), exclusions: rules }),
  ]) {
    const antiKnight = makePuzzle(['anti-knight'])
    const antiKing = makePuzzle(['anti-king'])
    assert.equal(checkLatin(antiKnight, knightLatin).conflicts.some(rule => rule.kind === 'anti-knight'), true)
    assert.equal(checkLatin(antiKing, kingLatin).conflicts.some(rule => rule.kind === 'anti-king'), true)
  }
})

test('Sudoku Coach standalone Non-Consecutive layers enforce orthogonal difference', () => {
  const exclusions = readCoachStandaloneExclusions([
    { id: 'nonconsecutive', type: 'nonconsecutive', settings: {}, segments: [] },
  ], 4)
  assert.deepEqual(exclusions, ['nonconsecutive'])
  const puzzle = createFutoshiki(4, Array(16).fill(0), [], [], [], [], exclusions)
  assert.equal(checkLatin(puzzle, [2, 3, ...Array(14).fill(0)])
    .conflicts.some(rule => rule.kind === 'nonconsecutive'), true)
  assert.equal(checkLatin(puzzle, [2, 4, ...Array(14).fill(0)])
    .conflicts.some(rule => rule.kind === 'nonconsecutive'), false)
})

test('Sudoku Coach standalone line parser rejects malformed clues', () => {
  assert.throws(() => readCoachStandaloneLine({
    id: 'thermometer', type: 'thermometer', settings: {},
    segments: [{ cells: [0], parameters: {} }],
  }, 3), /invalid Thermometer or Renban line/)
  assert.throws(() => readCoachStandaloneLine({
    id: 'thermometer', type: 'thermometer', settings: {},
    segments: [{ cells: [0, 0], parameters: {} }],
  }, 3), /invalid Thermometer or Renban line/)
})
