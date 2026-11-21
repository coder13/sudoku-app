import assert from 'node:assert/strict'
import test from 'node:test'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { endpointLineRule } from '../src/latin/endpoint-lines.ts'
import { bit, checkLatin, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const size = 6
const solution = '123456234561345612456123561234612345'
const holes = [0, 3, 6, 9, 18, 21, 24, 27]
const givens = Array.from(solution, (digit, i) => holes.includes(i) ? '0' : digit).join('')
const paths = [[2, 3, 4], [2, 1, 0]]
const between = { type: 'betweenLine', settings: { bulbSize: 60 }, segments: paths.map(cells => ({ cells, parameters: {} })) }
const inequality = { type: 'greaterLess', segments: [{ cells: [6, 7] }] }

function source(...givenConstraints: object[]) {
  return coachCode({ gridSize: size, regions: [], givenDigits: givens, givenConstraints })
}

test('Between Lines and inequalities both affect the solution of a portable Futoshiki import', async () => {
  await assert.rejects(preparePlayableImport(source(between)), /more than one solution/)
  await assert.rejects(preparePlayableImport(source(inequality)), /more than one solution/)
  const preview = await preparePlayableImport(source(between, inequality))
  assert.ok('futoshiki' in preview)
  const entry = readImportedFutoshiki(preview.futoshiki.id)
  assert.ok(entry)
  assert.deepEqual(entry.puzzle.pathClues, paths.map(cells => ({ type: 'between', cells })))
  assert.equal(solveLatin(entry.puzzle).solution?.join(''), solution)
  assert.equal(checkLatin(entry.puzzle, Array.from(solution, Number)).complete, true)

  const conflicting = [0, 0, 0, 1]
  assert.deepEqual(checkLatin(entry.puzzle, conflicting).conflicts.filter(rule => rule.kind === 'between').map(rule => rule.cells), [paths[0]])
  const hint = findLatinHints(entry.puzzle, []).find(hint => hint.cell === 3)
  assert.equal(hint?.value, 4)
  assert.ok(hint?.rules.some(rule => rule.kind === 'between'))
  assert.equal(findLatinSolutionHints(entry.puzzle, []).length, holes.length)
})

test('a single Calcudoku export needs its Between Line, Lockout Line, and cage', async () => {
  const empty = [...holes, 12, 15, 30, 33]
  const data = {
    gridSize: size, regions: [],
    givenDigits: Array.from(solution, (digit, cell) => empty.includes(cell) ? '0' : digit).join(''),
  }
  const lines = [
    { type: 'betweenLine', segments: [{ cells: [8, 9, 10] }] },
    { type: 'lockoutLine', segments: [{ cells: [19, 20, 21] }] },
    { type: 'cage', segments: [{ cells: [12, 13], parameters: { sum: 7 } }] },
  ]
  for (const omitted of lines) {
    await assert.rejects(preparePlayableImport(coachCode({
      ...data, givenConstraints: lines.filter(layer => layer !== omitted),
    })), /more than one solution/)
  }
  const preview = await preparePlayableImport(coachCode({ ...data, givenConstraints: lines }))
  assert.ok('calcudoku' in preview)
  const entry = readImportedCalcudoku(preview.calcudoku.id)
  assert.ok(entry)
  assert.deepEqual(entry.puzzle.pathClues, [
    { type: 'between', cells: [8, 9, 10] }, { type: 'lockout', cells: [19, 20, 21] },
  ])
  assert.equal(solveLatin(entry.puzzle).solution?.join(''), solution)
  const hints = findLatinSolutionHints(entry.puzzle, [])
  assert.equal(hints.length, empty.length)
  for (const [cell, kind] of [[9, 'between'], [21, 'lockout']] as const) {
    assert.ok(hints.find(hint => hint.cell === cell)?.rules.some(rule => rule.kind === kind))
  }
})

test('unsupported Between settings, short paths, and duplicate cells fail on import', async () => {
  await assert.rejects(preparePlayableImport(source({ ...between, settings: { inclusive: true } })), /unsupported settings/)
  await assert.rejects(preparePlayableImport(source({ ...between, segments: [{ cells: [0, 2] }] })), /invalid Between line/)
  await assert.rejects(preparePlayableImport(source({ ...between, segments: [{ cells: [0, 1, 0] }] })), /invalid line clues/)
})

test('the Between rule matches direct enumeration for partial domains in both orientations', () => {
  const size = 4
  const rule = endpointLineRule(size, [0, 1, 2], 'between')
  const digits = [1, 2, 3, 4]
  const valid = digits.flatMap(first => digits.flatMap(middle => digits
    .filter(last => Math.min(first, last) < middle && middle < Math.max(first, last))
    .map(last => [bit(first), bit(middle), bit(last)])))
  for (let a = 1; a < 16; a++) for (let b = 1; b < 16; b++) for (let c = 1; c < 16; c++) {
    const domains = [a, b, c]
    const expected = [0, 0, 0]
    for (const tuple of valid) {
      if (tuple.every((digit, i) => digit & domains[i])) tuple.forEach((digit, i) => { expected[i] |= digit })
    }
    assert.deepEqual(rule.support(domains), expected[0] ? expected : null)
  }
  const manyCells = endpointLineRule(size, [0, 1, 2, 3], 'between')
  assert.deepEqual(manyCells.support([bit(4), bit(2), bit(2), bit(1)]), [bit(4), bit(2), bit(2), bit(1)])
})
