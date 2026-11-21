import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { prepareImportedCalcudoku, readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { createFutoshiki } from '../src/futoshiki/engine.ts'
import { bit, checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/calcudoku-coach.json', import.meta.url), 'utf8'))
const solution = '321564632451463125546213154632215346'

test('the original Sudoku Coach export keeps the givens, cage labels and colors', async () => {
  const { calcudoku } = await detectPuzzle(fixture.code)
  assert.ok(calcudoku)
  assert.equal(calcudoku.givens, fixture.givens)
  assert.deepEqual(calcudoku.cages.map(({ label, cells }) => [label, cells]), fixture.cages.map(
    ([label, cells]: [number | string, number[]]) => [String(label), cells],
  ))
  assert.deepEqual(calcudoku.colors, fixture.cellColors.map((index: string) => index === '' ? '' : fixture.palette[Number(index)]))

  const preview = await preparePlayableImport('https://sudoku.coach/en/play/' + fixture.code)
  assert.ok('calcudokuSource' in preview)
  assert.deepEqual(preview.calcudokuSource.cages.filter(cage => !cage.operator), [
    { label: '6', cells: [8, 14, 15], operator: undefined },
  ])
  assert.throws(() => prepareImportedCalcudoku(calcudoku), /Choose an operation/)
  assert.throws(() => prepareImportedCalcudoku(calcudoku, { 8: 'divide' }), /Choose an operation/)

  const sum = prepareImportedCalcudoku(calcudoku, { 8: 'add' })
  const product = prepareImportedCalcudoku(calcudoku, { 8: 'multiply' })
  assert.notEqual(sum.id, product.id)
  for (const [entry, operator] of [[sum, 'add'], [product, 'multiply']] as const) {
    const reopened = readImportedCalcudoku(entry.id)
    assert.ok(reopened)
    assert.deepEqual(reopened.cellColors, entry.cellColors)
    assert.deepEqual(reopened.cageLabels, entry.cageLabels)
    assert.deepEqual(reopened.puzzle.cages, entry.puzzle.cages)
    assert.equal(reopened.puzzle.cages.find(cage => cage.cells[0] === 8)?.operator, operator)
    assert.equal(reopened.puzzle.givens.join(''), fixture.givens)
    assert.equal(solveLatin(reopened.puzzle).status, 'unique')
    assert.equal(solveLatin(reopened.puzzle).solution?.join(''), solution)
    assert.equal(findLatinSolutionHints(reopened.puzzle, []).length, 35)
  }

  const domains = Array(36).fill(63)
  domains[8] = bit(1)
  domains[14] = bit(4)
  domains[15] = bit(1)
  assert.ok(sum.puzzle.rules.find(rule => rule.label === '6+ cage at R2C3')?.support(domains))
  assert.equal(product.puzzle.rules.find(rule => rule.label === '6× cage at R2C3')?.support(domains), null)
})

test('typed sum cages exclude repeats in cells that do not share a row or column', () => {
  const solved = [...'123312231'].map(Number)
  const fixed = solved.flatMap((target, cell) => [0, 1, 4].includes(cell) ? [] : [{ target, operator: 'equal' as const, cells: [cell] }])
  const sum = { target: 4, operator: 'add' as const, cells: [0, 1, 4] }
  assert.equal(solveLatin(createCalcudoku(3, [sum, ...fixed])).status, 'unique')
  assert.throws(() => createCalcudoku(3, [{ ...sum, distinct: true }, ...fixed]), /no valid arithmetic combinations/)
})

test('a fully specified export can skip cage selection without dropping rules', async () => {
  const givens = '023312231'
  const cageLayer = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }
  const data = { gridSize: 3, regions: [], givenDigits: givens, givenConstraints: [cageLayer] }
  const prepared = await preparePlayableImport(coachCode(data))
  assert.ok('calcudoku' in prepared)
  assert.deepEqual(prepared.calcudoku.ruleNotes, [])
  assert.equal(solveLatin(prepared.calcudoku.puzzle).solution?.join(''), '123312231')
  await assert.rejects(preparePlayableImport(coachCode({
    ...data, givenConstraints: [cageLayer, { type: 'nonconsecutive', segments: [], settings: { unknown: true } }],
  })), /Non-Consecutive rule uses unsupported/)
  await assert.rejects(preparePlayableImport(coachCode({
    ...data, givenConstraints: [{ ...cageLayer, segments: [{ cells: [0, 1], parameters: { sum: '3+?', style: 'changed' } }] }],
  })), /invalid cage label/)
  await assert.rejects(preparePlayableImport(coachCode({
    ...data, colours: ['not-a-color'], givenColours: '0,,,,,,,,',
  })), /unsupported cell colors/)
  assert.equal(readImportedCalcudoku(prepared.calcudoku.id + 'x'), undefined)
})

test('a boxless Coach puzzle can need both cages and inequalities to solve', async () => {
  const givens = '000100000'
  const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '5+' } }] }
  const sign = { type: 'greaterLess', segments: [{ cells: [1, 4] }] }
  const data = { gridSize: 3, regions: [], givenDigits: givens }
  const inequalities = [{ less: 1, greater: 4 }]
  const fixed = [...givens].map(Number)
  await assert.rejects(preparePlayableImport(coachCode({ ...data, givenConstraints: [cage] })), /more than one solution/)
  assert.equal(solveLatin(createFutoshiki(3, fixed, inequalities)).status, 'multiple')
  assert.throws(() => createCalcudoku(3, [{ target: 5, operator: 'add', cells: [0, 1] }], fixed), /exactly one cage/)

  const prepared = await preparePlayableImport(coachCode({
    ...data, givenConstraints: [cage, sign],
    userDigits: '020100000',
    colours: ['green'], userColours: ',,0,,,,,,',
  }))
  assert.ok('calcudoku' in prepared)
  const { id, puzzle, initialPosition, annotations } = prepared.calcudoku
  assert.deepEqual(puzzle.inequalities, inequalities)
  const result = solveLatin(puzzle)
  assert.equal(result.status, 'unique')
  assert.equal(result.solution?.join(''), '321132213')
  assert.ok(checkLatin(puzzle, result.solution!).complete)
  assert.ok(checkLatin(puzzle, [0, 3]).conflicts.some(rule => rule.kind === 'inequality'))
  assert.ok(findLatinHints(puzzle, []).some(hint => hint.rules.some(rule => rule.kind === 'inequality')))
  assert.equal(findLatinSolutionHints(puzzle, []).length, 8)
  assert.equal(initialPosition?.values[1], 2)
  assert.deepEqual(annotations?.cellColors, { 2: ['green'] })

  const reopened = readImportedCalcudoku(id)
  assert.deepEqual(reopened?.puzzle.inequalities, inequalities)
  assert.deepEqual(reopened?.initialPosition, initialPosition)
  assert.deepEqual(reopened?.annotations, annotations)
  assert.deepEqual(solveLatin(reopened!.puzzle), result)
  assert.equal(readImportedCalcudoku(id.replace('.i0104', '.i0203')), undefined)
  assert.equal(readImportedCalcudoku(id.replace('.i0104', '.i01040401')), undefined)

  for (const segments of [[{ cells: [1, '4'] }], [{ cells: [1, 4], parameters: { amount: 2 } }]]) {
    await assert.rejects(preparePlayableImport(coachCode({
      ...data, givenConstraints: [cage, { ...sign, segments }],
    })), /invalid inequality sign/)
  }
})

test('boxless 7 × 7 Coach puzzles can combine typed cages and inequalities', async () => {
  const size = 7
  const solved = Array.from({ length: size ** 2 }, (_, cell) => (cell % size + Math.floor(cell / size)) % size + 1).join('')
  const givens = solved.slice(0, 48) + '0'
  const prepared = await preparePlayableImport(coachCode({
    gridSize: size, regions: [], givenDigits: givens,
    givenConstraints: [
      { type: 'cage', segments: [{ cells: [47, 48], parameters: { sum: 11 } }] },
      { type: 'greaterLess', segments: [{ cells: [47, 48] }] },
    ],
  }))
  assert.ok('calcudoku' in prepared)
  const reopened = readImportedCalcudoku(prepared.calcudoku.id)
  assert.deepEqual(reopened?.puzzle.inequalities, [{ less: 47, greater: 48 }])
  assert.equal(solveLatin(reopened!.puzzle).solution?.join(''), solved)
})

test('cage-only 7 × 7 Coach exports still use the boxless Sudoku rules', async () => {
  const imported = await detectPuzzle(coachCode({
    gridSize: 7, regions: [], givenDigits: '0'.repeat(49),
    givenConstraints: [{ type: 'cage', segments: [{ cells: [0, 1], parameters: { sum: 3 } }] }],
  }))
  assert.equal(imported.calcudoku, undefined)
  assert.deepEqual(imported.grid, { size: 7, noRegions: true })
  assert.deepEqual(imported.sizedRules, [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }] }])
})

test('Coach color indices use capital letters before lowercase letters', async () => {
  const prepared = await preparePlayableImport(coachCode({
    gridSize: 3, regions: [], givenDigits: '023312231',
    givenConstraints: [{ type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }],
    givenColours: 'A,a,,,,,,,',
    colours: ['green', ...Array(9).fill('white'), 'blue', ...Array(25).fill('white'), 'purple'],
  }))
  assert.ok('calcudoku' in prepared)
  assert.deepEqual(prepared.calcudoku.cellColors?.slice(0, 2), ['blue', 'purple'])
})

test('portable links retain older CSS colors and Coach palette names', async () => {
  const { calcudoku } = await detectPuzzle(fixture.code)
  assert.ok(calcudoku)
  const colors = [...calcudoku.colors]
  colors[0] = 'teal'
  colors[1] = 'blueHeavy'
  const entry = prepareImportedCalcudoku({ ...calcudoku, colors }, { 8: 'add' })
  assert.deepEqual(readImportedCalcudoku(entry.id)?.cellColors, colors)
})

test('Current State survives the choice of an unsigned cage operation and reopening the portable board', async () => {
  const source = {
    gridSize: 3, regions: [], givenDigits: '003312231',
    givenConstraints: [{ type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3' } }] }],
  }
  const prepared = await preparePlayableImport(coachCode({
    ...source, userDigits: '203000000',
    userCellCandidates: '0-6-0-0-0-0-0-0-0',
    userBoxCandidates: '0-4-0-0-0-0-0-0-0',
  }))
  assert.ok('calcudokuSource' in prepared)
  const entry = prepareImportedCalcudoku(prepared.calcudokuSource, { 0: 'add' })
  assert.equal(solveLatin(entry.puzzle).solution?.join(''), '123312231')
  assert.deepEqual(entry.initialPosition, {
    values: [2, 0, 0, 0, 0, 0, 0, 0, 0], notes: [0, 3, 0, 0, 0, 0, 0, 0, 0], cornerNotes: [0, 2, 0, 0, 0, 0, 0, 0, 0],
  })
  assert.deepEqual(readImportedCalcudoku(entry.id)?.initialPosition, entry.initialPosition)
  assert.equal(readImportedCalcudoku(entry.id + '0000000'), undefined)
})

test('Calcudoku retains player annotations after assigning an unsigned operation', async () => {
  const preview = await preparePlayableImport(coachCode({
    gridSize: 3, regions: [], givenDigits: '003312231',
    givenConstraints: [{ type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3' } }] }],
    colours: ['green', 'blue', 'orange'],
    givenColours: '01,,,,,,,,',
    userColours: '2,,,,,,,,',
    cells: { 3: { quickSymbol: { shape: 'square', colour: 'orange' } } },
  }))
  assert.ok('calcudokuSource' in preview)
  const entry = prepareImportedCalcudoku(preview.calcudokuSource, { 0: 'add' })
  assert.equal(entry.initialPosition?.annotationsHidden, false)
  assert.ok(entry.initialPosition?.values.every(value => value === 0))
  assert.deepEqual(entry.annotations?.givenColors, { 0: ['blue', 'green'] })
  assert.deepEqual(entry.annotations?.cellColors, { 0: ['orange'] })
  assert.deepEqual(entry.annotations?.drawings, [{ shape: 'square', at: [.5, 1.5], color: 'orange' }])
  const reopened = readImportedCalcudoku(entry.id)
  assert.equal(reopened?.id, entry.id)
  assert.deepEqual(reopened?.annotations, entry.annotations)
  assert.deepEqual(reopened?.initialPosition, entry.initialPosition)
  await assert.rejects(preparePlayableImport(coachCode({
    gridSize: 3, regions: [], givenDigits: '003312231',
    givenConstraints: [{ type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '3+' } }] }],
    colours: ['green'], userCellCandidatesColours: '0+4+0',
  })), /invalid or unsupported candidate colors/)
})
