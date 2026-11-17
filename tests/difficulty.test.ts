import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_DIFFICULTY, DIFFICULTY_LEVELS, currentDifficulty, difficultyIndex, formatPuzzleRating } from '../src/sudoku/difficulty.ts'

test('puzzle ratings place the score beside the difficulty', () => {
  assert.equal(formatPuzzleRating('unfair', 1000), 'Unfair (1000)')
  assert.equal(formatPuzzleRating('easy', null), 'Easy')
  assert.equal(formatPuzzleRating('medium'), 'Medium')
})

import { variantDifficulties, variantDifficulty } from '../src/sudoku/variants.ts'
import { variantSeeds } from '../src/sudoku/variant-generation.ts'
import { articles, lessonGroups } from '../src/sudoku/lessons.ts'

test('ten selectable levels start new players at Medium and preserve historical labels', () => {
  assert.equal(DEFAULT_DIFFICULTY, 'medium')
  assert.equal(DIFFICULTY_LEVELS.length, 10)
  assert.equal(new Set(DIFFICULTY_LEVELS).size, 10)
  assert.equal(DIFFICULTY_LEVELS.at(-1), 'impossible')
  assert.equal(currentDifficulty('unfair'), 'expert')
  assert.equal(variantDifficulty('classic', 'unfair'), 'expert')
  assert.equal(formatPuzzleRating('unfair', 1800), 'Unfair (1800)')
  assert.equal(variantDifficulty('classic', 'auto'), 'auto')
})

test('variant choices only offer verified recipes and clamp saved choices', () => {
  for (const id of Object.keys(variantSeeds) as (keyof typeof variantSeeds)[]) {
    const levels = variantDifficulties(id)
    assert.deepEqual(levels, DIFFICULTY_LEVELS.filter(level => Object.hasOwn(variantSeeds[id], level)))
    assert.ok(levels.includes('medium'), id)
    for (const level of DIFFICULTY_LEVELS) assert.ok(levels.includes(variantDifficulty(id, level)), id)
  }
})

test('the learning path follows tier order and teaches prerequisites first', () => {
  const classic = lessonGroups.filter(group => !group.variant)
  assert.deepEqual(classic.map(group => group.title),
    ['Beginner', 'Easy', 'Medium', 'Tricky', 'Hard', 'Very Hard', 'Expert', 'Master', 'Extreme', 'Impossible'])
  assert.deepEqual(lessonGroups.filter(group => group.variant).map(group => group.title),
    ['X Sudoku', 'Killer Sudoku', 'Chess variants', 'Thermometer', 'Arrow', 'Kropki',
      'Other cell and pair rules', 'Other line rules', 'Outside clues'])
  const classicIds = new Set(classic.flatMap(group => group.lessons.map(lesson => lesson.id)))
  const seen = new Set<string>()
  let previous = -1
  for (const article of articles) {
    for (const prerequisite of article.prerequisites ?? []) assert.ok(seen.has(prerequisite), `${article.id} needs ${prerequisite}`)
    if (article.difficulty && classicIds.has(article.id)) {
      const level = difficultyIndex(article.difficulty)
      assert.ok(level >= previous, article.id)
      previous = level
    }
    seen.add(article.id)
  }
})
