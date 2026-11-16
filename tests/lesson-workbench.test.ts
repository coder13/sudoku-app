import assert from 'node:assert/strict'
import test from 'node:test'
import { enter, paintCandidate, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { latestLessonActions, makeLessonGame, revealLessonAction } from '../src/sudoku/lesson-workbench.ts'

const puzzle = {
  givens: '1' + '0'.repeat(80), entries: '02' + '0'.repeat(79),
  candidates: Array.from({ length: 81 }, (_, cell) => cell > 1 ? (1 << 2) | (1 << 3) : 0),
}

test('lesson tooling fixes the starting grid and keeps the source position unchanged', () => {
  const original = structuredClone(puzzle)
  const game = makeLessonGame(puzzle)
  assert.equal(valuesOf(game), '12' + '0'.repeat(79))
  assert.equal(enter(game, [0, 1], 'value', 0), game)
  const edited = enter(game, [2], 'value', 3)
  assert.equal(valuesOf(edited)[2], '3')
  assert.deepEqual(puzzle, original)
  assert.deepEqual(game.past, [])
  assert.deepEqual(latestLessonActions(edited), [{ place: { cell: 2, digit: 3 } }])
})

test('practice move tracking follows candidate edits, undo, and redo without treating colors as answers', () => {
  const initial = makeLessonGame(puzzle)
  const removed = enter(initial, [2, 3], 'candidate', 3)
  const actions = [{ eliminate: { cell: 2, digit: 3 } }, { eliminate: { cell: 3, digit: 3 } }]
  assert.deepEqual(latestLessonActions(removed), actions)
  const colored = paintCandidate(enter(removed, [4], 'color', 2), { cell: 4, digit: 4 }, 5)
  assert.deepEqual(latestLessonActions(colored), actions)
  assert.deepEqual(latestLessonActions(undo(removed)), [])
  assert.deepEqual(latestLessonActions(redo(undo(removed))), actions)
  assert.deepEqual(latestLessonActions(enter(initial, [4], 'color', 2)), [])
})

test('revealing a lesson action starts from the verified grid and can be undone', () => {
  const initial = makeLessonGame(puzzle)
  const shown = revealLessonAction(initial, { eliminate: { cell: 2, digit: 3 } })
  assert.deepEqual(latestLessonActions(shown), [{ eliminate: { cell: 2, digit: 3 } }])
  assert.deepEqual(undo(shown).position, initial.position)
  assert.deepEqual(latestLessonActions(initial), [])
})
