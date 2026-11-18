import { collectionGridHash } from './collection-integrity.ts'
import packed from './generated/sinclair-index.json' with { type: 'json' }
import { DIFFICULTY_LABELS } from './difficulty.ts'
import type { Difficulty } from './engine.ts'
import { libraryId, packUrl, puzzleCode, type SinclairIndex, type SinclairLevel } from './sinclair-format.ts'
import { VARIANTS, isVariantId, type VariantId } from './variants.ts'
import type { PuzzleCollection } from './collections.ts'

const index: SinclairIndex = packed as unknown as SinclairIndex
export function libraryFamily(id: string) {
  const family = id.slice('sinclair-library-'.length)
  return id.startsWith('sinclair-library-') && isVariantId(family) ? family : undefined
}
export function libraryLevel(family: VariantId, tier: Difficulty) {
  const level = index.variants[family][tier]
  if (!level) throw Error('Choose an available difficulty for this variant.')
  return { ...level, url: packUrl(family, tier, level) }
}
export const libraryCollections: PuzzleCollection[] = (Object.keys(VARIANTS) as VariantId[]).map(family => {
  const title = 'Sinclair Library · ' + VARIANTS[family].name
  const levels = Object.entries(index.variants[family]) as [Difficulty, SinclairLevel][]
  return {
    id: libraryId(family), variant: family, title, creator: 'Sinclair', kind: 'generated',
    description: '100 puzzles at each difficulty. Download one difficulty to play it offline.',
    changes: 'Sinclair selected these puzzles for their solve paths and clue layouts.',
    sourceUrl: '/sinclair-credits.txt', sourceRevision: collectionGridHash(levels.map(([, level]) => level.hash).join('/')),
    puzzles: levels.flatMap(([tier, level]) => level.rows.map(([givensHash, variantHash, points, hardest, bytes], i) => ({
      id: puzzleCode(tier, variantHash ?? givensHash), title: 'Sinclair ' + VARIANTS[family].name + ' ' + DIFFICULTY_LABELS[tier] + ' ' + String(i + 1).padStart(3, '0'),
      difficulty: tier, points, hardestTechnique: index.techniques[hardest], scoringVersion: level.version,
      givensHash, ...(variantHash ? { variantHash } : {}), bytes,
    }))),
  }
})
