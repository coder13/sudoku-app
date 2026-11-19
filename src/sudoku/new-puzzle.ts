import type { DifficultyPreference } from './difficulty.ts'
import type { Game } from './game.ts'
import { generationVariant, isPuzzleVariantId, isVariantId, VARIANTS, type PuzzleVariantId, type VariantId } from './variants.ts'

export const MINI_NAME = 'Mini Sudoku'
export const ALGEBRAIC_CAGES_NAME = 'Algebraic Cages'
export const MINI_RULE = 'Place each digit from 1 to 4 once in every row, column, and 2 × 2 box.'
export const miniDifficulties = ['easy', 'medium'] as const
export type MiniDifficulty = typeof miniDifficulties[number]
export type NewPuzzleId = VariantId | 'mini'
export type GameVariantId = PuzzleVariantId | 'mini' | 'algebraic-cages'

export const newPuzzleVariants: NewPuzzleId[] = ['classic', 'mini', ...(Object.keys(VARIANTS) as VariantId[]).filter(id => id !== 'classic')]

export function isNewPuzzleId(value: unknown): value is NewPuzzleId {
  return value === 'mini' || isVariantId(value)
}

export function isGameVariantId(value: unknown): value is GameVariantId {
  return value === 'mini' || value === 'algebraic-cages' || isPuzzleVariantId(value)
}

export function gameVariantId(game: Pick<Game, 'grid' | 'variant' | 'algebraic'>): GameVariantId {
  return game.algebraic ? 'algebraic-cages' : game.grid ? 'mini' : game.variant?.id ?? 'classic'
}

export function gameGenerationVariant(game?: Pick<Game, 'grid' | 'variant' | 'algebraic'>): NewPuzzleId | undefined {
  if (game?.algebraic) return undefined
  return game?.grid ? 'mini' : game?.variant ? generationVariant(game.variant) : 'classic'
}

export function miniDifficulty(preference: DifficultyPreference): MiniDifficulty {
  return preference === 'auto' || preference === 'easy' || preference === 'beginner' ? 'easy' : 'medium'
}
