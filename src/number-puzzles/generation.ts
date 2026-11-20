import { calcudokuCatalog } from '../calcudoku/catalog.ts'
import { calcudokuRecipeKey, calcudokuRecipeSignature, generateCalcudoku, type CalcudokuRecipe } from '../calcudoku/generator.ts'
import { kakuroCatalog } from '../kakuro/catalog.ts'
import { solveKakuro } from '../kakuro/engine.ts'
import {
  generateKakuro, kakuroHintDifficulty, kakuroRecipeFromPuzzle, kakuroRecipeSignature, type KakuroRecipe,
} from '../kakuro/generator.ts'
import { solveLatin } from '../latin/engine.ts'
import type { NumberPuzzleDifficulty } from './catalog.ts'
import {
  calcudokuFromRecipe, decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, kakuroFromRecipe,
  RECENT_GENERATED_PUZZLE_LIMIT, type GeneratedNumberGame,
} from './generated.ts'

export type GenerationRequest = {
  game: GeneratedNumberGame
  difficulty: NumberPuzzleDifficulty
  seed: number
  previous: readonly string[]
}

function retrySeed(seed: number) {
  return (seed ^ 0x9e3779b1) >>> 0
}

function leastRecentCatalogPuzzle<Puzzle>(
  catalog: { puzzle: Puzzle; signature: string }[],
  recent: ReadonlyMap<string, number>,
): Puzzle {
  // Published puzzles provide a fallback even if every search reaches its limit.
  return catalog.sort((a, b) => (recent.get(a.signature) ?? -1) - (recent.get(b.signature) ?? -1))[0].puzzle
}

function olderCalcudoku(
  difficulty: NumberPuzzleDifficulty,
  previous: readonly string[],
  excluded: ReadonlySet<string>,
): CalcudokuRecipe | undefined {
  for (const token of previous) {
    const stored = decodeGeneratedNumberPuzzle(token, 'calcudoku')
    if (stored?.difficulty !== difficulty) continue
    try {
      const recipe = stored.recipe
      if (excluded.has(calcudokuRecipeSignature(recipe))) continue
      if (solveLatin(calcudokuFromRecipe(recipe), [], 1).status === 'unique') return recipe
    } catch { /* Ignore invalid saved cages. */ }
  }
}

function calcudokuRecipeForPlay({ difficulty, seed, previous }: GenerationRequest): CalcudokuRecipe {
  const catalog = calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
    .map(({ puzzle }) => ({ puzzle, signature: calcudokuRecipeSignature(puzzle) }))
  const excluded = new Set(catalog.map(({ signature }) => signature))
  const recent = new Map<string, number>()
  const signatures = new Set<string>()
  const recipes = new Set<string>()

  for (let index = previous.length - 1; index >= 0; index--) {
    const stored = decodeGeneratedNumberPuzzle(previous[index], 'calcudoku')
    if (stored?.difficulty !== difficulty) continue
    try {
      const signature = calcudokuRecipeSignature(stored.recipe)
      recipes.add(calcudokuRecipeKey(stored.recipe))
      if (!signatures.has(signature) && recent.size < RECENT_GENERATED_PUZZLE_LIMIT) {
        recent.set(signature, index)
        excluded.add(signature)
      }
      signatures.add(signature)
    } catch { /* Ignore invalid saved cages. */ }
  }

  const history = { signatures, recipes }
  const recipe = generateCalcudoku(difficulty, seed, excluded, history) ??
    generateCalcudoku(difficulty, retrySeed(seed), excluded, history) ??
    generateCalcudoku(difficulty, seed, excluded) ??
    olderCalcudoku(difficulty, previous, excluded)
  if (recipe) return recipe

  const { size, cages } = leastRecentCatalogPuzzle(catalog, recent)
  return { size, cages: [...cages] }
}

function olderKakuro(
  difficulty: NumberPuzzleDifficulty,
  previous: readonly string[],
  recent: ReadonlyMap<string, number>,
): KakuroRecipe | undefined {
  for (const token of previous) {
    const stored = decodeGeneratedNumberPuzzle(token, 'kakuro')
    if (stored?.difficulty !== difficulty) continue
    try {
      const puzzle = kakuroFromRecipe(stored.recipe)
      if (recent.has(kakuroRecipeSignature(puzzle))) continue
      const whiteCount = puzzle.cells.filter(cell => cell === null).length
      if (solveKakuro(puzzle, [], 1).status === 'unique' &&
        kakuroHintDifficulty(puzzle, whiteCount) === difficulty) return stored.recipe
    } catch { /* Ignore invalid saved clues. */ }
  }
}

function kakuroRecipeForPlay({ difficulty, seed, previous }: GenerationRequest): KakuroRecipe {
  const catalog = kakuroCatalog.map(({ puzzle, difficulty }) => ({ puzzle, difficulty, signature: kakuroRecipeSignature(puzzle) }))
  const excluded = new Set(catalog.map(({ signature }) => signature))
  const recent = new Map<string, number>()
  for (let index = previous.length - 1; index >= 0; index--) {
    const stored = decodeGeneratedNumberPuzzle(previous[index], 'kakuro')
    if (!stored) continue
    try {
      const signature = kakuroRecipeSignature(kakuroFromRecipe(stored.recipe))
      excluded.add(signature)
      if (stored.difficulty === difficulty && !recent.has(signature) && recent.size < RECENT_GENERATED_PUZZLE_LIMIT) {
        recent.set(signature, index)
      }
    } catch { /* Ignore invalid saved clues. */ }
  }

  const recipe = generateKakuro(difficulty, seed, excluded)
    ?? generateKakuro(difficulty, retrySeed(seed), excluded)
    ?? olderKakuro(difficulty, previous, recent)
  if (recipe) return recipe

  return kakuroRecipeFromPuzzle(leastRecentCatalogPuzzle(catalog.filter(entry => entry.difficulty === difficulty), recent))
}

export function generateNumberPuzzle(request: GenerationRequest): string {
  const { game, difficulty } = request
  const puzzle = game === 'calcudoku'
    ? { game, difficulty, recipe: calcudokuRecipeForPlay(request) }
    : { game, difficulty, recipe: kakuroRecipeForPlay(request) }
  // A new session needs its own save even when the board has the same clues.
  return encodeGeneratedNumberPuzzle(puzzle, crypto.randomUUID())
}
