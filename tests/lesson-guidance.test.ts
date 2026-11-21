import assert from 'node:assert/strict'
import test from 'node:test'
import type { Deduction, InferenceNode, PracticeExercise } from '../src/sudoku/engine.ts'
import { practiceClueAnnotations, practiceSearch } from '../src/sudoku/lesson-guidance.ts'

const group: InferenceNode = { group: { cells: [0, 1], digit: 4 } }
const a: InferenceNode = { candidate: { cell: 3, digit: 4 } }
const b: InferenceNode = { candidate: { cell: 30, digit: 4 } }
const end: InferenceNode = { candidate: { cell: 27, digit: 4 } }

function exercise(deduction: Deduction): PracticeExercise {
  return {
    givens: '0'.repeat(81), entries: '0'.repeat(81), eliminations: Array(81).fill(0),
    candidates: Array(81).fill(511), answers: deduction.actions, suggestion: deduction.actions[0], deduction,
  }
}

test('grouped practice starts with the whole group and explains all-member conflicts', () => {
  const practice = exercise({
    technique: 'grouped-aic', actions: [{ eliminate: { cell: 9, digit: 4 } }],
    evidence: { inference: { links: [
      { from: group, to: a, source: { house: { row: 0 } }, strength: 'strong' },
      { from: a, to: b, source: { house: { column: 3 } }, strength: 'weak' },
      { from: b, to: end, source: { house: { row: 3 } }, strength: 'strong' },
    ] } },
  })
  const search = practiceSearch(practice)
  assert.match(search.start.text, /at least one member is true/)
  assert.match(search.start.text, /false only when every member is false/)
  const start = practiceClueAnnotations(search.start)
  assert.deepEqual([...start.candidates!.keys()], [0, 1])
  assert.deepEqual(start.groups, [{
    point: { cells: [0, 1], digit: 4 }, color: 'var(--lesson-pattern)', label: 'Chain start group: 4 in R1C1 or R1C2',
  }])
  assert.equal(start.links, undefined)
  assert.match(search.check.text, /each outlined group as one end of a link/)
  assert.equal(search.check.links?.length, 2)
  assert.deepEqual(search.check.links?.[0].from, { cells: [0, 1], digit: 4 })
  assert.match(search.follow!, /every candidate at both ends/)
})

test('grouped loop practice names the complete group at the join', () => {
  const practice = exercise({
    technique: 'grouped-continuous-nice-loop', actions: [{ eliminate: { cell: 9, digit: 4 } }],
    evidence: { inference: { links: [
      { from: group, to: a, source: { house: { row: 0 } }, strength: 'strong' },
      { from: a, to: b, source: { house: { column: 3 } }, strength: 'weak' },
      { from: b, to: end, source: { house: { row: 3 } }, strength: 'strong' },
      { from: end, to: group, source: { peers: {} }, strength: 'weak' },
    ] } },
  })
  const search = practiceSearch(practice)
  assert.match(search.follow!, /back to 4 in R1C1 or R1C2/)
  assert.match(search.follow!, /conflicts with a group only if it conflicts with every member/)
})

test('ordinary chain practice keeps single-candidate guidance and no group outline', () => {
  const practice = exercise({
    technique: 'x-chain', actions: [{ eliminate: { cell: 9, digit: 4 } }],
    evidence: { chain: { links: [
      { from: { cell: 0, digit: 4 }, to: { cell: 3, digit: 4 }, source: { house: { row: 0 } }, strength: 'strong' },
      { from: { cell: 3, digit: 4 }, to: { cell: 30, digit: 4 }, source: { house: { column: 3 } }, strength: 'weak' },
      { from: { cell: 30, digit: 4 }, to: { cell: 27, digit: 4 }, source: { house: { row: 3 } }, strength: 'strong' },
    ] } },
  })
  const search = practiceSearch(practice)
  assert.equal(search.start.text, 'Start at 4 in R1C1. Look for a strong link in row 1.')
  assert.equal(practiceClueAnnotations(search.start).groups, undefined)
  assert.doesNotMatch(search.check.text, /group|member/)
  assert.match(search.follow!, /conflicts with both ends/)
})

test('an early practice clue does not refer to a group that appears later in the chain', () => {
  const sequence: InferenceNode[] = [
    { candidate: { cell: 9, digit: 2 } }, { candidate: { cell: 27, digit: 2 } },
    { candidate: { cell: 30, digit: 2 } }, { candidate: { cell: 30, digit: 1 } },
    { candidate: { cell: 3, digit: 1 } }, { group: { cells: [0, 1], digit: 1 } },
  ]
  const practice = exercise({
    technique: 'grouped-aic', actions: [{ eliminate: { cell: 9, digit: 1 } }],
    evidence: { inference: { links: sequence.slice(1).map((to, index) => ({
      from: sequence[index], to, source: { peers: {} }, strength: index % 2 === 0 ? 'strong' : 'weak',
    })) } },
  })
  const search = practiceSearch(practice)
  assert.doesNotMatch(search.start.text, /group/)
  assert.doesNotMatch(search.check.text, /group/)
  assert.equal(practiceClueAnnotations(search.start).groups, undefined)
  assert.match(search.follow!, /1 in R1C1 or R1C2/)
  assert.match(search.follow!, /every candidate at both ends/)
})
