import assert from 'node:assert/strict'
import test from 'node:test'
import type { Deduction, HintChoice } from '../src/sudoku/engine.ts'
import { hintLocation, lessonDiagram } from '../src/sudoku/lesson-diagram.ts'

const mask = (...digits: number[]) => digits.reduce((value, digit) => value | 1 << (digit - 1), 0)

test('AIC location reveals the endpoint candidates without revealing links or the removal', () => {
  const start = { candidate: { cell: 3, digit: 4 } }
  const inner = { candidate: { cell: 21, digit: 4 } }
  const end = { candidate: { cell: 26, digit: 6 } }
  const hint: HintChoice = {
    technique: 'aic', actions: [{ eliminate: { cell: 8, digit: 6 } }],
    evidence: { inference: { links: [
      { from: start, to: inner, source: { house: { column: 3 } }, strength: 'strong' },
      { from: inner, to: end, source: { peers: {} }, strength: 'weak' },
    ] } },
  }
  const clue = hintLocation(hint, 'concise')
  assert.ok(clue)
  assert.equal(clue.text, 'Chain starts at 4 in r1c4. It ends at 6 in r3c9.')
  assert.deepEqual([...clue.annotations.cells!.keys()], [3, 26])
  assert.equal(clue.annotations.candidates?.get(3)?.get(4)?.label, 'chain start')
  assert.equal(clue.annotations.candidates?.get(26)?.get(6)?.label, 'chain end')
  assert.equal(clue.annotations.candidates?.size, 2)
  assert.equal(clue.annotations.links, undefined)
})

test('Grouped AIC location shows all candidates in an endpoint group', () => {
  const hint: HintChoice = {
    technique: 'grouped-aic', actions: [{ eliminate: { cell: 3, digit: 4 } }],
    evidence: { inference: { links: [{
      from: { group: { cells: [0, 1], digit: 4 } }, to: { candidate: { cell: 2, digit: 4 } },
      source: { house: { row: 0 } }, strength: 'strong',
    }] } },
  }
  const clue = hintLocation(hint, 'concise')
  assert.ok(clue)
  assert.equal(clue.text, 'Chain starts at 4 in r1c1 or r1c2. It ends at 4 in r1c3.')
  const marks = clue.annotations.candidates
  assert.equal(marks?.get(0)?.get(4)?.label, 'chain start')
  assert.equal(marks?.get(1)?.get(4)?.label, 'chain start')
  assert.equal(marks?.get(2)?.get(4)?.label, 'chain end')
})

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
