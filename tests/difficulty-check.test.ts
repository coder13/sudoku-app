import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextDifficultyCheck, type DifficultyCheck } from '../src/sudoku/difficulty-check.ts'

const first: DifficultyCheck = { id: 'test', level: 'medium', lower: 0, upper: 9, attempts: 0, gameId: 'initial' }

test('a check steps among nearby levels and confirms the level that felt right', () => {
  const harder = nextDifficultyCheck(first, 'too-easy')
  assert.equal(harder.level, 'tricky')
  assert.equal(harder.lower, 3)
  assert.equal(harder.gameId, undefined)
  assert.equal(nextDifficultyCheck(harder, 'about-right').recommendation, 'tricky')
  assert.equal(nextDifficultyCheck(first, 'too-hard').level, 'easy')
})

test('feedback that brackets two tiers selects the easier tier and stops at the endpoints', () => {
  const harder = nextDifficultyCheck(first, 'too-easy')
  assert.equal(nextDifficultyCheck(harder, 'too-hard').recommendation, 'medium')
  assert.equal(nextDifficultyCheck({ ...first, level: 'beginner' }, 'too-hard').recommendation, 'beginner')
  assert.equal(nextDifficultyCheck({ ...first, level: 'impossible' }, 'too-easy').recommendation, 'impossible')
  assert.equal(nextDifficultyCheck({ ...harder, attempts: 3 }, 'too-easy').recommendation, 'tricky')
})
