import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { groupLineEdges, groupLineKey } from './group-line-key.ts'

export const modularEdges = (puzzle: VariantPuzzle) => groupLineEdges(puzzle, 'modular')
export const modularKey = (puzzle: VariantPuzzle) => groupLineKey(puzzle, 'modular', digit => digit % 3)
