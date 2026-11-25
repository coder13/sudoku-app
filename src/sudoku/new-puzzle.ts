import type { DifficultyPreference } from './difficulty.ts'
import type { Game } from './game.ts'
import { rectangularLayouts, type RectangularBoxRows, type SizedGrid } from './grid.ts'
import { generationVariant, isPuzzleVariantId, isVariantId, variantDifficulty, type PuzzleVariantId, type VariantId } from './variants.ts'

export const MINI_NAME = 'Mini Sudoku'
export const FOUR_JIGSAW_NAME = '4 × 4 Jigsaw'
export const FIVE_JIGSAW_NAME = '5 × 5 Jigsaw Sudoku'
export const FIVE_BOXLESS_NAME = '5 × 5 Boxless Sudoku'
export const FIVE_JIGSAW_RULE = 'Place each digit from 1 to 5 once in every row, column, and outlined region.'
export const EIGHT_NAME = '8 × 8 Sudoku'
export const EIGHT_RULE = 'Place each digit from 1 to 8 once in every row, column, and box.'
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
export type SizedPuzzleId = 'mini' | 'algebraic-cages' | 'jigsaw-five' | 'six' | 'jigsaw-seven' | 'eight'
export type NewPuzzleId = VariantId | SizedPuzzleId
export type GameVariantId = PuzzleVariantId | SizedPuzzleId | 'boxless-five' | 'boxless-seven'

export const sizedPuzzleOptions = {
  mini: { name: MINI_NAME, rule: MINI_RULE },
  'jigsaw-five': { name: FIVE_JIGSAW_NAME, rule: FIVE_JIGSAW_RULE },
  six: { name: SIX_NAME, rule: SIX_RULE },
  'jigsaw-seven': { name: SEVEN_JIGSAW_NAME, rule: SEVEN_JIGSAW_RULE },
  eight: { name: EIGHT_NAME, rule: EIGHT_RULE },
  'algebraic-cages': { name: ALGEBRAIC_CAGES_NAME, rule: ALGEBRAIC_CAGES_RULE },
} satisfies Record<SizedPuzzleId, { name: string; rule: string }>

export function isSizedPuzzleId(value: unknown): value is SizedPuzzleId {
  return typeof value === 'string' && Object.hasOwn(sizedPuzzleOptions, value)
}

export function rectangularPuzzleSize(variant: unknown) {
  if (variant === 'six') return 6
  if (variant === 'eight') return 8
}

export function rectangularBoxRows(variant: unknown, value: unknown): RectangularBoxRows | undefined {
  const size = rectangularPuzzleSize(variant)
  return size === undefined ? undefined : rectangularLayouts(size).find(grid => grid.boxRows === value)?.boxRows
}

export function isNewPuzzleId(value: unknown): value is NewPuzzleId {
  return isSizedPuzzleId(value) || isVariantId(value)
}

export function isGameVariantId(value: unknown): value is GameVariantId {
  return value === 'boxless-five' || value === 'boxless-seven' || isSizedPuzzleId(value) || isPuzzleVariantId(value)
}

export function gameVariantId(game: Pick<Game, 'grid' | 'variant' | 'algebraic'>): GameVariantId {
  if (game.grid && 'noRegions' in game.grid) return game.grid.size === 5 ? 'boxless-five' : 'boxless-seven'
  if (game.algebraic) return 'algebraic-cages'
  switch (game.grid?.size) {
    case 4: return 'mini'
    case 5: return 'jigsaw-five'
    case 6: return 'six'
    case 7: return 'jigsaw-seven'
    case 8: return 'eight'
    default: return game.variant?.id ?? 'classic'
  }
}

export function gameGenerationVariant(game?: Pick<Game, 'grid' | 'variant' | 'algebraic' | 'sized'>): NewPuzzleId | undefined {
  if (game?.algebraic) return 'algebraic-cages'
  if (game?.sized?.rules.length) return
  if (game?.grid && 'noRegions' in game.grid) return
  if (game?.grid?.size === 5) return 'jigsaw-five'
  if (game?.grid?.size === 7) return 'jigsaw-seven'
  if (game?.grid?.size === 6) return 'six'
  if (game?.grid?.size === 8) return 'eight'
  return game?.grid ? 'mini' : game?.variant ? generationVariant(game.variant) : 'classic'
}

export function miniDifficulty(preference: DifficultyPreference): MiniDifficulty {
  return preference === 'auto' || preference === 'easy' || preference === 'beginner' ? 'easy' : 'medium'
}

export function newPuzzleDifficulty(variant: NewPuzzleId, preference: DifficultyPreference): DifficultyPreference {
  return isSizedPuzzleId(variant) ? miniDifficulty(preference) : variantDifficulty(variant, preference)
}

export function sizedGridName(grid: SizedGrid) {
  if ('noRegions' in grid) return grid.size === 5 ? FIVE_BOXLESS_NAME : SEVEN_BOXLESS_NAME
  if (grid.size === 4 && 'regions' in grid) return FOUR_JIGSAW_NAME
  if (grid.size === 5) return FIVE_JIGSAW_NAME
  if (grid.size === 7) return SEVEN_JIGSAW_NAME
  if (grid.size === 8) return EIGHT_NAME
  return grid.size === 6 ? SIX_NAME : MINI_NAME
}
