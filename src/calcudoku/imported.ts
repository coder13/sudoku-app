import type { NumberPosition } from '../number-puzzles/progress.ts'
import { encodeImportedNumberPuzzle, decodeImportedNumberPuzzle, isNumberPosition } from '../number-puzzles/imported-codec.ts'
import type { LatinParity } from '../latin/parity.ts'
import { validImportedCellColors, type ImportedCellColors } from '../sudoku/imported-colors.ts'
import { validLatinDiagonals, type LatinDiagonal } from '../latin/diagonals.ts'
import { validLatinLines, type LatinLine } from '../latin/lines.ts'
import { validLatinExclusions, type LatinExclusion } from '../latin/exclusions.ts'
import { validLatinExtrema, type LatinExtremum } from '../latin/extrema.ts'
import { validLatinKropki, type LatinKropki } from '../latin/kropki.ts'
import { createCalcudoku, type Cage, type CageOperator } from './engine.ts'
import type { CalcudokuEntry } from './catalog.ts'

export type ImportedCalcudokuCage = Cage
export type ImportedCalcudokuRules = {
  diagonals?: readonly LatinDiagonal[]
  lines?: readonly LatinLine[]
  exclusions?: readonly LatinExclusion[]
  extrema?: readonly LatinExtremum[]
  kropki?: LatinKropki
  givenCellColors?: ImportedCellColors
}

export function createImportedCalcudoku(
  size: number, givens: string, cages: readonly ImportedCalcudokuCage[], parity: readonly LatinParity[] = [], initialPosition?: NumberPosition,
  options: ImportedCalcudokuRules = {},
): CalcudokuEntry {
  const { diagonals = [], lines = [], exclusions = [], extrema = [], kropki, givenCellColors } = options
  const puzzle = createCalcudoku(size, cages, { givens: Array.from(givens, Number), parity, diagonals, lines, exclusions, extrema, ...(kropki && { kropki }) })
  const definition = { size, givens, cages, parity, ...(initialPosition && { initialPosition }),
    ...(diagonals.length && { diagonals }), ...(lines.length && { lines }), ...(exclusions.length && { exclusions }), ...(extrema.length && { extrema }), ...(kropki && { kropki }) }
  return { id: encodeImportedNumberPuzzle('c1', { ...definition, ...(givenCellColors && { givenCellColors }) }), puzzle, number: 0,
    ...(givenCellColors && { givenCellColors }),
    difficulty: size <= 3 ? 'easy' : size === 4 ? 'medium' : 'hard', initialPosition }
}

type ImportedCalcudokuDefinition = {
  size: number
  givens: string
  cages: ImportedCalcudokuCage[]
  parity: LatinParity[]
  diagonals?: LatinDiagonal[]
  lines?: LatinLine[]
  exclusions?: LatinExclusion[]
  extrema?: LatinExtremum[]
  kropki?: LatinKropki
  givenCellColors?: ImportedCellColors
  initialPosition?: NumberPosition
}

function isCageOperator(value: unknown): value is CageOperator {
  return value === 'equal' || value === 'add' || value === 'multiply' || value === 'subtract' || value === 'divide' || value === 'hidden'
}

export function readImportedCalcudoku(token: string): CalcudokuEntry | undefined {
  const definition = decodeImportedNumberPuzzle<ImportedCalcudokuDefinition>(token, 'c1')
  if (!definition || !Number.isInteger(definition.size) || definition.size < 3 || definition.size > 9 ||
    typeof definition.givens !== 'string' || definition.givens.length !== definition.size ** 2 ||
    !/^\d+$/.test(definition.givens) || [...definition.givens].some(digit => Number(digit) > definition.size) ||
    !Array.isArray(definition.cages) || !Array.isArray(definition.parity) ||
    definition.diagonals !== undefined && !validLatinDiagonals(definition.diagonals) ||
    definition.lines !== undefined && !validLatinLines(definition.lines, definition.size) ||
    definition.exclusions !== undefined && !validLatinExclusions(definition.exclusions, definition.size) ||
    definition.extrema !== undefined && !validLatinExtrema(definition.extrema, definition.size) ||
    definition.kropki !== undefined && !validLatinKropki(definition.kropki, definition.size) ||
    definition.givenCellColors !== undefined && (!validImportedCellColors(definition.givenCellColors) ||
      Object.keys(definition.givenCellColors).some(cell => Number(cell) >= definition.size ** 2)) ||
    definition.initialPosition && !isNumberPosition(definition.initialPosition, definition.size)) return
  try {
    if (definition.cages.some(cage => !cage || !isCageOperator(cage.operator) || !Number.isSafeInteger(cage.target) ||
      !Array.isArray(cage.cells) || cage.distinct !== undefined && cage.distinct !== true)) return
    const entry = createImportedCalcudoku(definition.size, definition.givens, definition.cages, definition.parity,
      definition.initialPosition, { diagonals: definition.diagonals, lines: definition.lines, exclusions: definition.exclusions,
        extrema: definition.extrema, givenCellColors: definition.givenCellColors, kropki: definition.kropki })
    return entry.id === token ? entry : undefined
  } catch { return }
}
