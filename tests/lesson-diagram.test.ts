import assert from 'node:assert/strict'
import test from 'node:test'
import type { Deduction } from '../src/sudoku/engine.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'

const mask = (...digits: number[]) => digits.reduce((value, digit) => value | 1 << (digit - 1), 0)

test('WXYZ-Wing explains the restricted digits, required digit, and exact target visibility', () => {
  const candidates = Array(81).fill(0)
  candidates[33] = mask(5, 8)
  candidates[69] = mask(5, 9)
  candidates[74] = mask(1, 8)
  candidates[78] = mask(1, 5, 9)
  candidates[29] = mask(1, 8)
  const deduction: Deduction = {
    technique: 'wxyz-wing', actions: [{ eliminate: { cell: 29, digit: 8 } }],
    evidence: { 'wxyz-wing': { cells: [33, 69, 74, 78], digits: [1, 5, 8, 9], unrestricted: 8 } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.deepEqual(diagram.reasonSteps, [
    'The 1 candidates at R9C3 and R9C7 share row 9. So 1 can fill at most one highlighted cell.',
    'The 5 candidates at R4C7, R8C7, and R9C7 share column 7. So 5 can fill at most one highlighted cell.',
    'The 9 candidates at R8C7 and R9C7 share column 7. So 9 can fill at most one highlighted cell.',
    'The other three digits can fill at most three cells. There are four cells to fill, so at least one must contain 8.',
    '8 must therefore appear in R4C7 or R9C3.',
    'R4C3 sees R4C7 through row 4 and R9C3 through column 3. It therefore cannot contain 8.',
  ])
  assert.doesNotMatch(diagram.reason, /fourth cell|exactly one.*8/)
  assert.deepEqual(diagram.results, ['Remove 8 from R4C3.'])
})

test('WXYZ-Wing handles all four restricted digits without inventing an unrestricted digit', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 2)
  candidates[3] = mask(2, 3)
  candidates[30] = mask(3, 4)
  candidates[27] = mask(1, 4)
  candidates[54] = mask(1, 5)
  const deduction: Deduction = {
    technique: 'wxyz-wing', actions: [{ eliminate: { cell: 54, digit: 1 } }],
    evidence: { 'wxyz-wing': { cells: [0, 3, 27, 30], digits: [1, 2, 3, 4], unrestricted: null } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.equal(diagram.reasonSteps?.[4], 'All four digits can fill at most one cell each. The four cells must therefore contain each digit exactly once.')
  assert.ok(diagram.reason.includes('1 must therefore appear in R1C1 or R4C1.'))
  assert.doesNotMatch(diagram.reason, /null|undefined|other three/)
  assert.equal(diagram.accentLabel, undefined)
})
