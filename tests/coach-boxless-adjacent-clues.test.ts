import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { prepareImportedCalcudoku, readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const size = 3
const sum = { type: 'twoCellSum', segments: [{ cells: [0, 3], parameters: { sum: 3 } }] }
const solution = '123231312'
const boxless = (givenConstraints: readonly unknown[], givenDigits = '0'.repeat(9)) =>
  coachCode({ gridSize: size, regions: [], givenDigits, givenConstraints })

test('a Futoshiki import can require both an inequality and a two-cell sum', async () => {
  const inequality = { type: 'greaterLess', segments: [{ cells: [1, 2] }] }
  const givens = '100000000'
  for (const clue of [inequality, sum]) {
    await assert.rejects(preparePlayableImport(boxless([clue], givens)), /more than one solution/)
  }
  const imported = await preparePlayableImport(boxless([inequality, sum], givens))
  assert.ok('futoshiki' in imported)
  const { puzzle, id } = imported.futoshiki
  assert.equal(solveLatin(puzzle).solution?.join(''), solution)
  assert.ok(checkLatin(puzzle, [0, 0, 0, 3]).conflicts.some(rule => rule.kind === 'adjacent-clue'))
  assert.ok(findLatinHints(puzzle, []).some(hint => hint.rules.some(rule => rule.kind === 'adjacent-clue')))
  assert.equal(findLatinSolutionHints(puzzle, []).length, 8)
  assert.deepEqual(readImportedFutoshiki(id)?.puzzle.adjacentClues, puzzle.adjacentClues)
  assert.equal(readImportedFutoshiki(id + '0'), undefined)
})

test('a Calcudoku import can need a cage, inequality and pair clue at the same time', async () => {
  const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }
  const inequality = { type: 'greaterLess', segments: [{ cells: [0, 1] }] }
  const rules = [cage, inequality, sum]
  for (const skipped of rules) {
    await assert.rejects(preparePlayableImport(boxless(rules.filter(rule => rule !== skipped))), /more than one solution/)
  }
  const imported = await preparePlayableImport(boxless(rules))
  assert.ok('calcudoku' in imported)
  const { puzzle, id } = imported.calcudoku
  assert.equal(solveLatin(puzzle).solution?.join(''), solution)
  assert.deepEqual(readImportedCalcudoku(id)?.puzzle.adjacentClues, puzzle.adjacentClues)
  assert.ok(checkLatin(puzzle, [0, 0, 0, 3]).conflicts.some(rule => rule.kind === 'adjacent-clue'))

  const unsigned = { ...cage, segments: [{ cells: [0, 1], parameters: { sum: '3' } }] }
  const forChoice = await preparePlayableImport(coachCode({
    gridSize: size, regions: [], givenDigits: '000000000',
    givenConstraints: [unsigned, inequality, sum, { type: 'ratio', segments: [{ cells: [0, 3], parameters: { ratio: 2 } }] }],
    userDigits: '100000000', colours: ['green'], userColours: '0,,,,,,,,',
  }))
  assert.ok('calcudokuSource' in forChoice)
  const entry = prepareImportedCalcudoku(forChoice.calcudokuSource, { 0: 'add' })
  const reopened = readImportedCalcudoku(entry.id)
  assert.equal(solveLatin(reopened!.puzzle).solution?.join(''), solution)
  assert.deepEqual(reopened?.puzzle.adjacentClues?.marks.map(mark => mark.type), ['ratio', 'sum'])
  assert.equal(reopened?.initialPosition?.values[0], 1)
  assert.deepEqual(reopened?.annotations?.cellColors, { 0: ['green'] })
})

test('negative dot imports require the correct kind of dot on an edge', async () => {
  const givenDigits = '1234234134124123'
  const digits = Array.from(givenDigits, Number)
  const cornerSum = { type: 'twoCellSum', segments: [{ cells: [0, 1], parameters: { sum: 3 } }] }
  for (const type of ['difference', 'ratio'] as const) {
    const value = type === 'difference' ? 1 : 2
    const segments = digits.flatMap((digit, cell) => [
      ...(cell % 4 < 3 ? [cell + 1] : []),
      ...(cell < 12 ? [cell + 4] : []),
    ].filter(other => type === 'difference' ? Math.abs(digit - digits[other]) === value
      : Math.max(digit, digits[other]) === value * Math.min(digit, digits[other]))
      .map(other => ({ cells: [cell, other], parameters: { [type]: value } })))
    const marked = { type, segments, settings: { negativeConstraint: true } }
    const opposite = type === 'difference' ? 'ratio' : 'difference'
    const otherDot = { type: opposite, segments: [{ cells: [0, 1], parameters: { [opposite]: opposite === 'difference' ? 1 : 2 } }] }
    const code = (layers: readonly unknown[]) => coachCode({
      gridSize: 4, regions: [], givenDigits, givenConstraints: layers,
    })
    const valid = await preparePlayableImport(code([marked, otherDot, cornerSum]))
    assert.ok('futoshiki' in valid)
    assert.equal(checkLatin(readImportedFutoshiki(valid.futoshiki.id)!.puzzle, []).complete, true)
    await assert.rejects(
      preparePlayableImport(code([{ ...marked, segments: segments.slice(1) }, otherDot, cornerSum])),
      /no solution/,
    )
  }
})

test('labeled dots keep exact values and reject invalid or duplicate clues', async () => {
  const givenDigits = '123231312'
  const layers = [
    { type: 'difference', segments: [{ cells: [2, 5], parameters: { difference: 2 } }] },
    { type: 'ratio', segments: [{ cells: [7, 6], parameters: { ratio: 3 } }] },
  ]
  const puzzle = await preparePlayableImport(boxless(layers, givenDigits))
  assert.ok('futoshiki' in puzzle)
  assert.deepEqual(puzzle.futoshiki.puzzle.adjacentClues?.marks.map(({ type, value }) => [type, value]), [
    ['difference', 2], ['ratio', 3],
  ])
  await assert.rejects(preparePlayableImport(boxless([layers[0], ...layers], givenDigits)), /one clue of each type/)
  await assert.rejects(preparePlayableImport(boxless([{
    type: 'ratio', segments: [{ cells: [2, 3], parameters: { ratio: 2 } }],
  }], givenDigits)), /invalid adjacent clue/)
})

test('a native Coach clipboard export keeps overlapping clues and the negative white-dot rule', async () => {
  const source = readFileSync(new URL('./fixtures/futoshiki-coach-adjacent-clues.txt', import.meta.url), 'utf8').trim()
  const imported = await preparePlayableImport(source)
  assert.ok('futoshiki' in imported)
  const { puzzle, id } = imported.futoshiki
  assert.equal(solveLatin(puzzle).solution?.join(''), '1234234134124123')
  const restored = readImportedFutoshiki(id)!
  assert.equal(restored.puzzle.adjacentClues?.negativeDifference, true)
  assert.deepEqual(restored.puzzle.adjacentClues?.marks.filter(mark => mark.cells.join() === '0,1')
    .map(mark => mark.type), ['difference', 'ratio', 'sum'])
  assert.deepEqual(restored.puzzle.inequalities, [{ less: 0, greater: 1 }])
  assert.equal(restored.puzzle.givens[0], 0)
})

test('7 × 7 boxless Sudoku with only dots keeps the sized Sudoku route', async () => {
  const digits = Array.from({ length: 49 }, (_, cell) => (Math.floor(cell / 7) + cell % 7) % 7 + 1).join('')
  const imported = await detectPuzzle(coachCode({
    gridSize: 7, regions: [], givenDigits: digits,
    givenConstraints: [{ type: 'difference', segments: [{ cells: [0, 1], parameters: { difference: 1 } }] }],
  }))
  assert.ok(!('futoshiki' in imported))
  assert.ok(!('calcudoku' in imported))
  assert.equal(imported.grid?.size, 7)
})
