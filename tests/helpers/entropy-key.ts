import assert from 'node:assert/strict'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { transformedBoard } from './transformed-board.ts'

export const groupPermutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] as const

/** Literal bijections of the low/medium/high ranges and their members. */
export function entropyRenamings(): number[][] {
  const mappings: number[][] = []
  for (const groups of groupPermutations) for (const low of groupPermutations)
    for (const medium of groupPermutations) for (const high of groupPermutations)
      mappings.push([0, ...[low, medium, high].flatMap((members, group) => members.map(member => groups[group] * 3 + member + 1))])
  return mappings
}

export function relabelEntropy(board: string, mapping: readonly number[]): string {
  return [...board].map(digit => String(mapping[Number(digit)])).join('')
}

/** Enumerate all six assignments of group names under independent matrix transforms.
 * Within each group, first appearances give the least lexicographic member names.
 * This oracle accepts pure Global Entropy only, never mixed numeric rules.
 */
export function entropyKey(puzzle: VariantPuzzle): string {
  assert.ok(!puzzle.regions || puzzle.regions.type === 'boxes')
  assert.ok(puzzle.rules?.length && puzzle.rules.every(rule => rule.type === 'global-entropy'))
  const names: string[] = []
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const board = transformedBoard(puzzle.givens, symmetry)
    for (const groups of groupPermutations) {
      const members = Array.from({ length: 3 }, () => new Map<string, number>())
      names.push([...board].map(digit => {
        if (digit === '0') return digit
        const group = Math.floor((Number(digit) - 1) / 3), seen = members[group]
        if (!seen.has(digit)) seen.set(digit, seen.size + 1)
        return String(groups[group] * 3 + seen.get(digit)!)
      }).join(''))
    }
  }
  return names.sort()[0]
}
