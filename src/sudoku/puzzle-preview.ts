import { runEngine } from './engine.ts'
import { createGameId, makeGame, puzzleIdentity, type Game } from './game.ts'
import { detectPuzzle, type ImportedPuzzle } from './puzzle-import.ts'
import { validation } from './puzzle-validation.ts'
import { variantName } from './variants.ts'

export type PuzzlePreview = { game: Game; format: ImportedPuzzle['format'] }

export function findImportedPuzzle(games: readonly Game[], { givens, variant }: Pick<ImportedPuzzle, 'givens' | 'variant'>) {
  const identity = puzzleIdentity({ givens, variant })
  return games.find(game => game.source !== 'draft' && puzzleIdentity(game) === identity)
}

/** Decode and verify the complete puzzle before the app offers to save or play it. */
export async function prepareImportedPuzzle(input: string, games: readonly Game[] = []): Promise<PuzzlePreview> {
  const imported = await detectPuzzle(input)
  const { givens, variant, format } = imported
  const existing = findImportedPuzzle(games, imported)
  const name = variant?.id === 'mixed' ? 'Imported mixed-rule puzzle'
    : variant ? `Imported ${variantName(variant)} puzzle` : 'Imported puzzle'
  const game = makeGame(createGameId(), name, givens, 'imported')
  if (!existing) {
    const status = variant
      ? await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: variant.puzzle } })
      : await runEngine({ type: 'analyze', values: givens })
    if (status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
    if (status !== 'unique') throw new Error(validation[status].text)
  }
  if (variant) {
    const solution = existing?.variant?.solution ??
      await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: variant.puzzle } })
    game.variant = { ...variant, solution }
  }
  return { game, format }
}
