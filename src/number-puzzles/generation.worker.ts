import { calcudokuCatalog } from '../calcudoku/catalog.ts'
import { calcudokuRecipeKey, generateCalcudoku } from '../calcudoku/generator.ts'
import { kakuroCatalog } from '../kakuro/catalog.ts'
import { generateKakuro, kakuroRecipeSignature } from '../kakuro/generator.ts'
import type { NumberPuzzleDifficulty } from './catalog.ts'
import { decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, kakuroFromRecipe, type GeneratedNumberGame } from './generated.ts'

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

  const excluded = new Set(calcudokuCatalog.map(({ puzzle }) => calcudokuRecipeKey({ size: puzzle.size, cages: [...puzzle.cages] })))
  for (const token of previous) {
    const stored = decodeGeneratedNumberPuzzle(token, game)
    if (!stored) continue
    try { excluded.add(calcudokuRecipeKey(stored.recipe)) } catch { /* Ignore invalid saved cages. */ }
  }
  const recipe = generateCalcudoku(difficulty, seed, excluded)
  return recipe && encodeGeneratedNumberPuzzle({ game, difficulty, recipe })
}

self.onmessage = (message: MessageEvent<GenerationRequest>) => {
  self.postMessage(generate(message.data))
}
