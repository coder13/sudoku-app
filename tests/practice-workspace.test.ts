import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { LessonPosition } from '../src/sudoku/engine.ts'
import { enter, redo, undo } from '../src/sudoku/game.ts'
import { makeLessonGame } from '../src/sudoku/lesson-workbench.ts'
import { practiceActions } from '../src/sudoku/practice-workspace.ts'

const positions = JSON.parse(readFileSync(new URL('../src/sudoku/practice-positions.json', import.meta.url), 'utf8')) as LessonPosition[]

test('practice proposes explicit edits while preserving the prepared position and ignoring annotations', () => {
  const fixture = positions.find(({ entries }) => entries.includes('1'))!
  const initial = makeLessonGame(fixture)
  const preparedCell = [...fixture.entries].findIndex((digit) => digit !== '0')
  assert.equal(enter(initial, [preparedCell], 'value', 0), initial)
  assert.deepEqual(practiceActions(initial, enter(initial, [preparedCell], 'color', 2)), [])

  const cell = fixture.candidates.findIndex(Boolean)
  const digit = Math.log2(fixture.candidates[cell] & -fixture.candidates[cell]) + 1
  const placed = enter(initial, [cell], 'value', digit)
  assert.deepEqual(practiceActions(initial, placed), [{ place: { cell, digit } }])
  const removed = enter(initial, [cell], 'candidate', digit)
  assert.deepEqual(practiceActions(initial, removed), [{ eliminate: { cell, digit } }])
  assert.deepEqual(practiceActions(initial, undo(removed)), [])
  assert.deepEqual(practiceActions(initial, redo(undo(removed))), [{ eliminate: { cell, digit } }])
  assert.equal(initial.position.corner[cell], fixture.candidates[cell])
})
