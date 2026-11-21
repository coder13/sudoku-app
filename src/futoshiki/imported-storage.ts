import { numberPuzzleImports } from '../number-puzzles/imported-storage.ts'
import { importedFutoshikiToken, readImportedFutoshiki } from './imported.ts'

export const { save: saveFutoshikiImport, read: readFutoshikiImports } = numberPuzzleImports(
  'futoshiki', importedFutoshikiToken, readImportedFutoshiki,
)
