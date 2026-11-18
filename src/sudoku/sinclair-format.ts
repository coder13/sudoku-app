import type { Difficulty, VariantPuzzle } from './engine.ts'
import type { VariantId } from './variants.ts'

export const SINCLAIR_COUNT = 100
export const libraryId = (family: VariantId) => 'sinclair-library-' + family
export const puzzleCode = (tier: Difficulty, identity: string) => tier + '-' + identity

export type SinclairRow = [
  grid: string | VariantPuzzle, solution: string, answerKey: string, points: number,
  hardest: number, techniques: number[], opening: number,
]
export type SinclairPack = {
  edition: 1; variant: VariantId; difficulty: Difficulty; scoringVersion: number
  order: string[]; openings: string[]; puzzles: SinclairRow[]
}
export type SinclairInfo = [givensHash: string, variantHash: string | null, points: number, hardest: number, bytes: number]
export type SinclairLevel = { hash: string; checksum: string; bytes: number; version: number; rows: SinclairInfo[] }
export type SinclairIndex = {
  techniques: string[]
  variants: Record<VariantId, Partial<Record<Difficulty, SinclairLevel>>>
}
export function packUrl(family: VariantId, tier: Difficulty, level: SinclairLevel) {
  return '/collections/' + libraryId(family) + '/' + tier + '-' + level.hash + '.json'
}
export function definitionOf(row: SinclairRow): VariantPuzzle {
  return typeof row[0] === 'string' ? { version: 1, givens: row[0] } : row[0]
}
