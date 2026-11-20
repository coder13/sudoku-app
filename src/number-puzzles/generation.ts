import { calcudokuCatalog } from '../calcudoku/catalog.ts'
import { calcudokuRecipeKey, calcudokuRecipeSignature, generateCalcudoku, type CalcudokuRecipe } from '../calcudoku/generator.ts'
import { kakuroCatalog } from '../kakuro/catalog.ts'
import { generateKakuro, kakuroRecipeSignature } from '../kakuro/generator.ts'
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

function generateCalcudokuPlay({ difficulty, seed, previous }: GenerationRequest): string {
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
  let recipe = generateCalcudoku(difficulty, seed, excluded, history) ??
    generateCalcudoku(difficulty, (seed ^ 0x9e3779b1) >>> 0, excluded, history) ??
    generateCalcudoku(difficulty, seed, excluded) ??
    olderCalcudoku(difficulty, previous, excluded)

  if (!recipe) {
    // The catalog provides a valid board even if every search reaches its limit.
    const [{ puzzle }] = catalog.sort((a, b) => (recent.get(a.signature) ?? -1) - (recent.get(b.signature) ?? -1))
    recipe = { size: puzzle.size, cages: [...puzzle.cages] }
  }

  // A new session needs its own save even when the board has the same cages.
  return encodeGeneratedNumberPuzzle({ game: 'calcudoku', difficulty, recipe }, crypto.randomUUID())
}

export function generateNumberPuzzle(request: GenerationRequest): string | null {
  if (request.game === 'calcudoku') return generateCalcudokuPlay(request)

  const { game, difficulty, seed, previous } = request
  const excluded = new Set(kakuroCatalog.map(({ puzzle }) => kakuroRecipeSignature(puzzle)))
  for (const token of previous) {
    const stored = decodeGeneratedNumberPuzzle(token, game)
    if (!stored) continue
    try { excluded.add(kakuroRecipeSignature(kakuroFromRecipe(stored.recipe))) } catch { /* Ignore invalid saved clues. */ }
  }
  const recipe = generateKakuro(difficulty, seed, excluded)
  return recipe && encodeGeneratedNumberPuzzle({ game, difficulty, recipe })
}
