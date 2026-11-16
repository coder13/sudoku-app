import assert from 'node:assert/strict'
import test from 'node:test'
import type { Deduction } from '../src/sudoku/engine.ts'
import { describeHint, describeHintRemovals, describeSingleHint, moveHintIndex, techniqueLabel } from '../src/sudoku/hints.ts'

test('Next wraps the hint list while Previous stops at the first hint', () => {
  assert.equal(moveHintIndex(8, 10, 1), 9)
  assert.equal(moveHintIndex(9, 10, 1), 0)
  assert.equal(moveHintIndex(0, 10, -1), 0)
  assert.equal(moveHintIndex(9, 10, -1), 8)
  assert.equal(moveHintIndex(0, 1, 1), 0)
  assert.equal(moveHintIndex(0, 0, 1), 0)
})

test('hint copy uses Sudoku terms and one-based cell coordinates', () => {
  assert.deepEqual(describeHint({
    technique: 'hidden-single',
    evidence: { cell: 0 },
    actions: [{ place: { cell: 40, digit: 5 } }],
  }), {
    title: 'Hidden single',
    text: 'Place digit 5 in row 5, column 5.',
  })

  const elimination = {
    technique: 'x-wing',
    evidence: { cell: 0 },
    actions: [{ eliminate: { cell: 8, digit: 7 } }],
  } satisfies Deduction
  for (const difficulty of ['hard', 'unfair', 'extreme'] as const) {
    assert.deepEqual(describeHint(elimination, { difficulty }), {
      title: 'X-wing',
      text: 'Remove digit 7 from the candidates in r1c9.',
    })
  }
  assert.match(describeHint(elimination, { difficulty: 'medium' }).text, /row 1, column 9/)
  assert.match(describeHint(elimination, { difficulty: 'hard', cellReferenceStyle: 'verbose' }).text, /row 1, column 9/)
  assert.match(describeHint(elimination, { difficulty: 'easy', cellReferenceStyle: 'concise' }).text, /r1c9/)
})

test('technique labels preserve common Sudoku capitalization', () => {
  assert.equal(techniqueLabel('als-xz'), 'ALS-XZ')
  assert.equal(techniqueLabel('naked-pair'), 'Naked pair')
})

test('hints describe all removals so deductions with the same first removal look different', () => {
  const first = { eliminate: { cell: 0, digit: 2 } }
  const single: Deduction = { technique: 'naked-triple', evidence: { cell: 0 }, actions: [first] }
  const multiple: Deduction = {
    ...single,
    actions: [first, { eliminate: { cell: 1, digit: 2 } }, { eliminate: { cell: 1, digit: 5 } }],
  }
  assert.notEqual(describeHint(single).text, describeHint(multiple).text)
  assert.equal(describeHint(multiple, { cellReferenceStyle: 'concise' }).text,
    'Remove digit 2 from the candidates in r1c1 and r1c2. Remove digit 5 from the candidates in r1c2.')
})

test('single fallback uses the same cell and digit terminology', () => {
  assert.deepEqual(describeSingleHint([40, 5]), {
    title: 'Single',
    text: 'Place digit 5 in row 5, column 5.',
  })
  assert.equal(describeSingleHint([40, 5], 'concise').text, 'Place digit 5 in r5c5.')
})

test('structured removals group cells by digit and preserve reference preferences', () => {
  const deduction: Deduction = {
    technique: '3d-medusa', evidence: { cell: 0 },
    actions: [
      { eliminate: { cell: 27, digit: 1 } },
      { eliminate: { cell: 60, digit: 1 } },
      { eliminate: { cell: 29, digit: 8 } },
      { eliminate: { cell: 27, digit: 1 } },
    ],
  }
  assert.deepEqual(describeHintRemovals(deduction, { difficulty: 'unfair' }), [
    { digit: 1, cells: ['r4c1', 'r7c7'] }, { digit: 8, cells: ['r4c3'] },
  ])
  assert.equal(describeHintRemovals(deduction, { difficulty: 'unfair', cellReferenceStyle: 'verbose' })[0].cells[0], 'row 4, column 1')
  assert.deepEqual(describeHintRemovals({ ...deduction, actions: [{ place: { cell: 27, digit: 1 } }] }), [])
  assert.deepEqual(describeHintRemovals({ ...deduction, actions: [] }), [])
})
