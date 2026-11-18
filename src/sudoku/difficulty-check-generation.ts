import { generateClassic } from './classic-generation.ts'
import { SINGLE_TECHNIQUES, difficultyIndex } from './difficulty.ts'
import type { TechniquePreferences } from './difficulty-check.ts'
import { EngineError, runEngine, type Difficulty } from './engine.ts'

export async function generateDifficultyCheck(level: Difficulty, seed: number, preferences: TechniquePreferences, previous: readonly string[]) {
  const { comfortable, practice } = preferences
  if (!comfortable.length && !practice.length) return generateClassic(level, seed, undefined, previous)

  const { techniques, difficultyOrder } = await runEngine({ type: 'techniques' })
  const eligible = new Set(techniques.filter(({ difficulty }) => difficultyIndex(difficulty) <= difficultyIndex(level)).map(({ id }) => id))
  const atLevel = new Set(techniques.filter(({ difficulty }) => difficulty === level).map(({ id }) => id))
  const focus = practice.find(id => atLevel.has(id))
    ?? practice.find(id => eligible.has(id))
  if (!comfortable.length && !focus) return generateClassic(level, seed, undefined, previous)
  const techniqueOrder = difficultyOrder.filter(id => eligible.has(id) &&
    (!comfortable.length || comfortable.includes(id) || id === focus || SINGLE_TECHNIQUES.includes(id)))
  const { board, rating } = await runEngine({
    type: 'generate-constrained', seed, maxAttempts: 96, includeRating: true, clues: [17, 40],
    difficulty: level, technique: focus, techniqueOrder, exclude: previous,
  })
  if (rating.status === 'stalled' || rating.status.solved !== level || focus && !rating.score.counts[focus]) {
    throw new EngineError('No puzzle matches these techniques at this level.', 'search-limit')
  }
  return { board, rating }
}
