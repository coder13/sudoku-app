import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCalcudoku } from '../src/calcudoku/engine.ts'
import { prepareImportedCalcudoku, readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { bit, solveLatin } from '../src/latin/engine.ts'
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
    ...data, givenConstraints: [cageLayer, { type: 'antiKnight', segments: [] }],
  })), /unsupported rule/)
  await assert.rejects(preparePlayableImport(coachCode({
    ...data, givenConstraints: [{ ...cageLayer, segments: [{ cells: [0, 1], parameters: { sum: '3+?', style: 'changed' } }] }],
  })), /invalid cage label/)
  await assert.rejects(preparePlayableImport(coachCode({
    ...data, colours: ['not-a-color'], givenColours: '0,,,,,,,,',
  })), /unsupported cell colors/)
  assert.equal(readImportedCalcudoku(prepared.calcudoku.id + 'x'), undefined)
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
