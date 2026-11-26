import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { runEngine, type SizedConstraintPosition } from '../src/sudoku/engine.ts'
import { readSizedRuleSudokuPad } from '../src/sudoku/sized-rule-sudoku-pad.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { isSizedRuleList, restoreSizedRuleGame, sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { verifySizedRulePuzzle } from '../src/sudoku/sized-rule-game.ts'
import { conflictsOf, enter, makeGame, valuesOf } from '../src/sudoku/game.ts'
import { sizedRegionSumState } from '../src/sudoku/region-sum.ts'
import { sizedRuleSolutionTrace } from '../src/sudoku/sized-rule-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('zero-based 10 by 10 SudokuPad clues become internal ranks without turning zero into a blank', async () => {
  const regions = []
  for (let boxRow = 0; boxRow < 5; boxRow++) for (let boxColumn = 0; boxColumn < 2; boxColumn++) {
    const box = []
    for (let row = boxRow * 2; row < boxRow * 2 + 2; row++) {
      for (let column = boxColumn * 5; column < boxColumn * 5 + 5; column++) box.push([row, column])
    }
    regions.push(box)
  }
  const cells = Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, column) => ({
    ...(row === 0 && column < 2 ? { value: column } : {}),
  })))
  const puzzle = readSizedRuleSudokuPad({
    cells,
    regions,
    metadata: {
      rules: 'Normal 10x10 sudoku rules apply, using the digits 0-9. Place the digits 0-9 once in every row, column and 2x5 region. Parity lines: Along a red line, adjacent digits must alternate between odd and even.',
    },
    lines: [{ wayPoints: [[.5, .5], [.5, 1.5]], color: '#ff6666', thickness: .1 }],
  })
  assert.equal(puzzle.grid.size, 10)
  assert.equal('notation' in puzzle.grid && puzzle.grid.notation, 'zero-based')
  assert.equal(puzzle.givens.slice(0, 3), '120')
  assert.deepEqual(puzzle.sizedRules, [{ type: 'parity-line', cells: [0, 1] }])
  const position = sizedRulePosition(puzzle.grid, { rules: puzzle.sizedRules }, puzzle.givens)
  assert.equal(position.zeroBased, true)
  assert.ok(await runEngine({ type: 'sized-variant', operation: 'candidates', position }))
})

test('zero-based exports retain simultaneous line families and Kropki rules', async () => {
  const regions = []
  for (let boxRow = 0; boxRow < 5; boxRow++) for (let boxColumn = 0; boxColumn < 2; boxColumn++) {
    const box = []
    for (let row = boxRow * 2; row < boxRow * 2 + 2; row++) {
      for (let column = boxColumn * 5; column < boxColumn * 5 + 5; column++) box.push([row, column])
    }
    regions.push(box)
  }
  const path = (row: number, firstColumn: number, lastColumn: number) => [
    [row + .5, firstColumn + .5], [row + .5, lastColumn + .5],
  ]
  const puzzle = readSizedRuleSudokuPad({
    cells: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({}))),
    regions,
    metadata: { rules: [
      'Normal 10x10 sudoku rules apply, using the digits 0-9. Place the digits 0-9 once in every row, column and 2x5 region.',
      'Dutch whispers: adjacent digits on an orange line must differ by at least 4.',
      'German whispers: adjacent digits on a green line must differ by at least 5.',
      'Renban: purple lines must contain a set of consecutive digits in any order.',
      'Parity lines: along a red line, adjacent digits must alternate between odd and even.',
      'Palindromes: digits on a grey line read the same forwards and backwards.',
      'Region Sum Lines: Box borders divide lines into segments with equal sums.',
      'Kropki: digits separated by a black dot are in an 1:2 ratio (i.e. one digit is double the other); digits separated by a white dot are consecutive.',
    ].join('\n') },
    lines: [
      { wayPoints: path(0, 0, 1), color: '#ffa600', thickness: .1 },
      { wayPoints: path(1, 0, 1), color: '#67f067', thickness: .1 },
      { wayPoints: path(2, 0, 2), color: '#f067f0', thickness: .1 },
      { wayPoints: path(3, 0, 1), color: '#ff6666', thickness: .1 },
      { wayPoints: path(4, 0, 1), color: '#777', thickness: .1 },
      { wayPoints: path(5, 0, 5), color: '#2ecbff', thickness: .1 },
    ],
    overlays: [{ center: [6.5, 1], width: .2, height: .2, rounded: true, backgroundColor: '#000000' }],
  })
  assert.deepEqual(new Set(puzzle.sizedRules.map(rule => rule.type)),
    new Set(['whispers', 'renban', 'parity-line', 'palindrome', 'region-sum', 'kropki']))
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position:
    sizedRulePosition(puzzle.grid, { rules: puzzle.sizedRules }, puzzle.givens) })
  assert.ok(candidates)
})

test('zero-based imported completion validates Region Sum, Whispers, Renban, parity and Kropki together', async () => {
  const grid = { size: 10, boxRows: 2, boxColumns: 5, notation: 'zero-based' as const }
  const map = [4, 0, 1, 3, 6, 2, 5, 7, 8, 9]
  const digits = Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, column) => map[(row % 2 * 5 + Math.floor(row / 2) + column) % 10]))
  const regions = Array.from({ length: 10 }, (_, box) => {
    const boxRow = Math.floor(box / 2), boxColumn = box % 2
    return Array.from({ length: 10 }, (_, offset) => [boxRow * 2 + Math.floor(offset / 5), boxColumn * 5 + offset % 5])
  })
  const path = (...points: number[][]) => points.map(([row, column]) => [row + .5, column + .5])
  const source = {
    cells: digits.map((row, r) => row.map((value, c) => r === 1 && c === 5 ? {} : { value })),
    regions,
    lines: [
      { wayPoints: path([0, 4], [0, 5], [1, 5]), color: '#2ecbffff', thickness: 12 },
      { wayPoints: path([0, 0], [0, 1]), color: '#ffa600ff', thickness: 12 },
      { wayPoints: path([0, 8], [1, 8]), color: '#67f067ff', thickness: 12 },
      { wayPoints: path([0, 1], [0, 2]), color: '#f067f0ff', thickness: 12 },
      { wayPoints: path([0, 1], [0, 2]), color: '#ff6666ff', thickness: 12 },
    ],
    overlays: [{ center: [.5, 4], width: .2, height: .2, rounded: true, backgroundColor: '#000000' }],
    metadata: {
      rules: [
        'Standard 10x10 sudoku rules apply, using the digits 0-9. Place the digits 0-9 once in every row, column, and 2x5 box.',
        'Region Sum Lines: Box borders divide lines into segments with equal sums.',
        'Dutch whispers: adjacent digits on an orange line must differ by at least 4.',
        'German whispers: adjacent digits on a green line must differ by at least 5.',
        'Renban: purple lines must contain a set of consecutive digits in any order.',
        'Parity lines: along a red line, adjacent digits must alternate between odd and even.',
        'Kropki: digits separated by a black dot are in an 1:2 ratio (i.e. one digit is double the other); digits separated by a white dot are consecutive.',
      ].join('\n'),
      solution: digits.flat().join(''),
    },
  }
  const imported = await detectPuzzle('scl' + lzString.compressToBase64(JSON.stringify(source)))
  assert.equal(imported.format, 'SudokuPad')
  assert.equal(imported.givens[0], '5', 'displayed zero is retained as a filled internal rank')
  assert.equal(imported.givens[15], '0', 'the empty cell remains blank')
  const verified = await verifySizedRulePuzzle({
    grid: imported.grid,
    givens: imported.givens,
    rules: imported.sizedRules,
    authoredSolution: imported.authoredSolution,
    authoredSolutionOnly: true,
  })
  assert.equal(verified.solution.length, 100)
  assert.deepEqual(verified.solution, imported.authoredSolution)

  const game = { ...makeGame('zero-based-region-sum', 'Zero-based Region Sum', imported.givens, 'imported', undefined, imported.grid),
    sized: verified }
  const completed = enter(game, [15], 'value', 5)
  assert.equal(valuesOf(completed), verified.solution)
  assert.deepEqual(conflictsOf(valuesOf(completed), undefined, imported.grid, verified.rules), new Set())
  const incorrect = enter(game, [15], 'value', 6)
  assert.ok(sizedRegionSumState(verified.rules, valuesOf(incorrect), imported.grid)?.conflicts.has(15))
  assert.equal((await sizedRuleSolutionTrace(verified, imported.grid, imported.givens)).board, verified.solution)
})

test('zero-based Region Sum accepts filled zero and unequal segment lengths', async () => {
  const grid = { size: 4, boxRows: 2, boxColumns: 2 } as const
  const digits = Array(16).fill(0)
  digits[0] = 4
  digits[2] = 2
  digits[3] = 3
  const base = {
    version: 2 as const,
    grid,
    digits,
  }
  const zeroBased: SizedConstraintPosition = {
    ...base,
    zeroBased: true,
    rules: [{ type: 'region-sum', cells: [0, 2, 3] }, { type: 'parity', parity: 'even', cells: [4] }],
  }
  const oneBased: SizedConstraintPosition = {
    ...base,
    rules: [{ type: 'region-sum', cells: [0, 2, 3] }],
  }

  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: zeroBased })
  assert.ok(candidates)
  assert.equal(candidates[4], 0b0101, 'zero-based even values map to odd internal ranks')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'candidates', position: oneBased }), null)

  const ratioDigits = Array(16).fill(0)
  ratioDigits[0] = 1
  ratioDigits[1] = 2
  const ratioRule = [{ type: 'kropki', consecutive: { pairs: [], negative: false },
    ratioTwo: { pairs: [[0, 1]], negative: false } }] as const
  const ratioBase = { version: 2 as const, grid, digits: ratioDigits, rules: ratioRule }
  assert.ok(await runEngine({ type: 'sized-variant', operation: 'candidates', position: ratioBase }))
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'candidates', position: { ...ratioBase, zeroBased: true } }), null,
    'displayed zero and one do not form a ratio-two pair')

  const alternating = {
    version: 2 as const,
    grid,
    digits: [1, ...Array(15).fill(0)],
    zeroBased: true as const,
    rules: [{ type: 'parity-line', cells: [0, 1] }] as const,
  }
  const alternatingCandidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: alternating })
  assert.equal(alternatingCandidates?.[1], 0b1010, 'neighboring parity-line cells use opposite parity')
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    ...alternating, rules: [{ type: 'parity-line', cells: [0, 5] }],
  } }), /cells and paths/)
  const parityConflictValues = ['1', '3', ...Array(14).fill('0')].join('')
  assert.deepEqual(conflictsOf(parityConflictValues, undefined, grid, alternating.rules), new Set([0, 1]))

  const palindrome = { ...base, zeroBased: true as const,
    rules: [{ type: 'palindrome', cells: [0, 1, 2, 6, 10] }] as const }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    ...palindrome, digits: [2, ...Array(9).fill(0), 3, ...Array(5).fill(0)],
  } }), null, 'a palindrome line requires matching ranks in mirrored cells')
  assert.ok(await runEngine({ type: 'sized-variant', operation: 'candidates', position: {
    ...palindrome, digits: [2, ...Array(9).fill(0), 2, ...Array(5).fill(0)],
  } }))
  const palindromeValues = Array(16).fill('0')
  palindromeValues[0] = '1'
  palindromeValues[10] = '2'
  assert.deepEqual(conflictsOf(palindromeValues.join(''), undefined, grid,
    [{ type: 'palindrome', cells: [0, 1, 2, 6, 10] }]), new Set([0, 10]))
})

test('zero-based Sandwich uses displayed totals and the zero/highest endpoint symbols', async () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 }
  const appGrid = { ...grid, notation: 'zero-based' as const }
  const solution = Array.from('123456456123234561561234345612612345', Number)
  const position: SizedConstraintPosition = {
    version: 2,
    grid,
    zeroBased: true,
    digits: solution,
    rules: [{ type: 'sandwich', direction: 'south', cells: [0, 6, 12, 18, 24, 30], sum: 10 }],
  }
  assert.equal(isSizedRuleList(position.rules, appGrid), true)
  assert.equal(isSizedRuleList([{ type: 'sandwich', direction: 'south', cells: [0, 6, 12, 18, 24, 30], sum: 11 }], appGrid), false)
  assert.deepEqual(restoreSizedRuleGame({ rules: position.rules, solution: solution.join('') }, appGrid, solution.join('')),
    { rules: position.rules, solution: solution.join('') })
  const { zeroBased: _zeroBased, ...oneBasedPosition } = position
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...oneBasedPosition, rules: [{ type: 'sandwich', direction: 'south', cells: [0, 6, 12, 18, 24, 30], sum: 14 }],
  } }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, rules: [{ type: 'sandwich', direction: 'south', cells: [0, 6, 12, 18, 24, 30], sum: 11 }],
  } }))
})

test('zero-based X-Sums count displayed values and expose displayed totals to linked clues', async () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 }
  const appGrid = { ...grid, notation: 'zero-based' as const }
  const solution = Array.from('123456456123234561561234345612612345', Number)
  const rules: SizedConstraintPosition['rules'] = [
    { type: 'x-sum' as const, direction: 'east' as const, cells: [0, 1, 2, 3, 4, 5], sum: 0 },
    { type: 'x-sum' as const, direction: 'east' as const, cells: [12, 13, 14, 15, 16, 17], sum: 1 },
    { type: 'x-sum' as const, direction: 'east' as const, cells: [24, 25, 26, 27, 28, 29], sum: 5 },
    { type: 'x-sum' as const, direction: 'east' as const, cells: [30, 31, 32, 33, 34, 35], sum: 11 },
    { type: 'x-sum-dot' as const, ends: [{ direction: 'east' as const, index: 0 }, { direction: 'west' as const, index: 4 }], relation: 'consecutive' as const },
  ]
  const position: SizedConstraintPosition = { version: 2, grid, zeroBased: true, digits: solution, rules }
  assert.equal(isSizedRuleList(rules, appGrid), true)
  const solutionText = solution.join('')
  assert.ok(restoreSizedRuleGame({ rules, solution: solutionText }, appGrid, '0'.repeat(solution.length)))
  const changedRules = rules.map((rule, index) => index === 1
    ? { type: 'x-sum' as const, direction: 'east' as const, cells: [12, 13, 14, 15, 16, 17], sum: 2 }
    : rule)
  assert.equal(restoreSizedRuleGame({ rules: changedRules, solution: solutionText }, appGrid, '0'.repeat(solution.length)), undefined)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, rules: rules.slice(0, 4) } }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, rules: changedRules,
  } }), 'conflict')
})
