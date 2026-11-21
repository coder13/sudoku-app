import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enter, makeGame, redo, replaceCandidates, setGamePaused, undo } from '../src/sudoku/game.ts'
import { canApplyPuzzleResult, samePuzzleRevision } from '../src/sudoku/puzzle-revision.ts'

const givens = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const origin = replaceCandidates(makeGame('async-board', 'Async board', givens, 'imported'), Array(81).fill(511))

test('a delayed action can accept timer and derived rating updates', () => {
  assert.equal(canApplyPuzzleResult(origin, { ...origin, elapsed: 5, difficulty: 'medium', score: 42 }), true)
})

test('a delayed candidate response cannot edit a paused or deleted puzzle', () => {
  assert.equal(canApplyPuzzleResult(origin, setGamePaused(origin, true)), false)
  assert.equal(canApplyPuzzleResult(origin, undefined), false)
  assert.equal(canApplyPuzzleResult({ ...origin, paused: true }, origin), false)
})

test('a singles response is stale when only the notes used by it have changed', () => {
  for (const mode of ['candidate', 'center', 'corner'] as const) {
    const changed = enter(origin, [2], mode, 1)
    assert.equal(changed.position.entries, origin.position.entries)
    assert.equal(changed.position.eliminations, origin.position.eliminations)
    assert.equal(canApplyPuzzleResult(origin, changed), false, mode)
  }
})

test('undo and redo cannot make an old job current by restoring its position object', () => {
  const edited = enter(origin, [2], 'value', 4)
  const restored = undo(edited)
  assert.equal(restored.position, origin.position)
  assert.equal(samePuzzleRevision(origin, restored), false)
  const reapplied = redo(restored)
  assert.equal(reapplied.position, edited.position)
  assert.equal(samePuzzleRevision(edited, reapplied), false)
})

test('a job belongs to its puzzle, rules, and play session', () => {
  assert.equal(canApplyPuzzleResult(origin, { ...origin, id: 'other-board' }), false)
  assert.equal(canApplyPuzzleResult(origin, { ...origin, source: 'draft' }), false)
  assert.equal(canApplyPuzzleResult(origin, { ...origin, givens: '0'.repeat(81) }), false)
  assert.equal(canApplyPuzzleResult(origin, { ...origin, grid: { size: 4, boxRows: 2, boxColumns: 2 } }), false)
  assert.equal(canApplyPuzzleResult(origin, { ...origin, position: { ...origin.position } }), false)
})
