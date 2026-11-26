import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import lzString from 'lz-string'
import { positionDigit, positionText } from '../src/sudoku/digit-symbols.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { rectangularGridForBoxRows, sizedArrowState } from '../src/sudoku/grid.ts'
import { isSolved, enter } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { playCandidates } from '../src/sudoku/variant-play.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('zero-based sized Arrows sum displayed values and allow long shafts with house-aware repeats', async () => {
  const grid = rectangularGridForBoxRows(10, 2, 'zero-based')
  const shortRules = [{ type: 'arrow', circle: 0, cells: [55] }] as const
  const partial = Array<number>(100).fill(0)
  partial[0] = 1 // Displayed 0.
  const candidates = await runEngine({
    type: 'sized-variant', operation: 'candidates',
    position: sizedRulePosition(grid, { rules: shortRules }, positionText(partial)),
  })
  assert.ok(candidates)
  assert.equal(candidates[55], 1, 'the shaft must display zero when the bulb displays zero')
  assert.equal(sizedArrowState(shortRules, positionText(partial), 10, 1)?.allowed[55], 1)
  partial[55] = 2 // Displayed 1 cannot sum to a bulb displaying 0.
  assert.deepEqual(sizedArrowState(shortRules, positionText(partial), 10, 1)?.conflicts, new Set([0, 55]))

  const displayed = Array.from({ length: 100 }, (_, cell) => {
    const row = Math.floor(cell / 10), column = cell % 10
    return (row * 5 + Math.floor(row / 2) + column) % 10
  })
  const zeroes = displayed.flatMap((value, cell) => value === 0 ? [cell] : [])
  const ones = displayed.flatMap((value, cell) => value === 1 ? [cell] : [])
  const shaft = [...zeroes, ...ones.slice(0, 7)]
  const circle = displayed.findIndex(value => value === 7)
  assert.equal(shaft.length, 17)
  const rules = [
    { type: 'arrow', circle, cells: shaft },
    { type: 'kropki', ratioTwo: { pairs: [[1, 2]] } },
    { type: 'adjacent-total', cells: [2, 3], sum: 5 },
  ] as const
  const solved = await runEngine({
    type: 'sized-variant', operation: 'analyze',
    position: sizedRulePosition(grid, { rules }, positionText(displayed.map(value => value + 1))),
  })
  assert.equal(solved, 'unique')
})

test('#388 synthetic mixed import preserves zero-based Arrow, ratio, and total rules', async () => {
  const size = 6
  const grid = rectangularGridForBoxRows(size, 2, 'zero-based')
  const arrow = { type: 'arrow', circle: 4, cells: [9, 10, 17, 22, 28, 21, 20] } as const
  const solution = Array.from({ length: size ** 2 }, (_, cell) => {
    const row = Math.floor(cell / size), column = cell % size
    return (row % 2 * 3 + Math.floor(row / 2) + column) % size
  })
  const coordinates = (cell: number) => [Math.floor(cell / size), cell % size]
  const center = (cell: number) => coordinates(cell).map(value => value + .5)
  const overlay = (point: number[], width: number, backgroundColor: string, borderColor?: string) => ({
    center: point, width, height: width, rounded: true, backgroundColor,
    ...(borderColor && { borderColor }),
  })
  const blanks = new Set(arrow.cells.slice(0, 1))
  const source = {
    cells: Array.from({ length: size }, (_, row) => solution.slice(row * size, (row + 1) * size)
      .map((value, column) => blanks.has(row * size + column) ? {} : { value })),
    regions: Array.from({ length: size }, (_, box) => Array.from({ length: size }, (_, cell) => [
      Math.floor(box / 2) * 2 + Math.floor(cell / 3), box % 2 * 3 + cell % 3,
    ])),
    arrows: [{
      wayPoints: [[.75, 4.25], ...arrow.cells.map(center)],
      color: '#64d230ff', thickness: 3.2, headLength: .35,
    }],
    overlays: [
      overlay(center(arrow.circle), .82, '#ffffffff', '#64d230ff'),
      overlay([.5, 2], .42, '#ffc50dff'),
      overlay([.5, 3], .42, '#b6b39aff'),
    ],
    metadata: {
      title: 'Synthetic Zero-Based Arrow Control',
      rules: 'Normal 6x6 sudoku rules apply, using the digits 0-5. Place the digits 0-5 once in every row, column, and 2x3 box.\n\n' +
        'Arrows: Digits on an arrow must sum to the digit in the bulb.\n\n' +
        'The Sun: Digits separated by the yellow sun must be in a 1:2 ratio.\n\n' +
        'Falling Rocks: Digits separated by grey rocks must sum to 5.',
      solution: solution.join(''),
    },
  }
  const code = 'scl' + lzString.compressToBase64(JSON.stringify(source))
  const { game } = await prepareImportedPuzzle(code)
  const expectedRules = [
    { type: 'kropki', ratioTwo: { pairs: [[1, 2]] } },
    { type: 'adjacent-total', cells: [2, 3], sum: 5 },
    arrow,
  ]
  assert.deepEqual(game.grid, grid)
  assert.deepEqual(game.sized?.rules, expectedRules)
  const ranks = positionText(solution.map(value => value + 1))
  assert.equal(game.givens[arrow.cells[0]], '0')
  assert.equal(isSolved(enter(game, [arrow.cells[0]], 'value', solution[arrow.cells[0]] + 1)), true)
  assert.equal((await puzzleSolution(game)).board, ranks)
})

test('#388 published Mountain Climbing has one completion with its 17-cell Arrow and pair clues in Wasm', async () => {
  const code = readFileSync(new URL('./fixtures/sudokupad-mountain-climbing.scl', import.meta.url), 'utf8').trim()
  const puzzle = await detectPuzzle(code)
  assert.equal(puzzle.title, 'Mountain Climbing')
  assert.equal(puzzle.authoredSolution?.length, 100)
  const definition = { rules: puzzle.sizedRules }
  const openingPosition = sizedRulePosition(puzzle.grid!, definition, puzzle.givens)
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: openingPosition })
  assert.ok(candidates)
  assert.equal(
    candidates.filter((mask, cell) =>
      (mask & (1 << (positionDigit(puzzle.authoredSolution![cell]) - 1))) !== 0,
    ).length,
    100,
  )
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position: openingPosition, limit: 1 })
  assert.ok(hints?.choices.length)
  const unique = await runEngine({
    type: 'sized-variant', operation: 'analyze',
    position: openingPosition,
  })
  assert.equal(unique, 'unique')
  const authoredCompletion = await runEngine({
    type: 'sized-variant', operation: 'analyze',
    position: sizedRulePosition(puzzle.grid!, definition, puzzle.authoredSolution!),
  })
  assert.equal(authoredCompletion, 'unique')

  const { game } = await prepareImportedPuzzle(code)
  assert.equal(game.sized?.solution, puzzle.authoredSolution)
  const playMasks = await playCandidates(game)
  assert.ok(playMasks)
  for (let cell = 0; cell < 100; cell++) {
    if (game.givens[cell] !== '0') continue
    assert.ok(playMasks[cell] & (1 << (positionDigit(puzzle.authoredSolution![cell]) - 1)),
      `Play candidates must retain the authored value at cell ${cell}`)
  }

  let completed = game
  for (let cell = 0; cell < 100; cell++) {
    if (completed.givens[cell] === '0') {
      completed = enter(completed, [cell], 'value', positionDigit(puzzle.authoredSolution![cell]))
    }
  }
  assert.equal(isSolved(completed), true, 'the app Play state must accept the published completion')
})
