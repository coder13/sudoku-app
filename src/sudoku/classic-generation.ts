import { SINGLE_TECHNIQUES, difficultyIndex } from './difficulty.ts'
import { EngineError, runEngine, type Difficulty } from './engine.ts'
import { autoTechniqueFocus, type TechniqueProgress } from './technique-progress.ts'

export async function generateClassic(difficulty: Difficulty, seed: number, progress?: readonly TechniqueProgress[]) {
  const { difficultyOrder, techniques } = await runEngine({ type: 'techniques' })
  // Normal play uses one canonical profile per difficulty. Personal solver
  // profiles remain available for analysis and custom technique practice.
  const allowed = new Set(techniques.filter((t) => difficultyIndex(t.difficulty) <= difficultyIndex(difficulty)).map((t) => t.id))
  const techniqueOrder = difficultyOrder.filter((id) => allowed.has(id))
  const maxAttempts = difficulty === 'impossible' ? 32 : 512
  const needsMoreThanSingles = difficultyIndex(difficulty) >= difficultyIndex('medium')
  const available = techniques.filter(({ id, difficulty: tier }) =>
    tier === difficulty && difficultyOrder.includes(id) && !SINGLE_TECHNIQUES.includes(id)).map(({ id }) => id)
  const focus = progress && needsMoreThanSingles ? autoTechniqueFocus(progress, available) : undefined
  if (focus) {
    try {
      const board = await runEngine({
        type: 'generate-constrained', seed, maxAttempts: 64, clues: [24, 36], difficulty, technique: focus, techniqueOrder,
      })
      const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
      if (rating.status !== 'stalled' && rating.status.solved === difficulty && rating.score.counts[focus]) {
        return { board, rating, canonical: rating }
      }
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }

  // Random carving rarely reaches the top tier. These existing practice fixtures
  // supply candidates, never a label: the engine rerates every transformed board
  // and requires the complete lower-tier profile to stall.
  if (difficulty === 'impossible') {
    const examples = await runEngine({ type: 'practice-examples', technique: 'nested-forcing-net' })
    const templates = [...new Set(examples.map(({ givens }) => givens))]
    try {
      const board = await runEngine({
        type: 'generate-constrained', seed, maxAttempts: 128, clues: [17, 30], difficulty, techniqueOrder, templates,
      })
      const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
      if (rating.status !== 'stalled' && rating.status.solved === difficulty) return { board, rating, canonical: rating }
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }
  try {
    const board = await runEngine({
      type: 'generate-targeted', seed, maxAttempts,
      target: { type: 'difficulty', level: difficulty, techniqueOrder },
    })
    const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
    if (rating.status !== 'stalled' && rating.status.solved === difficulty) return { board, rating, canonical: rating }
  } catch (error) {
    if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
  }
  // Template candidates pass exactly the same quality checks as fresh boards.
  const { board, rating } = await runEngine({
    type: 'generate-from-pool', seed, maxAttempts: 256, clues: [17, 40], difficulty, techniqueOrder,
  })
  if (rating.status !== 'stalled' && rating.status.solved === difficulty) return { board, rating, canonical: rating }
  throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
}
