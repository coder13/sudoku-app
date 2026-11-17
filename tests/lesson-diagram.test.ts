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
    'Only 8 can fill more than one of the four cells. The 1 candidates share row 9. The 5 candidates share column 7. The 9 candidates share column 7.',
    'The other three digits can fill at most three cells. At least one of the four cells must take 8.',
    'At least one of R4C7 and R9C3 must take 8. Putting 8 in R4C3 would block all of those spots.',
  ])
  assert.doesNotMatch(diagram.reason, /fourth cell|exactly one.*8/)
  assert.equal(diagram.accentLabel, 'Required digit')
  assert.deepEqual(diagram.results, ['Remove 8 from R4C3.'])
})

test('WXYZ-Wing handles all four restricted digits without inventing an unrestricted digit', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 2)
  candidates[3] = mask(2, 3)
  candidates[30] = mask(3, 4)
  candidates[27] = mask(1, 4)
  candidates[28] = mask(4, 5)
  candidates[54] = mask(1, 5)
  const deduction: Deduction = {
    technique: 'wxyz-wing', actions: [{ eliminate: { cell: 54, digit: 1 } }, { eliminate: { cell: 28, digit: 4 } }],
    evidence: { 'wxyz-wing': { cells: [0, 3, 27, 30], digits: [1, 2, 3, 4], unrestricted: null } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.equal(diagram.reasonSteps?.[1], 'Four cells need four digits, so each digit must appear once.')
  assert.match(diagram.reason, /At least one of R1C1 and R4C1 must take 1/)
  assert.match(diagram.reason, /At least one of R4C1 and R4C4 must take 4/)
  assert.doesNotMatch(diagram.reason, /null|undefined|other three/)
  assert.equal(diagram.accentLabel, undefined)
})

test('Doubly linked ALS-XZ explains a removal supported by only one of the two sets', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 2, 3)
  candidates[1] = mask(2, 3)
  candidates[3] = mask(1, 4)
  candidates[4] = mask(2, 4)
  candidates[6] = mask(1, 5)
  candidates[10] = mask(3, 5)
  candidates[13] = mask(3, 4)
  const deduction: Deduction = {
    technique: 'als-xz', actions: [{ eliminate: { cell: 6, digit: 1 } }, { eliminate: { cell: 10, digit: 3 } }],
    evidence: { 'als-xz': { sets: [
      { cells: [0, 1], digits: [1, 2, 3] }, { cells: [3, 4, 13], digits: [1, 2, 3, 4] },
    ], links: [1, 2] } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.match(diagram.reason, /One set must skip 1 and the other must skip 2/)
  assert.match(diagram.reason, /At least one of R1C1 and R1C4 must take 1/)
  assert.match(diagram.reason, /At least one of R1C1 and R1C2 must take 3\. Putting 3 in R2C2/)
})

test('ALS-XY-Wing names the middle set and the digit passed to the last set', () => {
  const candidates = Array(81).fill(0)
  candidates[0] = mask(1, 8)
  candidates[3] = mask(1, 2)
  candidates[12] = mask(2, 8)
  candidates[9] = mask(7, 8)
  const deduction: Deduction = {
    technique: 'als-xy-wing', actions: [{ eliminate: { cell: 9, digit: 8 } }],
    evidence: { 'als-chain': { sets: [
      { cells: [0], digits: [1, 8] }, { cells: [3], digits: [1, 2] }, { cells: [12], digits: [2, 8] },
    ], links: [1, 2] } },
  }
  const diagram = lessonDiagram({ deduction, candidates })
  assert.match(diagram.reason, /If it skips 8, it must use 1/)
  assert.match(diagram.reason, /rules out 1 in set 2 \(R1C4\)\. This set must use 2/)
  assert.match(diagram.reason, /rules out 2 in set 3 \(R2C4\)\. This set must use 8/)
  assert.match(diagram.reason, /At least one of R1C1 and R2C4 must take 8/)
})
