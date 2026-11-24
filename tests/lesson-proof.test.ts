import assert from 'node:assert/strict'
import test from 'node:test'
import type { LessonExample } from '../src/sudoku/engine.ts'
import { applyDeduction, EMPTY, hasCandidate, undo } from '../src/sudoku/game.ts'
import { copyLessonPosition, lessonForcingProof, proofDependencies } from '../src/sudoku/lesson-proof.ts'

const target = { cell: 26, digit: 9 }
const first = { cell: 7, digit: 8 }
const second = { cell: 26, digit: 5 }
const action = { eliminate: target }
const candidates = Array<number>(81).fill(0x1ff)
candidates[8] = 0x180
const position = { givens: EMPTY, entries: EMPTY, candidates, eliminations: candidates.map((mask) => 0x1ff & ~mask) }
const example: LessonExample = {
  ...position,
  practice: { ...position, suggestion: action, answers: [action] },
  deduction: {
    technique: 'tridagon-forcing-net',
    actions: [action],
    evidence: {
      tridagon: {
        cells: [],
        digits: [2, 4, 9],
        guardians: [first, second],
        branches: [
          { assumption: { candidate: first, truth: true }, conflict: null, steps: [
            { effect: { candidate: { cell: 8, digit: 8 }, truth: false }, scope: { house: { house: { row: 0 }, digit: 8 } }, causes: [0] },
            { effect: { candidate: { cell: 8, digit: 9 }, truth: true }, scope: { cell: 8 }, causes: [1] },
            { effect: { candidate: target, truth: false }, scope: { house: { house: { column: 8 }, digit: 9 } }, causes: [2] },
          ] },
          { assumption: { candidate: second, truth: true }, conflict: null, steps: [
            { effect: { candidate: { cell: 17, digit: 5 }, truth: false }, scope: { house: { house: { column: 8 }, digit: 5 } }, causes: [0] },
            { effect: { candidate: target, truth: false }, scope: { cell: 26 }, causes: [0] },
          ] },
        ],
      },
    },
  },
}

test('a selected removal traces its own causes within each guardian branch', () => {
  const proof = lessonForcingProof(example)
  assert.ok(proof)
  const [longer, shorter] = proof.branches
  assert.deepEqual([...proofDependencies(longer, 3)].sort(), [0, 1, 2, 3])
  assert.deepEqual([...proofDependencies(shorter, 2)].sort(), [0, 2])
  assert.match(longer[1].text, /8 in R1C8/)
})

test('a copy opens at the chosen step and can undo edits without affecting either branch', () => {
  const proof = lessonForcingProof(example)
  assert.ok(proof)
  const [firstBranch, secondBranch] = proof.branches
  const halfway = copyLessonPosition(example, firstBranch.slice(0, 2))
  assert.equal(halfway.position.entries[7], '8')
  assert.equal(halfway.position.entries[8], '0')
  assert.ok(hasCandidate(halfway.position.corner[target.cell], target.digit))
  const removed = applyDeduction(halfway, [action], halfway.position.corner)
  assert.equal(hasCandidate(removed.position.corner[target.cell], target.digit), false)
  assert.deepEqual(undo(removed).position, halfway.position)
  assert.deepEqual(undo(halfway).position, halfway.position)

  const other = copyLessonPosition(example, secondBranch)
  assert.equal(other.position.entries[7], '0')
  assert.equal(other.position.entries[26], '5')
  assert.ok(hasCandidate(example.candidates[26], 9))
  assert.equal(example.entries, EMPTY)
})
