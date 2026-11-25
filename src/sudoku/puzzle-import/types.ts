import type { AlgebraicDefinition } from '../algebraic-game.ts'
import type { AuthoredMark } from '../authored-artwork.ts'
import type { CollectionReference } from '../collection-reference.ts'
import type { Position } from '../game.ts'
import type { SizedGrid } from '../grid.ts'
import type { ImportedCellColors } from '../imported-colors.ts'
import type { SizedRuleGame } from '../sized-rule-game.ts'
import type { VariantGame } from '../variants.ts'
import type { FutoshikiEntry } from '../../futoshiki/catalog.ts'
import type { CalcudokuEntry } from '../../calcudoku/catalog.ts'

export type ImportResult = {
  givens: string
  futoshiki?: FutoshikiEntry
  calcudoku?: CalcudokuEntry
  variant?: Pick<VariantGame, 'id' | 'puzzle' | 'fog'>
  grid?: SizedGrid
  sizedRules?: SizedRuleGame['rules']
  sizedAuthor?: string
  authoredSolution?: string
  authoredSolutionOnly?: true
  algebraic?: AlgebraicDefinition
  title?: string
  sharedPuzzleId?: string
  collection?: CollectionReference
  progress?: Pick<Position, 'entries' | 'center' | 'corner' | 'importedCellColors' | 'importedCandidateColors' | 'importedDrawings'>
  givenCellColors?: ImportedCellColors
  authoredArtwork?: readonly AuthoredMark[]
  whispersGuide?: true
}

type ReadResult = ImportResult | Promise<ImportResult> | undefined

export type PuzzleImporter = {
  format: string
  links?: {
    domains: readonly string[]
    absoluteOnly?: readonly string[]
    read: (url: URL) => ReadResult
  }
  readText?: (text: string) => ReadResult
  // Legacy formats without a distinct marker get a chance after specific readers.
  readUnmarkedText?: (text: string) => ReadResult
}
