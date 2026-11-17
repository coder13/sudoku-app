import { SINGLE_TECHNIQUES, difficultyIndex } from './difficulty.ts'
import { EngineError, runEngine, type Difficulty } from './engine.ts'
import { autoTechniqueFocus, type TechniqueProgress } from './technique-progress.ts'
import { generationFocus } from './generation-focus.ts'

export async function generateClassic(difficulty: Difficulty, seed: number, progress?: readonly TechniqueProgress[], previousPuzzles: readonly string[] = []) {
  const { difficultyOrder, techniques } = await runEngine({ type: 'techniques' })
  // Normal play uses one canonical profile per difficulty. Personal solver
  // profiles remain available for analysis and custom technique practice.
  const allowed = new Set(techniques.filter((t) => difficultyIndex(t.difficulty) <= difficultyIndex(difficulty)).map((t) => t.id))
  const techniqueOrder = difficultyOrder.filter((id) => allowed.has(id))
  const maxAttempts = difficulty === 'impossible' ? 32 : 512
  const needsMoreThanSingles = difficultyIndex(difficulty) >= difficultyIndex('medium')
  const available = techniques.filter(({ id, difficulty: tier }) =>
    tier === difficulty && difficultyOrder.includes(id) && !SINGLE_TECHNIQUES.includes(id)).map(({ id }) => id)
  const focus = (progress && needsMoreThanSingles ? autoTechniqueFocus(progress, available) : undefined)
    ?? generationFocus(difficulty, seed)
  if (focus) {
    try {
      const board = await runEngine({
        type: 'generate-constrained', seed, maxAttempts: 32, clues: [24, 36], difficulty, technique: focus, techniqueOrder, exclude: previousPuzzles,
      })
      const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
      if (rating.status !== 'stalled' && rating.status.solved === difficulty && rating.score.counts[focus]) {
        return { board, rating, canonical: rating }
      }
    } catch (error) {
      if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
    }
  }

  // Use unseen structures from the certified bank. Preserve their clue counts;
  // adding random givens usually removes the reasoning that made them valuable.
  // The engine still checks every transformed board before returning it.
  if (difficulty === 'impossible') {
    const bank = await runEngine({ type: 'impossible-templates' })
    const seen = new Set(await runEngine({ type: 'canonical-puzzles', values: previousPuzzles }))
    const unseen = bank.filter(board => !seen.has(board))
    if (unseen.length) {
      const clueCount = (board: string) => board.replaceAll('0', '').length
      const clues = clueCount(unseen[(seed >>> 0) % unseen.length])
      const templates = unseen.filter(board => clueCount(board) === clues)
      try {
        const board = await runEngine({
          type: 'generate-constrained', seed, maxAttempts: 128, clues, difficulty, techniqueOrder, templates, exclude: previousPuzzles,
        })
        const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
        if (rating.status !== 'stalled' && rating.status.solved === difficulty) return { board, rating, canonical: rating }
      } catch (error) {
        if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
      }
    }
  }
  try {
    const board = await runEngine({
      type: 'generate-targeted', seed, maxAttempts,
      target: { type: 'difficulty', level: difficulty, techniqueOrder }, exclude: previousPuzzles,
    })
    const rating = await runEngine({ type: 'rate', values: board, techniqueOrder })
    if (rating.status !== 'stalled' && rating.status.solved === difficulty) return { board, rating, canonical: rating }
  } catch (error) {
    if (!(error instanceof EngineError && error.code === 'search-limit')) throw error
  }
  // Template candidates pass exactly the same quality checks as fresh boards.
  const { board, rating } = await runEngine({
    type: 'generate-from-pool', seed, maxAttempts: 256, clues: [17, 40], difficulty, techniqueOrder, exclude: previousPuzzles,
  })
  if (rating.status !== 'stalled' && rating.status.solved === difficulty) return { board, rating, canonical: rating }
  throw new EngineError('No puzzle found for this difficulty.', 'search-limit')
}
