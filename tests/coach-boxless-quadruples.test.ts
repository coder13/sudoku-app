import assert from 'node:assert/strict'
import test from 'node:test'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { latinQuadrupleRules } from '../src/latin/quadruples.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const solution = Array.from('1234214334124321', Number)
const givens = '0034004334124321'
const swap = Array.from('2134124334124321', Number)
const clue = { topLeft: 5, digits: [1, 1, 4, 4] }
const cells = [5, 6, 9, 10]
const quadrupleLayer = (topLeft = 5, digits = '1144') => ({
  type: 'quadruple', segments: [{ cells: [topLeft], parameters: { digits } }],
})
const cage = { type: 'cosmeticCage', segments: [{ cells: [10, 11], parameters: { sum: '3+' } }] }
const puzzleCode = (layers: readonly unknown[], userDigits?: string) => coachCode({
  gridSize: 4, regions: [], givenDigits: givens, givenConstraints: layers, userDigits,
})

test('Quadruple support matches direct digit counts and boxless peers', () => {
  const touching = [0, 1, 9, 10]
  let random = 12
  for (const digits of [[1], [9, 9], [2, 6], [3, 3, 8], [5, 5, 9, 9], [1, 4, 5, 7], [1, 1, 1]]) {
    for (const [main, other] of [[false, false], [true, false], [false, true], [true, true]]) {
      const extra = [...(main ? [[0, 10]] : []), ...(other ? [[1, 9]] : [])]
      const [rule] = latinQuadrupleRules(9, [{ topLeft: 0, digits }], extra)
      const rank = Array.from({ length: 9 }, (_, index) => index + 1)
      const patterns = [Array<number>(4).fill(511)]
      for (let i = 0; i < 16; i++) patterns.push(Array.from({ length: 4 }, () => {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0
        return random >>> 23
      }))
      for (const masks of patterns) {
        const domains = Array<number>(81).fill(511)
        touching.forEach((cell, index) => { domains[cell] = masks[index] })
        const allowed = masks.map(mask => rank.filter(digit => mask & bit(digit)))
        const expected = [0, 0, 0, 0]
        for (const a of allowed[0]) for (const b of allowed[1]) for (const c of allowed[2]) for (const d of allowed[3]) {
          if (a === b || a === c || b === d || c === d || main && a === d || other && b === c) continue
          const assignment = [a, b, c, d]
          if (digits.every(digit => assignment.filter(value => value === digit).length >= digits.filter(value => value === digit).length)) {
            assignment.forEach((digit, index) => { expected[index] |= bit(digit) })
          }
        }
        assert.deepEqual(rule.support(domains), expected[0] ? expected : null, JSON.stringify({ digits, extra, masks }))
      }
    }
  }
})

test('a printed repeat forces the boxless completion in both standalone games', async () => {
  const base = (await detectPuzzle(puzzleCode([]))).futoshiki!.puzzle
  assert.equal(solveLatin(base).status, 'multiple')
  assert.equal(checkLatin(base, swap).complete, true)

  const futo = await preparePlayableImport(puzzleCode([quadrupleLayer()]))
  assert.ok('futoshiki' in futo)
  const calc = await preparePlayableImport(puzzleCode([quadrupleLayer(), cage], '1000000000000000'))
  assert.ok('calcudoku' in calc)
  const f = readImportedFutoshiki(futo.futoshiki.id)!
  const c = readImportedCalcudoku(calc.calcudoku.id)!
  assert.equal(c.puzzle.cages[0].target, 3)
  assert.equal(c.initialPosition?.values[0], 1)
  assert.match(c.id, /\.q0541144\.p/)
  for (const { id, puzzle } of [f, c]) {
    assert.match(id, /\.q0541144(?:\.|$)/)
    assert.deepEqual(puzzle.quadruples, [clue])
    const result = solveLatin(puzzle)
    assert.equal(result.status, 'unique')
    assert.deepEqual(result.solution, solution)
    assert.deepEqual(checkLatin(puzzle, swap).conflicts.map(rule => rule.cells), [cells])
    const hints = findLatinSolutionHints(puzzle, [])
    assert.equal(hints.length, 4)
    assert.deepEqual(hints.find(hint => hint.cell === 5)?.rules.find(rule => rule.kind === 'quadruple')?.cells, cells)
  }

  for (const malformed of ['054114', '0541145', '0341144', '0c41144', '0540144', '050']) {
    assert.equal(readImportedFutoshiki(f.id.replace('0541144', malformed)), undefined)
    assert.equal(readImportedCalcudoku(c.id.replace('0541144', malformed)), undefined)
  }
})

test('a seven-cell-wide boxless grid with Quadruples uses standalone Play', async () => {
  const givenDigits = Array.from({ length: 49 }, (_, cell) => 1 + (Math.floor(cell / 7) + cell % 7) % 7).join('')
  const input = coachCode({ gridSize: 7, regions: [], givenDigits, givenConstraints: [quadrupleLayer(0, '1223')] })
  const imported = await preparePlayableImport(input)
  assert.ok('futoshiki' in imported)
  const puzzle = readImportedFutoshiki(imported.futoshiki.id)!.puzzle
  assert.deepEqual(puzzle.rules.find(rule => rule.kind === 'quadruple')?.cells, [0, 1, 7, 8])
})

test('invalid Quadruple coordinates, digits and settings fail closed', async () => {
  for (const layer of [quadrupleLayer(7), quadrupleLayer(12), quadrupleLayer(1.5), quadrupleLayer(0, '5'), quadrupleLayer(0, '12344')]) {
    await assert.rejects(detectPuzzle(puzzleCode([layer])), /invalid Quadruple clue/)
  }
  await assert.rejects(detectPuzzle(puzzleCode([{ ...quadrupleLayer(), settings: { negative: true } }])), /unsupported settings/)
})
