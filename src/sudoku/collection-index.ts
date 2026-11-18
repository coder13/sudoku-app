import type { CollectionPuzzleInfo } from './collections.ts'
import type { Difficulty } from './engine.ts'

// Only the build input uses tuples. Downloads and saved games keep their existing formats.
export type PackedPuzzleInfo = [
  id: string, title: string, difficulty: Difficulty | null, points: number,
  hardest: string | null, scoringVersion: number, givensHash: string, bytes: number,
  variantHash?: string | null, sourceRating?: number,
]

export function packPuzzleInfo(info: CollectionPuzzleInfo): PackedPuzzleInfo {
  const packed: PackedPuzzleInfo = [info.id, info.title, info.difficulty, info.points,
    info.hardestTechnique, info.scoringVersion, info.givensHash, info.bytes]
  if (info.variantHash !== undefined || info.sourceRating !== undefined) packed[8] = info.variantHash ?? null
  if (info.sourceRating !== undefined) packed[9] = info.sourceRating
  return packed
}

export function unpackPuzzleInfo([id, title, difficulty, points, hardestTechnique, scoringVersion,
  givensHash, bytes, variantHash, sourceRating]: PackedPuzzleInfo): CollectionPuzzleInfo {
  return { id, title, difficulty, points, hardestTechnique, scoringVersion, givensHash, bytes,
    ...(variantHash ? { variantHash } : {}), ...(sourceRating === undefined ? {} : { sourceRating }) }
}
