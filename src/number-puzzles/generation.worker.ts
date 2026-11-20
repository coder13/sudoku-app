import { calcudokuCatalog } from '../calcudoku/catalog.ts'
import { calcudokuRecipeKey, calcudokuRecipeSignature, generateCalcudoku } from '../calcudoku/generator.ts'
import { kakuroCatalog } from '../kakuro/catalog.ts'
import { generateKakuro, kakuroRecipeSignature } from '../kakuro/generator.ts'
import type { NumberPuzzleDifficulty } from './catalog.ts'
import { decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, kakuroFromRecipe, RECENT_GENERATED_PUZZLE_LIMIT, type GeneratedNumberGame } from './generated.ts'

export type GenerationRequest = { game: GeneratedNumberGame; difficulty: NumberPuzzleDifficulty; seed: number; previous: string[] }

function generate({ game, difficulty, seed, previous }: GenerationRequest): string | null {
  if (game === 'kakuro') {
    const excluded = new Set(kakuroCatalog.map(({ puzzle }) => kakuroRecipeSignature(puzzle)))
    for (const token of previous) {
      const stored = decodeGeneratedNumberPuzzle(token, game)
      if (!stored) continue
      try { excluded.add(kakuroRecipeSignature(kakuroFromRecipe(stored.recipe))) } catch { /* Ignore invalid saved clues. */ }
    }
    const recipe = generateKakuro(difficulty, seed, excluded)
    return recipe && encodeGeneratedNumberPuzzle({ game, difficulty, recipe })
  }

  const excluded = new Set(calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
    .map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
  const signatures = new Set<string>()
  const recipes = new Set<string>()
  for (let index = previous.length - 1; index >= 0; index--) {
    const stored = decodeGeneratedNumberPuzzle(previous[index], game)
    if (stored?.difficulty !== difficulty) continue
    try {
      const signature = calcudokuRecipeSignature(stored.recipe)
      if (signatures.size < RECENT_GENERATED_PUZZLE_LIMIT) excluded.add(signature)
      signatures.add(signature)
      recipes.add(calcudokuRecipeKey(stored.recipe))
    } catch { /* Ignore invalid saved cages. */ }
  }
  const recipe = generateCalcudoku(difficulty, seed, excluded, { signatures, recipes })
  return recipe && encodeGeneratedNumberPuzzle({ game, difficulty, recipe })
}

self.onmessage = (message: MessageEvent<GenerationRequest>) => {
  self.postMessage(generate(message.data))
}
