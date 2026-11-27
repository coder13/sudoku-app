import type { NumberPosition } from '../number-puzzles/progress.ts'
import { encodeImportedNumberPuzzle, decodeImportedNumberPuzzle, isNumberPosition } from '../number-puzzles/imported-codec.ts'
import type { LatinParity } from '../latin/parity.ts'
import { validLatinDiagonals, type LatinDiagonal } from '../latin/diagonals.ts'
import { validLatinLines, type LatinLine } from '../latin/lines.ts'
import { validLatinExclusions, type LatinExclusion } from '../latin/exclusions.ts'
import { validLatinExtrema, type LatinExtremum } from '../latin/extrema.ts'
import { validLatinKropki, type LatinKropki } from '../latin/kropki.ts'
import { createFutoshiki, type Inequality } from './engine.ts'
import type { FutoshikiEntry } from './catalog.ts'
import { validImportedCellColors, type ImportedCellColors } from '../sudoku/imported-colors.ts'

export function isFutoshikiSize(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 3 && Number(value) <= 9
}

export type ImportedFutoshikiRules = {
  diagonals?: readonly LatinDiagonal[]
  lines?: readonly LatinLine[]
  exclusions?: readonly LatinExclusion[]
  extrema?: readonly LatinExtremum[]
  kropki?: LatinKropki
  givenCellColors?: ImportedCellColors
}

export function createImportedFutoshiki(
  size: number, givens: string, inequalities: readonly Inequality[], parity: readonly LatinParity[] = [], initialPosition?: NumberPosition,
  options: ImportedFutoshikiRules = {},
): FutoshikiEntry {
  const { diagonals = [], lines = [], exclusions = [], extrema = [], kropki, givenCellColors } = options
  if (givenCellColors && !validFutoshikiCellColors(givenCellColors, size)) throw new Error('Invalid imported Futoshiki cell colors.')
  const puzzle = createFutoshiki(size, Array.from(givens, Number), inequalities, parity, lines, diagonals, exclusions, extrema, kropki)
  const definition = { size, givens, inequalities, parity, ...(initialPosition && { initialPosition }),
    ...(diagonals.length && { diagonals }), ...(lines.length && { lines }), ...(exclusions.length && { exclusions }), ...(extrema.length && { extrema }), ...(kropki && { kropki }),
    ...(givenCellColors && { givenCellColors }) }
  return { id: encodeImportedNumberPuzzle('f1', definition), puzzle, number: 0,
    difficulty: size <= 4 ? 'easy' : size === 5 ? 'medium' : 'hard', initialPosition, ...(givenCellColors && { givenCellColors }) }
}

type ImportedFutoshikiDefinition = {
  size: number
  givens: string
  inequalities: Inequality[]
  parity: LatinParity[]
  diagonals?: LatinDiagonal[]
  lines?: LatinLine[]
  exclusions?: LatinExclusion[]
  extrema?: LatinExtremum[]
  kropki?: LatinKropki
  givenCellColors?: ImportedCellColors
  initialPosition?: NumberPosition
}

function validFutoshikiCellColors(value: unknown, size: number): value is ImportedCellColors {
  return validImportedCellColors(value) && Object.keys(value).every(cell => Number(cell) < size ** 2)
}

export function readImportedFutoshiki(token: string): FutoshikiEntry | undefined {
  const definition = decodeImportedNumberPuzzle<ImportedFutoshikiDefinition>(token, 'f1')
  if (!definition || !isFutoshikiSize(definition.size) || typeof definition.givens !== 'string' ||
    definition.givens.length !== definition.size ** 2 || !/^\d+$/.test(definition.givens) ||
    [...definition.givens].some(digit => Number(digit) > definition.size) || !Array.isArray(definition.inequalities) ||
    !Array.isArray(definition.parity) || definition.diagonals !== undefined && !validLatinDiagonals(definition.diagonals) ||
    definition.lines !== undefined && !validLatinLines(definition.lines, definition.size) ||
    definition.exclusions !== undefined && !validLatinExclusions(definition.exclusions, definition.size) ||
    definition.extrema !== undefined && !validLatinExtrema(definition.extrema, definition.size) ||
    definition.kropki !== undefined && !validLatinKropki(definition.kropki, definition.size) ||
    definition.givenCellColors !== undefined && !validFutoshikiCellColors(definition.givenCellColors, definition.size) ||
    definition.initialPosition && !isNumberPosition(definition.initialPosition, definition.size)) return
  try {
    const entry = createImportedFutoshiki(definition.size, definition.givens, definition.inequalities, definition.parity,
      definition.initialPosition, { diagonals: definition.diagonals, lines: definition.lines, exclusions: definition.exclusions, extrema: definition.extrema,
        givenCellColors: definition.givenCellColors, kropki: definition.kropki })
    return entry.id === token ? entry : undefined
  } catch { return }
}
