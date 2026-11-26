import type { CustomDifficultyProfile } from './custom-difficulties.ts'
import { difficultyIndex } from './difficulty.ts'
import { EngineError, type EngineRunner, type GeneratedPuzzle } from './engine.ts'
import { practiceBases } from './practice-bases.ts'

export async function generateCustomDifficulty(
  profile: CustomDifficultyProfile, seed: number, exclude: readonly string[], run: EngineRunner, signal?: AbortSignal,
): Promise<GeneratedPuzzle> {
  const { difficultyOrder, techniques } = await run({ type: 'techniques' }, { signal })
  const techniqueOrder = difficultyOrder.filter(id => profile.allowed.includes(id))
  if (!profile.required.every(id => techniqueOrder.includes(id))) {
    throw new Error('Edit this difficulty to replace any unavailable practice techniques.')
  }
  const requiredTechniques = profile.required
  const options = { seed, techniqueOrder, requiredTechniques, exclude, includeRating: true } as const
  const templates = [...new Set(requiredTechniques.flatMap(id => [
    ...(practiceBases[id]?.singles ?? []), ...(practiceBases[id]?.fallback ?? []),
  ]))]
  const needsImpossible = techniques.some(({ id, difficulty }) => difficulty === 'impossible' && requiredTechniques.includes(id))
  const bank = needsImpossible ? await run({ type: 'impossible-templates' }, { signal }) : []
  const expensiveSearch = techniques.some(({ id, difficulty }) =>
    techniqueOrder.includes(id) && difficultyIndex(difficulty) > difficultyIndex('very-hard'),
  )
  const requests = [
    ...(templates.length ? [{ ...options, type: 'generate-constrained' as const, templates, clues: [17, 40] as const, maxAttempts: 80 }] : []),
    ...(bank.length ? [{ ...options, type: 'generate-constrained' as const, templates: bank, clues: [17, 26] as const, maxAttempts: 128 }] : []),
    { ...options, type: 'generate-constrained' as const, clues: [24, 40] as const, maxAttempts: expensiveSearch ? 192 : 2048 },
    { ...options, type: 'generate-from-pool' as const, clues: [17, 40] as const, maxAttempts: 192 },
  ]
  for (const request of requests) {
    try {
      const puzzle = await run(request, { signal })
      if (puzzle.rating.status !== 'stalled' && requiredTechniques.every(id => puzzle.rating.score.counts[id] > 0)) return puzzle
    } catch (error) {
      if (!(error instanceof EngineError) || error.code !== 'search-limit') throw error
    }
  }
  throw new EngineError('No puzzle was found using all the required techniques. Try again or adjust this difficulty.', 'search-limit')
}
