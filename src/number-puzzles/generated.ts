import { createCalcudoku } from '../calcudoku/engine.ts'
import type { CalcudokuRecipe } from '../calcudoku/generator.ts'
import { createKakuro } from '../kakuro/engine.ts'
import type { KakuroRecipe } from '../kakuro/generator.ts'
import { numberPuzzleDifficulties, type NumberPuzzleDifficulty } from './catalog.ts'

export const RECENT_GENERATED_PUZZLE_LIMIT = 150

export type GeneratedNumberGame = 'kakuro' | 'calcudoku'
type GeneratedKakuro = { game: 'kakuro'; difficulty: NumberPuzzleDifficulty; recipe: KakuroRecipe }
type GeneratedCalcudoku = { game: 'calcudoku'; difficulty: NumberPuzzleDifficulty; recipe: CalcudokuRecipe }
export type GeneratedNumberPuzzle = GeneratedKakuro | GeneratedCalcudoku

const tokenPattern = /^(?:v1\.[A-Za-z0-9_-]{1,1800}|v2\.[A-Za-z0-9_-]{1,1800}\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/

export function generatedNumberToken(value: unknown): string | undefined {
  return typeof value === 'string' && tokenPattern.test(value) ? value : undefined
}

export function encodeGeneratedNumberPuzzle(puzzle: GeneratedNumberPuzzle, playId?: string): string {
  const { game, difficulty, recipe } = puzzle
  const payload = btoa(JSON.stringify([game, difficulty, recipe])).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  if (playId) return `v2.${payload}.${playId}`
  return `v1.${payload}`
}

export function decodeGeneratedNumberPuzzle(token: string, game: 'kakuro'): GeneratedKakuro | null
export function decodeGeneratedNumberPuzzle(token: string, game: 'calcudoku'): GeneratedCalcudoku | null
export function decodeGeneratedNumberPuzzle(token: string, game: GeneratedNumberGame): GeneratedNumberPuzzle | null {
  if (!generatedNumberToken(token)) return null
  const [, encoded] = token.split('.', 2)
  try {
    const payload: unknown = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')))
    if (!Array.isArray(payload) || payload.length !== 3 || payload[0] !== game) return null
    const difficulty = numberPuzzleDifficulties.find(value => value === payload[1])
    if (!difficulty) return null
    const recipe = payload[2]
    if (game === 'kakuro') {
      if (!Array.isArray(recipe) || recipe.length !== 2 || !Number.isInteger(recipe[0]) || recipe[0] < 3 ||
        recipe[0] > 7 || typeof recipe[1] !== 'string' || recipe[1].length > 294) return null
      const clues = recipe[1].split(' ')
      if (clues.length > 49 || clues.some((cell: string) => !/^(?:\.|\d{0,2}\/\d{0,2})$/.test(cell))) return null
      return { game, difficulty, recipe: [recipe[0], recipe[1]] }
    }
    if (!recipe || recipe.size !== { easy: 3, medium: 4, hard: 5 }[difficulty] ||
      !Array.isArray(recipe.cages) || recipe.cages.length > 25 ||
      recipe.cages.some((cage: CalcudokuRecipe['cages'][number]) => !cage || !Array.isArray(cage.cells) || cage.cells.length > 5)) return null
    return { game, difficulty, recipe }
  } catch {
    return null
  }
}

export function kakuroFromRecipe([width, grid]: readonly [number, string]) {
  return createKakuro(width, grid.split(' ').map(token => {
    if (token === '.') return null
    const [down, across] = token.split('/')
    return { down: down ? Number(down) : undefined, across: across ? Number(across) : undefined }
  }))
}

export function calcudokuFromRecipe({ size, cages }: CalcudokuRecipe) {
  return createCalcudoku(size, cages)
}
