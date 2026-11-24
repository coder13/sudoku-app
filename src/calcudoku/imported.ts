import type { NumberPosition } from '../number-puzzles/progress.ts'
import { encodeImportedNumberPuzzle, decodeImportedNumberPuzzle, isNumberPosition } from '../number-puzzles/imported-codec.ts'
import type { LatinParity } from '../latin/parity.ts'
import { createCalcudoku, type Cage, type CageOperator } from './engine.ts'
import type { CalcudokuEntry } from './catalog.ts'

export type ImportedCalcudokuCage = Cage

export function createImportedCalcudoku(
  size: number, givens: string, cages: readonly ImportedCalcudokuCage[], parity: readonly LatinParity[] = [], initialPosition?: NumberPosition,
): CalcudokuEntry {
  const puzzle = createCalcudoku(size, cages, { givens: Array.from(givens, Number), parity })
  const definition = { size, givens, cages, parity, ...(initialPosition && { initialPosition }) }
  return { id: encodeImportedNumberPuzzle('c1', definition), puzzle, number: 0,
    difficulty: size <= 3 ? 'easy' : size === 4 ? 'medium' : 'hard', initialPosition }
}

type ImportedCalcudokuDefinition = {
  size: number
  givens: string
  cages: ImportedCalcudokuCage[]
  parity: LatinParity[]
  initialPosition?: NumberPosition
}

function isCageOperator(value: unknown): value is CageOperator {
  return value === 'equal' || value === 'add' || value === 'multiply' || value === 'subtract' || value === 'divide'
}

export function readImportedCalcudoku(token: string): CalcudokuEntry | undefined {
  const definition = decodeImportedNumberPuzzle<ImportedCalcudokuDefinition>(token, 'c1')
  if (!definition || !Number.isInteger(definition.size) || definition.size < 3 || definition.size > 9 ||
    typeof definition.givens !== 'string' || definition.givens.length !== definition.size ** 2 ||
    !/^\d+$/.test(definition.givens) || [...definition.givens].some(digit => Number(digit) > definition.size) ||
    !Array.isArray(definition.cages) || !Array.isArray(definition.parity) ||
    definition.initialPosition && !isNumberPosition(definition.initialPosition, definition.size)) return
  try {
    if (definition.cages.some(cage => !cage || !isCageOperator(cage.operator) || !Number.isSafeInteger(cage.target) ||
      !Array.isArray(cage.cells) || cage.distinct !== undefined && cage.distinct !== true)) return
    const entry = createImportedCalcudoku(definition.size, definition.givens, definition.cages, definition.parity, definition.initialPosition)
    return entry.id === token ? entry : undefined
  } catch { return }
}
