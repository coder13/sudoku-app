import { numberPuzzleImports } from '../number-puzzles/imported-storage.ts'
import { importedCalcudokuToken, readImportedCalcudoku } from './imported.ts'

export const { save: saveCalcudokuImport, read: readCalcudokuImports } = numberPuzzleImports(
  'calcudoku', importedCalcudokuToken, readImportedCalcudoku,
)
