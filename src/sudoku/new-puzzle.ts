import type { DifficultyPreference } from './difficulty.ts'
import type { Game } from './game.ts'
import type { SizedGrid } from './grid.ts'
import { generationVariant, isPuzzleVariantId, isVariantId, VARIANTS, type PuzzleVariantId, type VariantId } from './variants.ts'

export const MINI_NAME = 'Mini Sudoku'
export const SIX_NAME = '6 × 6 Sudoku'
export const SEVEN_BOXLESS_NAME = '7 × 7 Boxless Sudoku'
export const SEVEN_JIGSAW_NAME = '7 × 7 Jigsaw Sudoku'
export const SEVEN_JIGSAW_RULE = 'Place each digit from 1 to 7 once in every row, column, and outlined region.'
export const SIX_RULE = 'Place each digit from 1 to 6 once in every row, column, and box.'
export const ALGEBRAIC_CAGES_NAME = 'Algebraic Cages'
export const ALGEBRAIC_CAGES_RULE = 'Digits in each cage are distinct and add to its total. Each letter has the same positive integer value in all its cages.'
export const MINI_RULE = 'Place each digit from 1 to 4 once in every row, column, and 2 × 2 box.'
export const miniDifficulties = ['easy', 'medium'] as const
export type MiniDifficulty = typeof miniDifficulties[number]
type SizedPuzzleId = 'mini' | 'algebraic-cages' | 'six' | 'jigsaw-seven'
export type NewPuzzleId = VariantId | SizedPuzzleId
export type GameVariantId = PuzzleVariantId | SizedPuzzleId | 'boxless-seven'

export const newPuzzleVariants: NewPuzzleId[] = ['classic', 'mini', 'six', 'jigsaw-seven', 'algebraic-cages', ...(Object.keys(VARIANTS) as VariantId[]).filter(id => id !== 'classic')]

export function isSizedPuzzleId(value: unknown): value is SizedPuzzleId {
  return value === 'mini' || value === 'algebraic-cages' || value === 'six' || value === 'jigsaw-seven'
}

export function isNewPuzzleId(value: unknown): value is NewPuzzleId {
  return isSizedPuzzleId(value) || isVariantId(value)
}

export function isGameVariantId(value: unknown): value is GameVariantId {
  return value === 'boxless-seven' || isSizedPuzzleId(value) || isPuzzleVariantId(value)
}

export function gameVariantId(game: Pick<Game, 'grid' | 'variant' | 'algebraic'>): GameVariantId {
  if (game.grid && 'noRegions' in game.grid) return 'boxless-seven'
  return game.algebraic ? 'algebraic-cages' : game.grid?.size === 6 ? 'six' : game.grid?.size === 7 ? 'jigsaw-seven' : game.grid ? 'mini' : game.variant?.id ?? 'classic'
}

export function gameGenerationVariant(game?: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'sized'>): NewPuzzleId | undefined {
  if (game?.algebraic) return 'algebraic-cages'
  if (game?.sized?.rules.length) return
  if (game?.grid && 'noRegions' in game.grid) return
  if (game?.grid?.size === 7) return 'jigsaw-seven'
  if (game?.grid?.size === 6) return 'six'
  return game?.grid ? 'mini' : game?.variant ? generationVariant(game.variant) : 'classic'
}

export function miniDifficulty(preference: DifficultyPreference): MiniDifficulty {
  return preference === 'auto' || preference === 'easy' || preference === 'beginner' ? 'easy' : 'medium'
}

export function sizedGridName(grid: SizedGrid) {
  if ('noRegions' in grid) return SEVEN_BOXLESS_NAME
  if (grid.size === 7) return SEVEN_JIGSAW_NAME
  return grid.size === 6 ? SIX_NAME : MINI_NAME
}
