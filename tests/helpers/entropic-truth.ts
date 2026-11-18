import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { assertGroupLineProof } from './group-line-truth.ts'

export function assertEntropicProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assertGroupLineProof(puzzle, proof, 'entropic')
}
