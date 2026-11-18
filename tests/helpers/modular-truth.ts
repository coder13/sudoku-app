import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { assertGroupLineProof } from './group-line-truth.ts'

export function assertModularProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  assertGroupLineProof(puzzle, proof, 'modular')
}
