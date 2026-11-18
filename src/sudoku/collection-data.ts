import type { VariantPuzzle } from './engine.ts'
import { puzzleIdentity, type Game } from './game.ts'
import { collectionGridHash } from './collection-integrity.ts'
import { isPlayablePuzzle, variantIdForPuzzle } from './variants.ts'

export type CollectionDataInfo = { givensHash: string; variantHash?: string }

export function collectionVariantHash(puzzle: VariantPuzzle) {
  const id = variantIdForPuzzle(puzzle)
  return collectionGridHash(puzzleIdentity({ givens: puzzle.givens,
    variant: { id: id === 'classic' ? 'mixed' : id, puzzle } }))
}

export function collectionPuzzleData(puzzle: { givens: string; puzzle?: VariantPuzzle }) {
  return puzzle.puzzle ? JSON.stringify(puzzle.puzzle) : puzzle.givens
}

export function collectionGameData(game: Pick<Game, 'givens' | 'variant'>) {
  return game.variant ? JSON.stringify(game.variant.puzzle) : game.givens
}

// Classic downloads retain their original 81-byte format and saved storage keys.
export function decodeCollectionData(info: CollectionDataInfo, data: unknown): { givens: string; puzzle?: VariantPuzzle } | undefined {
  if (typeof data !== 'string' || data.length > 32_768) return
  if (!info.variantHash) return /^[0-9]{81}$/.test(data) && collectionGridHash(data) === info.givensHash
    ? { givens: data } : undefined
  try {
    const puzzle: unknown = JSON.parse(data)
    if (!isPlayablePuzzle('mixed', puzzle) || collectionGridHash(puzzle.givens) !== info.givensHash ||
      collectionVariantHash(puzzle) !== info.variantHash) return
    return { givens: puzzle.givens, puzzle }
  } catch { return }
}
