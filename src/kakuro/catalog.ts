import type { KakuroPuzzle } from './engine.ts'
import { decodeGeneratedNumberPuzzle, kakuroFromRecipe } from '../number-puzzles/generated.ts'
import { generatedKakuroRecipes } from './generated-recipes.ts'

import { numberPuzzleDifficulties, type NumberPuzzleEntry } from '../number-puzzles/catalog.ts'

export type KakuroEntry = NumberPuzzleEntry & { puzzle: KakuroPuzzle }

const recipes = {
  easy: [
    [4, '/ / 18/ 3/ / 4/3 . . /10 . . . /12 . . /'],
    [4, '/ / 7/ 3/ / 10/5 . . /7 . . . /8 . . /'],
    [4, '/ / 7/ 7/ / 8/5 . . /6 . . . /11 . . /'],
    ...generatedKakuroRecipes.easy,
  ],
  medium: [
    [5, '/ / 13/ 14/ / / 8/7 . . 4/ /11 . . . . /10 . . . . /11 . . / /'],
    [5, '/ / 18/ 7/ / / 7/8 . . 7/ /12 . . . . /15 . . . . /4 . . / /'],
    [6, '/ / / 12/ 27/ / / / 14/7 . . 11/ / 9/10 . . . . /25 . . . . . /17 . . . . / /14 . . / / /'],
    ...generatedKakuroRecipes.medium,
  ],
  hard: [
    [7, '/ / 10/ 5/ 29/ / / / 6/6 . . . 13/ / /16 . . . . . / /7 . . 4/7 . . / /17 . . . . . / / / /14 . . . /'],
    [7, '/ / 15/ 4/ 25/ / / / 6/7 . . . 10/ / /17 . . . . . / /8 . . 6/9 . . / /18 . . . . . / / / /7 . . . /'],
    ...generatedKakuroRecipes.hard,
  ],
} as const

export const kakuroCatalog: readonly KakuroEntry[] = numberPuzzleDifficulties.flatMap(difficulty =>
  recipes[difficulty].map(([width, grid], index) => ({
    id: `${difficulty}-${index + 1}`,
    difficulty,
    number: index + 1,
    puzzle: kakuroFromRecipe([width, grid]),
  })),
)

export function generatedKakuroEntry(id: string, number: number): KakuroEntry | null {
  const generated = decodeGeneratedNumberPuzzle(id, 'kakuro')
  if (!generated) return null
  try {
    return { id, number, difficulty: generated.difficulty, generated: true, puzzle: kakuroFromRecipe(generated.recipe) }
  } catch {
    return null
  }
}
