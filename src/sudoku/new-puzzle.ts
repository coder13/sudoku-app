import type { DifficultyPreference } from './difficulty.ts'
import type { Game } from './game.ts'
import { generationVariant, isPuzzleVariantId, isVariantId, VARIANTS, type PuzzleVariantId, type VariantId } from './variants.ts'

export const MINI_NAME = 'Mini Sudoku'
export const SIX_NAME = '6 × 6 Sudoku'
export const SIX_RULE = 'Place each digit from 1 to 6 once in every row, column, and box.'
export const ALGEBRAIC_CAGES_NAME = 'Algebraic Cages'
export const ALGEBRAIC_CAGES_RULE = 'Digits in each cage are distinct and add to its total. Each letter has the same positive integer value in all its cages.'
export const MINI_RULE = 'Place each digit from 1 to 4 once in every row, column, and 2 × 2 box.'
export const miniDifficulties = ['easy', 'medium'] as const
export type MiniDifficulty = typeof miniDifficulties[number]
type SizedPuzzleId = 'mini' | 'algebraic-cages' | 'six'
export type NewPuzzleId = VariantId | SizedPuzzleId
export type GameVariantId = PuzzleVariantId | SizedPuzzleId

export const newPuzzleVariants: NewPuzzleId[] = ['classic', 'mini', 'six', 'algebraic-cages', ...(Object.keys(VARIANTS) as VariantId[]).filter(id => id !== 'classic')]

export function isSizedPuzzleId(value: unknown): value is SizedPuzzleId {
  return value === 'mini' || value === 'algebraic-cages' || value === 'six'
}

export function isNewPuzzleId(value: unknown): value is NewPuzzleId {
  return isSizedPuzzleId(value) || isVariantId(value)
}

export function isGameVariantId(value: unknown): value is GameVariantId {
  return isSizedPuzzleId(value) || isPuzzleVariantId(value)
}

export function gameVariantId(game: Pick<Game, 'grid' | 'variant' | 'algebraic'>): GameVariantId {
  return game.algebraic ? 'algebraic-cages' : game.grid?.size === 6 ? 'six' : game.grid ? 'mini' : game.variant?.id ?? 'classic'
}

export function gameGenerationVariant(game?: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'six'>): NewPuzzleId | undefined {
  if (game?.algebraic) return 'algebraic-cages'
  if (game?.grid?.size === 6) return game.six?.rules.length ? undefined : 'six'
  return game?.grid ? 'mini' : game?.variant ? generationVariant(game.variant) : 'classic'
}

export function miniDifficulty(preference: DifficultyPreference): MiniDifficulty {
  return preference === 'auto' || preference === 'easy' || preference === 'beginner' ? 'easy' : 'medium'
}
