import assert from 'node:assert/strict'
import { test } from 'node:test'
import { explainCandidateRecovery, findCandidateRecovery, restoreCandidate } from '../src/sudoku/candidate-recovery.ts'
import { completeCandidateMasks, enter, hintEliminations, makeGame, replaceCandidates, undo, valuesOf } from '../src/sudoku/game.ts'
import { variantHouseMasks } from '../src/sudoku/variants.ts'

const values = '540708916069140000817956423038509100150400090094801000480297501025014009971085000'
const solution = '542738916369142857817956423238569174156473298794821635483297561625314789971685342'
const puzzle = { version: 1, givens: values } as const
const cell = 14
const game = replaceCandidates(makeGame('recovery', 'Candidate recovery', values, 'imported'), variantHouseMasks(puzzle, values))

test('recovery traces a removed candidate to its move and restores it with one undo step', () => {
  const removed = enter(game, [cell], 'candidate', 2)
  const edited = enter(removed, [15], 'candidate', 7)
  const removals = hintEliminations(values, completeCandidateMasks(edited))
  assert.ok(removals)
  const recovery = findCandidateRecovery(edited, solution, removals)
  assert.deepEqual(recovery, { cell, digit: 2, layout: 'corner', movesAgo: 2 })
  assert.ok(recovery)

  const restored = restoreCandidate(edited, recovery)
  assert.equal(valuesOf(restored), values)
  assert.equal(restored.position.center, edited.position.center)
  assert.deepEqual(restored.position.corner, edited.position.corner.map((mask, index) => index === cell ? mask | 2 : mask))
  assert.equal(undo(restored).position, edited.position)
  assert.equal(restoreCandidate(restored, recovery), restored)
})

test('recovery removes only the conflicting bit from recorded eliminations', () => {
  const eliminations = Array<number>(81).fill(0)
  eliminations[cell] = 2 | 4
  eliminations[11] = 204
  const starting = makeGame('old-save', 'Old save', values, 'imported')
  const saved = { ...starting, position: { ...starting.position, eliminations } }
  const recovery = findCandidateRecovery(saved, solution, eliminations)
  assert.deepEqual(recovery, { cell, digit: 2, layout: 'corner' })
  assert.ok(recovery)
  const restored = restoreCandidate(saved, recovery)
  assert.equal(restored.position.corner[cell], 2)
  assert.equal(restored.position.eliminations?.[cell], 4)
  assert.equal(restored.position.eliminations?.[11], 204)
  assert.equal(findCandidateRecovery(enter(saved, [cell], 'value', 3), solution, eliminations), undefined)
})

test('candidate recovery explains the screenshot with a two-placement contradiction', () => {
  assert.equal(explainCandidateRecovery(game, { cell, digit: 2 }, 'concise'),
    'Suppose r2c6 is 3. This forces 2 in r1c5 and r5c6. That leaves no place for 2 in column 3. r2c6 needs 2.')
})
