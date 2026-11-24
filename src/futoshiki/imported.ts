import type { NumberPosition } from '../number-puzzles/progress.ts'
import { encodeImportedNumberPuzzle, decodeImportedNumberPuzzle, isNumberPosition } from '../number-puzzles/imported-codec.ts'
import type { LatinParity } from '../latin/parity.ts'
import { createFutoshiki, type Inequality } from './engine.ts'
import type { FutoshikiEntry } from './catalog.ts'

export function isFutoshikiSize(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 3 && Number(value) <= 9
}

export function createImportedFutoshiki(
  size: number, givens: string, inequalities: readonly Inequality[], parity: readonly LatinParity[] = [], initialPosition?: NumberPosition,
): FutoshikiEntry {
  const puzzle = createFutoshiki(size, Array.from(givens, Number), inequalities, parity)
  const definition = { size, givens, inequalities, parity, ...(initialPosition && { initialPosition }) }
  return { id: encodeImportedNumberPuzzle('f1', definition), puzzle, number: 0,
    difficulty: size <= 4 ? 'easy' : size === 5 ? 'medium' : 'hard', initialPosition }
}

type ImportedFutoshikiDefinition = {
  size: number
  givens: string
  inequalities: Inequality[]
  parity: LatinParity[]
  initialPosition?: NumberPosition
}

export function readImportedFutoshiki(token: string): FutoshikiEntry | undefined {
  const definition = decodeImportedNumberPuzzle<ImportedFutoshikiDefinition>(token, 'f1')
  if (!definition || !isFutoshikiSize(definition.size) || typeof definition.givens !== 'string' ||
    definition.givens.length !== definition.size ** 2 || !/^\d+$/.test(definition.givens) ||
    [...definition.givens].some(digit => Number(digit) > definition.size) || !Array.isArray(definition.inequalities) ||
    !Array.isArray(definition.parity) || definition.initialPosition && !isNumberPosition(definition.initialPosition, definition.size)) return
  try {
    const entry = createImportedFutoshiki(definition.size, definition.givens, definition.inequalities, definition.parity, definition.initialPosition)
    return entry.id === token ? entry : undefined
  } catch { return }
}
