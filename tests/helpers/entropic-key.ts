import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { groupLineEdges, groupLineKey } from './group-line-key.ts'

export const entropicEdges = (puzzle: VariantPuzzle) => groupLineEdges(puzzle, 'entropic')
export const entropicKey = (puzzle: VariantPuzzle) => groupLineKey(puzzle, 'entropic', digit => Math.floor((digit - 1) / 3))
